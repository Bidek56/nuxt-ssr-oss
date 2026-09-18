// server/plugins/cleanup.ts — Nitro plugin.
//
// Periodically prunes expired job material so the single-instance temp dir does
// not grow unbounded:
//      * the in-memory job map is capped (oldest inserted first)
//      * on-disk job dirs older than `jobTtlMs` are removed
//      * the in-memory report cache drops entries past their TTL
//
// It is intentionally best-effort and never throws into the request path.
import { stat, rm } from 'node:fs/promises'
import { jobDir, listJobIds } from '~~/server/utils/storage'
import { evictStale, gcReportCache } from '~~/server/services/job'
import { getServerConfig } from '~~/server/utils/config'

export default defineNitroPlugin(async (nitroApp) => {
   const c = getServerConfig()
   const base: string = c.base
   const ttlMs = c.jobTtlMs
   const maxJobs = 64

   const sweep = async () => {
      try {
           // in-memory caps
        evictStale(base, maxJobs)
        gcReportCache(ttlMs)

           // disk sweep
        const ids = await listJobIds(base)
        const cutoff = Date.now() - ttlMs
        for (const id of ids) {
              // keep the demo dir so the landing demo always works
            if (id === 'demo') continue
            const dir = jobDir(id, base)
            let mtime = 0
            try {
               mtime = (await stat(dir)).mtimeMs
             } catch {
               continue
             }
            if (mtime < cutoff) {
               await rm(dir, { recursive: true, force: true }).catch(() => {})
       nitroApp.log.debug?.(`pruned expired job dir: ${id}`)
               }
            }
        } catch (err) {
      nitroApp.log.warn?.(`cleanup sweep failed: ${(err as Error)?.message}`)
        }
   }

   await sweep()

   const interval = setInterval(() => void sweep(), Math.max(60_000, Math.floor(ttlMs / 2)))
      // do not keep the event loop alive for the sake of this plugin
   if (typeof interval.unref === 'function') interval.unref()

   nitroApp.hooks.hookClose?.(() => {
      clearInterval(interval)
      nitroApp.log.info?.('cleanup plugin stopped')
     })
})
