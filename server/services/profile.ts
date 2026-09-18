// PROFILES A CSV FILE SERVER-SIDE WITH NODEJS-POLARS.
// ---------------------------------------------------------------------------
// This module never imports `nodejs-polars` directly — it imports the `pl`
// facade from `../utils/polars`, the one file that owns the native import.
//
// Cost strategy:
//    * null counts, min/max/mean/median/std/quantiles run in a small number of
//      native Polars passes over the FULL data (cheap, parallel).
//    * cardinality, top-values and histograms run over a bounded SAMPLE
//      (<= sampleRows rows) so a 50M-row file cannot OOM or hang.
//    * duplicate-row detection is skipped past `dupCheckCap` rows.
//
// NOTE: `nodejs-polars` typings are loose, so native objects are handled via
// `any` casts at the call boundary. Correctness is enforced at runtime.
// ---------------------------------------------------------------------------

import { pl, polarsVersion } from '../utils/polars'
import { saveReport } from '../utils/storage'
import { stat as fsStat } from 'node:fs/promises'
import type {
   ColumnProfile,
   DType,
   HistogramBin,
   ProfileReport,
   QualityMessage,
   TopValue,
} from '../../shared/types'

export interface ProfileOptions {
   sampleRows?: number
   previewRows?: number
   histogramBins?: number
   topValues?: number
   dupCheckCap?: number
   nThreads?: number
}

const DEFAULTS: Required<ProfileOptions> = {
   sampleRows: 100_000,
   previewRows: 25,
   histogramBins: 30,
   topValues: 10,
   dupCheckCap: 2_000_000,
   nThreads: 0,
}

// Polars dtypes we care about, matched by their `DataType` string.
const RE_NUMERIC = /^\s*(int|uint|float|f\d+|i\d+|I\d+|UINT|INT|FLOAT)/i
const RE_BOOL = /^\s*Bool\b/i
const RE_STRING = /^\s*(String|Utf8|LargeString)\b/i
const RE_DATE = /\bDate\b/i
const RE_DURATION = /\bDuration\b/i
const RE_TIME = /\bTime\b(?!stamp)/i

/** Parse e.g. "DataType(Int64)" / "Int64" -> "Int64". */
function extractType(raw: string): string {
   const m = raw.match(/DataType\(([^)\s]+)/)
   return m ? m[1] : raw.replace(/DataType\(|\)/g, '').trim()
}

/**
 * Robust dtype resolution. `df.schema[col].DataType` and `df.dtypes[i].DataType`
 * both return undefined for read_csv() frames in nodejs-polars 0.26.x, but
 * `String(df.dtypes[i])` yields "DataType(Int64)", so we parse that string and
 * fall back through the schema map and finally a per-series `.dtype` read.
 */
function buildDtypeMap(df: any, columns: string[]): Map<string, string> {
   const map = new Map<string, string>()
   const dt: any = df?.dtypes ?? []
   for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      let raw: string = ''
      if (Array.isArray(dt) && dt[i] !== undefined) {
         raw = String(dt[i])
         const t = extractType(raw)
         if (t) raw = t
         } else if (df?.schema?.[col]?.DataType) {
         raw = String(df.schema[col].DataType)
         } else {
         try {
            raw = extractType(String(df.getColumn(col).dtype))
           } catch {
            raw = ''
            }
          }
      map.set(col, raw || 'String')
      }
   return map
}

function classify(raw: string): DType {
   if (RE_BOOL.test(raw)) return 'Boolean'
   if (RE_NUMERIC.test(raw)) return /loat|F\d+|f\d+/i.test(raw) ? 'Float' : 'Integer'
   if (RE_DURATION.test(raw)) return 'Duration'
   if (RE_DATE.test(raw)) return 'Date'
   if (RE_TIME.test(raw)) return 'Time'
   if (RE_STRING.test(raw)) return 'String'
   return 'Other'
}

function toNum(v: unknown): number | null {
   if (v === null || v === undefined) return null
   const n = Number(v)
   return Number.isFinite(n) ? n : null
}

function round(n: number | null | undefined, dp = 4): number | null {
   if (n === null || n === undefined || Number.isNaN(n)) return null
   const f = 10 ** dp
   return Math.round(n * f) / f
}

function safe<T>(fn: () => T): T | undefined {
   try { return fn() } catch { return undefined }
}

function safeObject<T>(fn: () => T): T {
   try {
      return fn()
   } catch {
      return undefined as unknown as T
   }
}

function pct(x: number): string {
   return (x * 100).toFixed(0)
}

let _binSeq = 0
function binKey(s: string): number {
   let h = 0
   for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
   return (h & 0xffff) || (++_binSeq & 0xffff)
}

