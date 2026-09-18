// Shared profile type definitions.
//
// This file is intentionally PURE TYPES (no runtime imports) and is imported
// type-only (`import type { ... } from '@shared/types'`) from BOTH the Nuxt
// client (app/**) and the Nitro server (server/**). Because every import is
// type-only it is fully erased at build time, so it can NEVER pull the native
// `nodejs-polars` binary into the client bundle.
//
// The client and server both serialize/deserialize this shape as JSON over the
// /api/profile contract, so it is the single source of truth for that boundary.

export type DType =
  | 'Integer'
  | 'Float'
  | 'Boolean'
  | 'Date'
  | 'Time'
  | 'Duration'
  | 'String'
  | 'Other'

export type ColumnSeverity = 'ok' | 'warn' | 'error'
export type QualityLevel = 'ok' | 'info' | 'warn' | 'error'

export interface HistogramBin {
  value: number   // lower bound of the bin
  count: number
}

export interface TopValue {
  label: string
  count: number
  pct: number
}

export interface ColumnProfile {
  name: string
  dtype: DType
  dtypeRaw: string
  rowCount: number
  nullCount: number
  nullPct: number
  distinctCount: number
  cardinalityRatio: number   // distinct / rowCount (sampled)
  isCategorical: boolean
  sampled: boolean
  numeric?: {
    min: number
    max: number
    mean: number
    median: number
    std: number
    q1: number
    q3: number
    histogram: HistogramBin[]
  }
  boolean?: {
    trueCount: number
    falseCount: number
    truePct: number
    falsePct: number
  }
  textual?: {
    minLen: number
    maxLen: number
    avgLen: number
    topValues: TopValue[]
  }
  topValues?: TopValue[]
  issues: QualityMessage[]
}

export interface QualityMessage {
  level: QualityLevel
  column?: string
  message: string
}

export interface ProfileReport {
  jobId: string
  generatedAt: string
  polarsVersion: string
  dataset: {
    fileName: string
    rowCount: number
    columnCount: number
    approxSizeBytes: number
    readMs: number
    duplicateRowCount: number
    duplicateRowPct: number
    sampleRows: number
    sampleUsed: boolean
  }
  columns: ColumnProfile[]
  previewRows: Array<Record<string, unknown>>
  previewColumns: string[]
  qualitySummary: QualityMessage[]
}

// Cheap metadata returned by /api/upload before the expensive profile runs.
export interface UploadResult {
  jobId: string
  fileName: string
  sizeBytes: number
  createdAt: string
}

export interface JobSummary {
  jobId: string
  fileName: string
  sizeBytes: number
  createdAt: string
}
