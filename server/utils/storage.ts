// Filesystem helpers for the per-job temp working area.
//
// Each upload gets `.tmp/<jobId>/` containing `data.csv` (the uploaded file)
// and `report.json` (the cached profile). This keeps the profiler memory-safe:
// it reads from a path on disk rather than holding gigabytes in a buffer.

import { mkdir, rm, stat, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

let baseDir = ''

/** Temp base directory from env / config. Re-exported for job.ts + sampleData. */
export function tmpBase(): string {
   return process.env.TMP_DIR || '.tmp'
}

/** Resolve (and memoize) the temp base directory from runtime config / env. */
export function getTmpBase(dir?: string): string {
   if (dir) baseDir = dir
   if (!baseDir) {
      baseDir = process.env.TMP_DIR || '.tmp'
   }
   return baseDir
}

/** Absolute directory for a job's files. */
export function jobDir(jobId: string, base = getTmpBase()): string {
   return join(base, sanitize(jobId))
}

export function csvPath(jobId: string, base = getTmpBase()): string {
   return join(jobDir(jobId, base), 'data.csv')
}

export function reportPath(jobId: string, base = getTmpBase()): string {
   return join(jobDir(jobId, base), 'report.json')
}

/** Only allow safe job ids (uuids / hex / alnum / dash) to avoid path traversal. */
export function sanitize(jobId: string): string {
   return /^[A-Za-z0-9_-]{1,64}$/.test(jobId) ? jobId : `job_${jobId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64)
}

export async function ensureJobDir(jobId: string, base = getTmpBase()): Promise<string> {
   const dir = jobDir(jobId, base)
   await mkdir(dir, { recursive: true })
   return dir
}

export async function removeJobFiles(jobId: string, base = getTmpBase()): Promise<void> {
   await rm(jobDir(jobId, base), { recursive: true, force: true }).catch(() => {})
}

export async function jobFilesExist(jobId: string, base = getTmpBase()): Promise<boolean> {
   try {
      await stat(csvPath(jobId, base))
      return true
   } catch {
      return false
   }
}

/** List on-disk job directories (best-effort; used by the cleanup plugin). */
export async function listJobIds(base = getTmpBase()): Promise<string[]> {
   try {
      const entries = await readdir(base, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
   } catch {
      return []
   }
}

/** Serialize a report to disk for cross-request caching. */
export async function saveReport(jobId: string, report: unknown, base = getTmpBase()): Promise<void> {
   const dir = jobDir(jobId, base)
   await mkdir(dir, { recursive: true })
   await writeFile(reportPath(jobId, base), JSON.stringify(report))
}

/** Read a previously cached report from disk, or null if absent/invalid. */
export async function loadReport<T = unknown>(jobId: string, base = getTmpBase()): Promise<T | null> {
   try {
      const raw = await readFile(reportPath(jobId, base), 'utf8')
      return JSON.parse(raw) as T
   } catch {
      return null
   }
}
