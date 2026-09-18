// POLARS ISOLATION BOUNDARY
// ---------------------------------------------------------------------------
// This is the ONLY file in the whole project that imports `nodejs-polars`.
//
// Because a native module can only ever be loaded on the server, and the
// client must never reference it, we centralize the import here and re-export a
// small, typed surface. Everything else in the codebase imports the Polars
// facade from this file (`import { pl } from '~~/server/utils/polars'`), so
// grepping for `nodejs-polars` returns exactly one hit. The client build never
// transitively sees `nodejs-polars` and `nitro.externals.external` keeps the
// runtime `require` out of the bundle.
// ---------------------------------------------------------------------------

import pl from 'nodejs-polars'

// `nodejs-polars` default export is the Polars namespace (DataFrame, Series,
// col, lit, readCSV, select, ...). Re-export it as a named facade `pl`.
export { pl }
export default pl

// Best-effort version string for the UI ("powered by"). Tolerant of API drift.
export function polarsVersion(): string {
   try {
      const anyPl = pl as unknown as { version?: string; __VERSION__?: string }
      return anyPl.version ?? anyPl.__VERSION__ ?? '0.26.x'
   } catch {
      return '0.26.x'
   }
}
