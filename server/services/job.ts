// In-process job registry with an on-disk metadata sidecar.
//
// The registry lives in memory for the common (single-instance) case, but every
// job also writes `meta.json` into its job dir so the server can recover the
// job after a restart. To make the job store multi-instance safe in the future,
// swap `jobs`/`reportCache` for a Redis/DB-backed implementation behind these
// functions.

import { readFile, writeFile } from 'node:fs/promises'
import { csvPath, ensureJobDir, jobDir, removeJobFiles, tmpBase } from '../utils/storage'
import type { JobSummary, ProfileReport } from '../../shared/types'

/** Authoritative per-job metadata. Persisted as `<jobDir>/meta.json`. */
export interface Job {
   jobId: string
   csvPath: string
   fileName: string
   sizeBytes: number
   createdAt: string
   reportCached: boolean
}

const jobs = new Map<string, Job>()

// report cache: in-memory + on-disk JSON (see storage.ts helpers).
const reportCache = new Map<string, { report: ProfileReport; at: number }>()

export interface CreateJobInput {
   jobId: string
   fileName: string
   sizeBytes: number
   createdAt?: string
}

export async function createJob(input: CreateJobInput, base = tmpBase()): Promise<Job> {
   const job: Job = {
      jobId: input.jobId,
      csvPath: csvPath(input.jobId, base),
      fileName: input.fileName || 'upload.csv',
      sizeBytes: input.sizeBytes ?? 0,
      createdAt: input.createdAt ?? new Date().toISOString(),
      reportCached: false,
   }
   jobs.set(job.jobId, job)

    // Persist a sidecar so the job survives a restart. Best-effort.
   const meta = {
      jobId: job.jobId,
      fileName: job.fileName,
      sizeBytes: job.sizeBytes,
      createdAt: job.createdAt,
      reportCached: false,
   }
   try {
      const dir = await ensureJobDir(input.jobId, base)
      await writeFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2))
   } catch {
      /* best-effort persistence */
   }

   evictStale(base)
   return job
}

export async function getJob(jobId: string, base = tmpBase()): Promise<Job | undefined> {
   const cached = jobs.get(jobId)
   if (cached) return cached

    // Recover from disk after a restart.
   try {
      const meta = JSON.parse(await readFile(`${jobDir(jobId, base)}/meta.json`, 'utf8')) as Pick<
         Job,
         'jobId' | 'fileName' | 'sizeBytes' | 'createdAt'
      >
      const job: Job = {
         ...meta,
         csvPath: csvPath(jobId, base),
         reportCached: false,
      }
      jobs.set(jobId, job)
      return job
   } catch {
      return undefined
   }
}

export async function markReportCached(jobId: string): Promise<void> {
   const job = jobs.get(jobId)
   if (job) job.reportCached = true
}

export async function deleteJob(jobId: string, base = tmpBase()): Promise<{ removed: boolean }> {
   const existed = jobs.has(jobId)
   jobs.delete(jobId)
   reportCache.delete(jobId)
   await removeJobFiles(jobId, base)
   return { removed: existed }
}

export function toSummary(job: Job): JobSummary {
   return {
      jobId: job.jobId,
      fileName: job.fileName,
      sizeBytes: job.sizeBytes,
      createdAt: job.createdAt,
   }
}

/** Evict the least-recently-inserted in-memory jobs when over capacity. */
export function evictStale(base = tmpBase(), maxJobs = 64): void {
   void base
   if (jobs.size <= maxJobs) return
   const over = jobs.size - maxJobs
   const it = jobs.keys()
   for (let i = 0; i < over; i++) {
      const key = it.next().value
      if (key === undefined) break
      jobs.delete(key)
   }
}

export function getCachedReport(jobId: string): ProfileReport | undefined {
   return reportCache.get(jobId)?.report
}

export function putCachedReport(jobId: string, report: ProfileReport, ttlMs = 60 * 60 * 1000): ProfileReport {
   reportCache.set(jobId, { report, at: Date.now() })
   if (reportCache.size > 128) {
      const cutoff = Date.now() - ttlMs
      for (const [k, v] of reportCache) if (v.at < cutoff) reportCache.delete(k)
}
   return report
}

/** Drop in-memory reports older than `ttlMs`. Intended for the cleanup sweep. */
export function gcReportCache(ttlMs = 30 * 60 * 1000): number {
   const cutoff = Date.now() - ttlMs
   let removed = 0
   for (const [k, v] of reportCache) {
      if (v.at < cutoff) {
         reportCache.delete(k)
         removed++
        }
      }
   return removed
}