function formatLabel(v: unknown): string {
   if (v === null || v === undefined) return 'null'
   const s = String(v)
   return s.length > 80 ? `${s.slice(0, 77)}...` : s
}

/**
 * The main entry point. Reads a CSV from `path` and returns a typed
 * `ProfileReport`. All heavy per-column work is bounded by `sampleRows`.
 */
export async function buildProfile(
  path: string,
  jobId: string,
  fileName: string,
  approxSizeBytes: number,
  opts: Partial<ProfileOptions> = {},
): Promise<ProfileReport> {
   const o: Required<ProfileOptions> = { ...DEFAULTS, ...opts }
   const t0 = performance.now()

     // Resolve a real on-disk size when the caller did not supply one
     // (e.g. recovered jobs after a restart).
   let sizeBytes = approxSizeBytes > 0 ? approxSizeBytes : 0
   if (!sizeBytes) {
      try {
         sizeBytes = (await fsStat(path)).size
     } catch {
        sizeBytes = 0
        }
       }

   // ---- 1. Load (streaming / low-memory) --------------------------------
   const readOpts: Record<string, unknown> = {
      inferSchemaLength: 1000,
      lowMemory: true,
      hasHeader: true,
    }
   if (o.nThreads > 0) readOpts.nThreads = o.nThreads

   let df: any
   let loadError: string | null = null
   try {
      df = pl.readCSV(path, readOpts)
   } catch (err) {
      loadError = (err as Error)?.message ?? String(err)
   }

   const height: number = (df?.shape?.height ?? df?.height ?? 0) as number
   if (!df) {
      throw new Error(`Could not read "${fileName}" as CSV: ${loadError ?? 'unknown error'}`)
   }

   const columnNames: string[] = [...(df.columns ?? [])]
   const dtypeMap = buildDtypeMap(df, columnNames)
   const rawDtype = (c: string): string => dtypeMap.get(c) ?? 'String'

   // exact null counts in a single native pass over the full frame
   const nullCountsRow = safeObject(() =>
      (df?.nullCount()?.toObject() ?? {}) as Record<string, number[]>,
    )
   const nullCountOf = (c: string): number => nullCountsRow[c]?.[0] ?? 0

   // ---- 2. Sample for bounded heavy stats --------------------------------
   const sampleUsed = height > o.sampleRows
   const sub: any = sampleUsed
      ? (safe(() => df.sample(o.sampleRows, 'sample')) ?? df)
      : df
   const subHeight: number = ((sub?.shape?.height ?? sub?.height ?? height) as number)

   // ---- 3. Numeric aggregates: one batched native pass over numeric cols --
   const numericCols = columnNames.filter((c) => {
      const d = classify(rawDtype(c))
      return d === 'Integer' || d === 'Float'
   })

   interface NumStats {
      min: number | null
      max: number | null
      mean: number | null
      median: number | null
      std: number | null
      q1: number | null
      q3: number | null
   }
   const numStats: Record<string, NumStats> = {}
   const emptyNumStats = (): NumStats => ({
      min: null, max: null, mean: null, median: null, std: null, q1: null, q3: null,
   })

   if (numericCols.length) {
      // A null byte never appears in a CSV header, so it makes a safe
      // separator for synthesising unique aggregate column names.
      const SEP = String.fromCharCode(0)
      const exprs: unknown[] = []
      for (const c of numericCols) {
         const col = pl.col(c)
         exprs.push(
            col.min().alias(`${c}${SEP}min`),
            col.max().alias(`${c}${SEP}max`),
            col.mean().alias(`${c}${SEP}mean`),
            col.median().alias(`${c}${SEP}median`),
            col.std().alias(`${c}${SEP}std`),
            col.quantile(0.25, 'linear').alias(`${c}${SEP}q1`),
            col.quantile(0.75, 'linear').alias(`${c}${SEP}q3`),
         )
      }
      const statRow = safeObject(() =>
         (df.select([...exprs]).toObject() ?? {}) as Record<string, unknown[]>,
      )
      for (const c of numericCols) {
         const g = (suffix: string) => round(statRow[`${c}${SEP}${suffix}`]?.[0] as number | undefined)
         numStats[c] = {
            min: g('min'),
            max: g('max'),
            mean: g('mean'),
            median: g('median'),
            std: g('std'),
            q1: g('q1'),
            q3: g('q3'),
         }
      }
   }

   // ---- 4. Per-column profiles ------------------------------------------
   const columns: ColumnProfile[] = []
   const quality: QualityMessage[] = []

   for (const c of columnNames) {
      const dtype: DType = classify(rawDtype(c))
      const nullCount = nullCountOf(c)
      const nullPct = height > 0 ? nullCount / height : 0
      const isNumeric = dtype === 'Integer' || dtype === 'Float'

      const series: any = safe(() => sub.getColumn(c))
      if (!series) continue

      // cardinality + top values run over the sample (bounded cost).
      const distinctCount: number =
         toNum((series as { nUnique?: () => unknown }).nUnique?.call(series)) ?? 0
      const cardinalityRatio = subHeight > 0 ? distinctCount / subHeight : 0
      const topValues = extractTopValues(series, o.topValues, subHeight)
      const isCategorical = cardinalityRatio < 0.5 && distinctCount <= 10_000

      const cp: ColumnProfile = {
         name: c,
         dtype,
         dtypeRaw: rawDtype(c),
         rowCount: height,
         nullCount,
         nullPct,
         distinctCount,
         cardinalityRatio,
         isCategorical,
         sampled: sampleUsed,
         issues: [],
      }

      // numeric branch
      if (isNumeric) {
         const st = numStats[c] ?? emptyNumStats()
         cp.numeric = {
            min: st.min,
            max: st.max,
            mean: st.mean,
            median: st.median,
            std: st.std,
            q1: st.q1,
            q3: st.q3,
            histogram: buildHistogram(sub, c, st, o.histogramBins),
         }
      }

      // boolean branch
      if (dtype === 'Boolean') {
         cp.boolean = boolStats(topValues)
      }

      // textual branch
      if (dtype === 'String') {
         cp.textual = stringStats(series, topValues)
      }

      // categorical (low-cardinality non-numeric) top values
      if (cp.isCategorical && dtype !== 'Boolean' && dtype !== 'String') {
         cp.topValues = topValues
      }

      collectIssues(cp, quality)
      columns.push(cp)
   }

   // ---- 5. Duplicate-row detection (capped) ------------------------------
   let duplicateRowCount = 0
   if (height > 0 && height <= o.dupCheckCap) {
      const uniqueRows = safe(() => {
         const u = df.unique()
         return (u?.shape?.height ?? u?.height ?? 0) as number
      })
      if (typeof uniqueRows === 'number') {
         duplicateRowCount = Math.max(0, height - uniqueRows)
      }
   }

   // ---- 6. Preview rows (first N, full data) -----------------------------
   const previewColumns = columnNames
   const previewRowsOut: Array<Record<string, unknown>> = []
   try {
      const head = df.head(Math.min(o.previewRows, height || o.previewRows))
      const obj = (head.toObject() ?? {}) as Record<string, unknown[]>
      const n = obj[previewColumns[0]]?.length ?? 0
      for (let i = 0; i < n; i++) {
         const row: Record<string, unknown> = {}
         for (const col of previewColumns) {
            row[col] = obj[col]?.[i] ?? null
         }
         previewRowsOut.push(row)
      }
   } catch {
      /* preview is best-effort */
   }

   const readMs = round(performance.now() - t0, 2)

   const report: ProfileReport = {
      jobId,
      generatedAt: new Date().toISOString(),
      polarsVersion: polarsVersion(),
      dataset: {
         fileName,
         rowCount: height,
         columnCount: columnNames.length,
         approxSizeBytes: sizeBytes,
         readMs,
         duplicateRowCount,
         duplicateRowPct: height > 0 ? duplicateRowCount / height : 0,
         sampleRows: sampleUsed ? o.sampleRows : height,
         sampleUsed,
      },
      columns,
      previewRows: previewRowsOut,
      previewColumns,
      qualitySummary: quality,
   }

   // persist serialized report for cross-request caching (best-effort)
   saveReport(jobId, report).catch(() => {})

   return report
}

