// DELETE /api/jobs/:jobId — drop a job's working dir + caches (user-initiated
// cleanup). Safe no-op if the job no longer exists.
import { deleteJob } from '~~/server/services/job'
import { getServerConfig } from '~~/server/utils/config'

export default defineEventHandler(async (event) => {
   const c = getServerConfig()
   const jobId: string = String(getRouterParam(event, 'jobId') ?? '')

   if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid job id.' })
      }

   const result = await deleteJob(jobId, c.base)
   return { removed: result.removed }
})
