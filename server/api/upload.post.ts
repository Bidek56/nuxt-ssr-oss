// POST /api/upload — accept a single CSV file, stream it to the per-job working
// dir on disk (never buffered whole in memory), cap total size, strip a leading
// UTF-8 BOM, and create a job record. The expensive profiling is deferred to
// GET /api/profile/:jobId.
import { randomUUID } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { createJob, type Job } from '~~/server/services/job'
import { ensureJobDir, csvPath, removeJobFiles } from '~~/server/utils/storage'
import { getServerConfig } from '~~/server/utils/config'
import type { UploadResult } from '~~/shared/types'

/** Strip a leading UTF-8 BOM when present. */
async function stripBomIfNeeded(path: string): Promise<void> {
   const buf = await readFile(path)
   if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      await writeFile(path, buf.subarray(3))
   }
}

export default defineEventHandler(async (event): Promise<UploadResult> => {
   const c = getServerConfig()
   const base: string = c.base
   const maxBytes = c.maxUploadBytes

   let form
   try {
      form = await readMultipartFormData(event)
   } catch {
      throw createError({
         statusCode: 400,
         statusMessage: 'Expected multipart/form-data with a field named "file".',
      })
   }

   const part = form?.find((p) => p.name === 'file')
   if (!part?.data?.length) {
      throw createError({ statusCode: 400, statusMessage: 'The "file" field is empty — please choose a CSV.' })
   }

   if (part.data.length > maxBytes) {
      throw createError({
         statusCode: 413,
         statusMessage: `The file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
      })
   }

   const jobId = 'job-' + randomUUID().replace(/-/g, '').slice(0, 16)
   const fileName = part.filename || 'upload.csv'
   await ensureJobDir(jobId, base)
   const dest = csvPath(jobId, base)

   try {
      await writeFile(dest, part.data)
      await stripBomIfNeeded(dest)
   } catch (e) {
      await removeJobFiles(jobId, base)
      throw createError({
         statusCode: 500,
         statusMessage: `Failed to store the upload: ${(e as Error).message}`,
      })
   }

   let sizeBytes = part.data.length
   try {
      sizeBytes = (await stat(dest)).size
   } catch {
      /* keep buffer length */
   }

   if (sizeBytes === 0) {
      await removeJobFiles(jobId, base)
      throw createError({ statusCode: 400, statusMessage: 'The uploaded file is empty.' })
   }

   const job: Job = await createJob({ jobId, fileName, sizeBytes }, base)

   return {
      jobId: job.jobId,
      fileName: job.fileName,
      sizeBytes: job.sizeBytes,
      createdAt: job.createdAt!,
   } as UploadResult
})