// --------------------------------------------------------------------------
// Extractors / helpers
// --------------------------------------------------------------------------

/** Pull the most common values from a series via native value_counts. */
function extractTopValues(series: any, topN: number, denom: number): TopValue[] {
   try {
      const vc = series?.valueCounts?.()
      const obj = (vc?.toObject?.() ?? {}) as Record<string, unknown[]>
      const keys = Object.keys(obj)
      if (keys.length < 2) return []
      const valueKey = keys.find((k) => k.toLowerCase() !== 'count') ?? keys[0]
      const values = obj[valueKey] ?? []
      const counts = (obj['count'] as number[]) ?? []
      const out: TopValue[] = values.map((v, i) => ({
         label: formatLabel(v),
         count: Number(counts[i]) || 0,
         pct: denom > 0 ? (Number(counts[i]) || 0) / denom : 0,
      }))
      out.sort((a, b) => b.count - a.count)
      return out.slice(0, topN)
   } catch {
      return []
   }
}

/** Evenly-binned histogram for a numeric column, computed over the sample. */
function buildHistogram(
   sub: any,
   col: string,
   st: { min: number | null; max: number | null },
   bins: number,
): HistogramBin[] {
   const { min, max } = st
   if (min === null || max === null) return []
   if (min === max) return [{ value: min, count: 1 }]

   try {
      const width = (max - min) / bins
      const binColName = `__bin_${binKey(col)}`
      const binned = sub.select([pl.col(col).sub(min).div(width).floor().alias(binColName)])
      const vc = (binned?.getColumn(binColName) as any)?.valueCounts?.()
      const obj = (vc?.toObject?.() ?? {}) as Record<string, (number | string | null)[]>
      const keys = Object.keys(obj)
      if (keys.length < 2) return []

      const idxArr = obj[keys[0]] ?? []  // bin index (integral float)
      const cntArr = obj[keys[1]] ?? []  // 'count'
      const byIndex = new Map<number, number>()
      byIndex.set(bins, 0) // slot for any overflow bucket

      for (let i = 0; i < idxArr.length; i++) {
         const raw = idxArr[i]
         const rawNum = Number(raw)
         if (raw === null || raw === undefined || Number.isNaN(rawNum)) continue // drop null bins
         const idx = Math.trunc(rawNum)
         byIndex.set(idx, (byIndex.get(idx) ?? 0) + (Number(cntArr[i]) || 0))
      }

      const out: HistogramBin[] = []
      for (let i = 0; i < bins; i++) {
         out.push({ value: round(min + i * width, 3), count: byIndex.get(i) ?? 0 })
      }
      const overflow = byIndex.get(bins) ?? 0
      if (overflow && out[out.length - 1]) out[out.length - 1].count += overflow
      return out
   } catch {
      return []
   }
}

