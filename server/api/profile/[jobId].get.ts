// GET /api/profile/:jobId — return the profile report for a job.
//
// First run executes the (heavier) profiling with nodejs-polars and caches the
// result both in memory and on disk (report.json) so repeat visits to the same
// report URL are instant and shareable. Subsequent reads short-circuit.
import { getJob, markReportCached, getCachedReport, putCachedReport, createJob } from '~~/server/services/job'
import { buildProfile } from '~~/server/services/profile'
import { loadReport } from '~~/server/utils/storage'
import { getServerConfig } from '~~/server/utils/config'
import { runProfileTask } from '~~/server/utils/profileQueue'
import type { ProfileReport } from '~~/shared/types'

export default defineEventHandler(async (event): Promise<ProfileReport> => {
   const c = getServerConfig()
   const jobId: string = String(getRouterParam(event, 'jobId') ?? '')

   if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid job id.' })
       }

   const ttlMs = c.jobTtlMs

       // 1) In-memory cache (same process, after a prior request).
   const memo = getCachedReport(jobId)
   if (memo) return memo

       // 2) Disk-cached report survives process restarts within the TTL.
   const onDisk = await loadReport<ProfileReport>(jobId, c.base)
   if (onDisk) {
      await createJob({ jobId, fileName: onDisk.dataset?.fileName, sizeBytes: onDisk.dataset?.approxSizeBytes }, c.base)
      putCachedReport(jobId, onDisk, ttlMs)
      return onDisk
          }

       // 3) No cached report — resolve the job (or reconstruct from disk files) and build.
   let job = await getJob(jobId, c.base)
   if (!job) {
          // The process restarted or the dir was created elsewhere; try to
          // rebuild the record from the on-disk CSV if it still exists.
      const recovered = await createJob({ jobId, fileName: 'upload.csv' }, c.base)
      job = recovered
          }

   let report: ProfileReport
   try {
      report = await runProfileTask(
         () =>
            buildProfile(job.csvPath, jobId, job.fileName, job.sizeBytes, {
               sampleRows: c.sampleRows,
               previewRows: c.previewRows,
               histogramBins: c.histogramBins,
               topValues: c.topValues,
            }),
         { concurrency: c.profileConcurrency, timeoutMs: c.profileTimeoutMs },
      )
   } catch (e) {
      const msg = (e as Error).message || 'Profiling failed.'
      const code = msg.includes('timed out') ? 504 : 500
      throw createError({ statusCode: code, statusMessage: msg })
   }
   // buildProfile persists report.json itself; register it in the caches too.
   putCachedReport(jobId, report, ttlMs)
   await markReportCached(jobId)

   return report
})
