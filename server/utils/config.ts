// Resolves server-side runtime configuration from Nuxt's runtimeConfig, with a
// per-key override from environment variables (env wins). Keeping this in one
// spot makes the knobs predictable whether set in nuxt.config.ts or in env.

export interface ServerConfig {
   base: string
   maxUploadBytes: number
   maxFileSizeMb: number
   sampleRows: number
   previewRows: number
   histogramBins: number
   topValues: number
   jobTtlMs: number
   profileConcurrency: number
   profileTimeoutMs: number
   appName: string
}

function num(v: unknown, fallback: number): number {
   const n = Number(v)
   return Number.isFinite(n) ? n : fallback
}

export function getServerConfig(): ServerConfig {
   const cfg = useRuntimeConfig()
   const p = process.env

   const maxUploadBytes = num(p.MAX_UPLOAD_BYTES ?? cfg.maxUploadBytes, 200 * 1024 * 1024)

   return {
      base: String(p.TMP_DIR ?? cfg.tmpDir ?? '.tmp'),
      maxUploadBytes,
      maxFileSizeMb: Math.round(maxUploadBytes / 1024 / 1024),
      sampleRows: num(p.SAMPLE_ROWS ?? cfg.sampleRows, 100_000),
      previewRows: num(p.PREVIEW_ROWS ?? cfg.previewRows, 25),
      histogramBins: num(p.HISTOGRAM_BINS ?? cfg.histogramBins, 30),
      topValues: num(p.TOP_VALUES ?? cfg.topValues, 10),
      jobTtlMs: num(p.JOB_TTL_MS ?? cfg.jobTtlMs, 30 * 60 * 1000),
      profileConcurrency: num(p.PROFILE_CONCURRENCY ?? cfg.profileConcurrency, 2),
      profileTimeoutMs: num(p.PROFILE_TIMEOUT_MS ?? cfg.profileTimeoutMs, 5 * 60 * 1000),
      appName: (cfg.public?.appName as string) || 'Polars CSV Profiler',
    }
}
