// GET /api/sample-profile — profile the built-in demo dataset. A fixed route so
// the landing page / "try the demo" flow works without an upload, exercising the
// exact same profiling pipeline as real uploads.
import { getDemoJob } from '~~/server/utils/sampleData'
import { getJob, markReportCached, getCachedReport, putCachedReport, createJob } from '~~/server/services/job'
import { buildProfile } from '~~/server/services/profile'
import { loadReport } from '~~/server/utils/storage'
import { getServerConfig } from '~~/server/utils/config'
import { runProfileTask } from '~~/server/utils/profileQueue'
import type { ProfileReport } from '~~/shared/types'

export default defineEventHandler(async (): Promise<ProfileReport> => {
   const c = getServerConfig()
   const jobId = 'demo'

      // Short-circuit on a cached report (in-memory first, then disk).
   const memo = getCachedReport(jobId)
   if (memo) return memo

   const onDisk = await loadReport<ProfileReport>(jobId, c.base)
   if (onDisk) {
      await createJob({ jobId, fileName: onDisk.dataset?.fileName, sizeBytes: onDisk.dataset?.approxSizeBytes }, c.base)
      putCachedReport(jobId, onDisk, c.jobTtlMs)
      return onDisk
        }

   const demo = await getDemoJob(5_000, c.base)
   let job = (await getJob(jobId, c.base)) ?? (await createJob({ jobId, fileName: demo.fileName, sizeBytes: demo.sizeBytes }, c.base))
   const report = await runProfileTask(
      () =>
         buildProfile(job.csvPath, jobId, job.fileName, job.sizeBytes || demo.sizeBytes, {
            sampleRows: c.sampleRows,
            previewRows: c.previewRows,
            histogramBins: c.histogramBins,
            topValues: c.topValues,
         }),
      { concurrency: c.profileConcurrency, timeoutMs: c.profileTimeoutMs },
   )

   putCachedReport(jobId, report, c.jobTtlMs)
   await markReportCached(jobId)
   return report
})