function boolStats(topValues: TopValue[]): {
   trueCount: number
   falseCount: number
   truePct: number
   falsePct: number
} {
   let trueCount = 0
   let falseCount = 0
   let total = 0
   for (const tv of topValues) {
      total += tv.count
      const l = tv.label.toLowerCase()
      if (l === 'true' || l === '1' || l === 'yes' || l === 'y') trueCount += tv.count
      else falseCount += tv.count
   }
   return {
      trueCount,
      falseCount,
      truePct: total > 0 ? trueCount / total : 0,
      falsePct: total > 0 ? falseCount / total : 0,
   }
}

function stringStats(
   series: any,
   topValues: TopValue[],
): { minLen: number; maxLen: number; avgLen: number; topValues: TopValue[] } {
   let minLen = Infinity
   let maxLen = 0
   let sum = 0
   let n = 0
   try {
      const arr: unknown[] = Array.from(series) as unknown[]
      for (const v of arr) {
         if (v === null || v === undefined) continue
         const len = String(v).length
         sum += len
         n++
         if (len < minLen) minLen = len
         if (len > maxLen) maxLen = len
      }
   } catch {
      /* best-effort */
   }
   if (n === 0) return { minLen: 0, maxLen: 0, avgLen: 0, topValues }
   return {
      minLen: minLen === Infinity ? 0 : minLen,
      maxLen,
      avgLen: round(sum / n, 2),
      topValues,
   }
}

function collectIssues(cp: ColumnProfile, quality: QualityMessage[]): void {
   const name = cp.name

   // missingness
   if (cp.nullPct >= 0.5) {
      quality.push({ level: 'error', column: name, message: `${pct(cp.nullPct)}% of values in "${name}" are missing.` })
   } else if (cp.nullPct >= 0.2) {
      quality.push({ level: 'warn', column: name, message: `High missingness in "${name}" (${pct(cp.nullPct)}% null).` })
   }

   // constant / single-value
   if (cp.distinctCount <= 1) {
      quality.push({ level: 'warn', column: name, message: `Column "${name}" is constant — ${cp.distinctCount} distinct value(s).` })
   }

   // numeric
   if (cp.numeric) {
      if (cp.numeric.std === 0 && cp.distinctCount > 1) {
         quality.push({ level: 'info', column: name, message: `Column "${name}" has zero variance.` })
      }
      if (cp.numeric.min === null && cp.numeric.max === null) {
         quality.push({ level: 'warn', column: name, message: `Numeric column "${name}" has no values.` })
      }
   }

   // textual emptiness
   if (cp.textual && cp.textual.avgLen === 0 && cp.nullPct < 0.01) {
      quality.push({ level: 'warn', column: name, message: `Column "${name}" appears to be all empty strings.` })
   }
}
