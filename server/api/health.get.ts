// GET /api/health — liveness + the native engine version. The Polars version is
// only ever read server-side (via the sole native facade), so this endpoint
// proves the nodejs-polars binary is loaded and usable in this runtime.
import { polarsVersion } from '~~/server/utils/polars'
import { listJobIds } from '~~/server/utils/storage'
import { evictStale } from '~~/server/services/job'
import { getServerConfig } from '~~/server/utils/config'

export default defineEventHandler(async () => {
   const c = getServerConfig()

       // best-effort: prune stale in-memory jobs (disk sweep is on a schedule)
   try {
      evictStale(c.base, 64)
      } catch {
      }

   const jobIds = await listJobIds(c.base)

   return {
      status: 'ok',
      polarsVersion: polarsVersion(),
      runtime: (process as any).versions?.bun ? 'bun' : 'node',
      runtimeVersion: (process as any).versions?.bun ?? (process as any).versions?.node,
      arch: process.arch,
      platform: process.platform,
      sampleRows: c.sampleRows,
      maxUploadBytes: c.maxUploadBytes,
      activeJobsOnDisk: jobIds.length,
      appName: c.appName,
      checkedAt: new Date().toISOString(),
      }
})
