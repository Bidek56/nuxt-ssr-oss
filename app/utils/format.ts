// Client-isomorphic formatting helpers. No Node-only or Vue-only APIs, so these
// are safe to use in SSR, the client bundle, and tests.

/** Human-readable byte size: 1536 -> "1.5 KB". */
export function formatBytes(n: number, digits = 1): string {
   if (!Number.isFinite(n) || n <= 0) return '0 B'
   const units = ['B', 'KB', 'MB', 'GB', 'TB']
   const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
   const value = n / Math.pow(1024, i)
   return `${i === 0 ? value.toFixed(0) : value.toFixed(digits)} ${units[i]}`
}

/** Group large numbers with commas: 12345 -> "12,345". */
export function formatNumber(n: number, digits = 0): string {
   if (!Number.isFinite(n)) return '—'
   return n.toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    })
}

/** Ratio 0..1 -> "12.3%". */
export function formatPct(ratio: number, digits = 1): string {
   if (!Number.isFinite(ratio)) return '—'
   return `${(ratio * 100).toFixed(digits)}%`
}

/** Round a value for display without floating-point noise. */
export function round(n: number, digits = 3): number {
   if (!Number.isFinite(n)) return NaN
   const f = Math.pow(10, digits)
   return Math.round(n * f) / f
}

/** Compact a large integer (e.g. 12000 -> "12k"). */
export function compactNumber(n: number): string {
   if (!Number.isFinite(n)) return '—'
   if (n < 1000) return String(n)
   if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
   return `${(n / 1_000_000).toFixed(1)}M`
}

/** Safe short label for a value (numbers, bools, strings). */
export function cellValue(v: unknown): string {
   if (v === null || v === undefined) return ''
   if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
   if (typeof v === 'boolean') return v ? 'true' : 'false'
   return String(v)
}
