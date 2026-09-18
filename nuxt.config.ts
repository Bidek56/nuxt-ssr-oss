// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
   compatibilityDate: '2025-07-01',

   // ---- Server-side rendering ---------------------------------------------
   // The whole app is dynamic SSR (no prerender): each request may upload and
   // profile a different CSV, and the report is rendered server-side.
   ssr: true,

   future: {
      compatibilityVersion: 4,
      },

   // ---- Type sharing client<->server ------------------------------------
   // `shared/types.ts` is pure interfaces (erased at build), so it is safe to
   // import on both the client and the server. The built-in `~`/`@`/`~~`
   // aliases already point at the project root, so `~/shared/types` resolves.
   typescript: {
      strict: true,
      paths: {
         '@shared': ['./shared/types.ts'],
         '@shared/*': ['./shared/*.ts'],
        },
      },

   vite: {
      alias: {
         '@shared': fileURLToPath(new URL('./shared/types.ts', import.meta.url)),
        },
      },

   css: ['~/assets/css/main.css'],

   routeRules: {
      '/report/**': { ssr: true },
   },

   // ---- Server bundling: keep nodejs-polars native-only ------------------
   // `nodejs-polars` is a native N-API binary — it must never reach the client
   // bundle. It is imported only via server/utils/polars.ts and externalized
   // to Nitro so the native binding + its platform package stay external.
   nitro: {
      externals: {
         external: [
            'nodejs-polars',
            'nodejs-polars-darwin-arm64',
            'nodejs-polars-darwin-x64',
            'nodejs-polars-linux-x64-gnu',
            'nodejs-polars-linux-arm64-gnu',
            'nodejs-polars-win32-x64-msvc',
            ],
        },
   },

   // ---- Runtime configuration --------------------------------------------
   // Public values are inlined into the client bundle; private values stay on
   // the server only.
   runtimeConfig: {
      // Server-only
      maxUploadBytes: 200 * 1024 * 1024, // 200 MB cap on the streamed upload
      sampleRows: 100_000,               // heavy stats computed over a sample of <=100k rows
      previewRows: 25,                   // leading rows shown in the sample table
      histogramBins: 30,                 // bins per numeric histogram
      topValues: 10,                     // top-N most frequent values per column
      jobTtlMs: 1000 * 60 * 30,         // evict job working dirs older than 30 min
      tmpDir: './.tmp',                  // per-job working area on disk
      profileConcurrency: 2,
      profileTimeoutMs: 5 * 60 * 1000,
     },
   public: {
      appName: 'Polars CSV Profiler',
      maxFileSizeMb: 200,
     },

   // ---- UX niceties -------------------------------------------------------
   devTools: { enabled: false },
   // css: ['~/assets/css/main.css'],
   app: {
      head: {
         titleTemplate: '%s · Polars CSV Profiler',
         meta: [
            { name: 'description', content: 'Server-rendered data profiling for arbitrary CSVs, powered by Rust via nodejs-polars.' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            ],
         link: [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            ],
        },
      },
})
