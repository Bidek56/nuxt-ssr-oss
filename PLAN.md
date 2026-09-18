# Plan — Server-Rendered CSV Data Profiling App

Tech stack: **Nuxt 4 (SSR) · Vue 3 (Composition API + `<script setup>`) · Vite (default builder) · nodejs-polars (native Rust/N-API) · Bun (runtime + package manager)**

Goal: a web app where a user uploads a CSV and the server produces a rich **data-profiling report** (schema, per-column stats, distributions, missing values, cardinalities, duplicates, sample preview, quality checks) that is **server-rendered** (SEO/crawlable, fast first paint, charts hydrate on the client).

---

## 1. Why this stack — and the one constraint that shapes everything

`nodejs-polars` is Rust compiled to a native **N-API** binary (shipped per-OS/arch as optional-dep packages like `nodejs-polars-darwin-arm64`). It:
- is **server-only** (Node / Bun / Deno) — explicitly *not* for browsers (that's `js-polars`),
- runs fast on huge files via lazy evaluation,
- is great for profiling (group-by, quantiles, cardinality, null counts, casting/inference).

**The single most important design rule:** the Polars import must **never** reach the client bundle. Keep `import pl from 'nodejs-polars'` strictly inside **Nitro server code** (`server/**`, and a `server-only` util), and have the Vue client talk to it through **HTTP API routes** + SSR. Vite will happily try to bundle a native `.node` file into the client otherwise and crash the browser.

Consequence: this is a **dynamic SSR** app (per-request uploads), **not** SSG/prerender.

---

## 2. Architecture / data flow

```
 Browser (Vue, Vite)                 Nitro server (Node or Bun)              Disk
 ─────────────────────              ──────────────────────────             ────
 <NuxtFileUpload>   ──POST /api/upload (multipart, size-limited)──►  stream → .tmp/<jobId>/data.csv
                     returns { jobId, columns, rowCount, sizeBytes }
 report page /report/:jobId (SSR)  ──►  server/api/profile/[jobId].ts loads df, profiles, caches report
         │  useProfile() composable fetches /api/profile/<jobId> (SSR-time fetch, streamed HTML)
         ▼
 <ColumnCard/> <Histogram/> <TopValues/> <NullBars/> <DTypeBadge/> <SampleTable/>
         ^ hydrate charts client-side after SSR skeleton paints
```

Two tiers, deliberately split:
1. **Upload step** — multipart POST, validated & size-capped, streamed to a temp file. Returns a `jobId` + cheap metadata *without* doing the expensive profiling yet.
2. **Profile step** — `GET /api/profile/:jobId` (and the SSR `report` page) reads the stored CSV with Polars, computes the report, and **caches** the JSON report so re-renders are instant.

---

## 3. Target project structure

```
nuxt-ssr-oss/
├─ nuxt.config.ts            # ssr on, no prerender, nitro externals, upload limits
├─ app/
│  ├─ pages/
│  │  ├─ index.vue           # landing + upload
│  │  └─ report/[jobId].vue  # SSR profile report page (params-based route)
│  ├─ components/
│  │  ├─ FileUpload.vue      # client drag/drop + progress
│  │  ├─ ProfileReport.vue   # orchestrator (SSR-safe)
│  │  ├─ ColumnCard.vue      # per-column stats
│  │  ├─ Histogram.vue       # client-only chart (client:only / v-if client)
│  │  ├─ TopValues.vue       # categorical distribution
│  │  ├─ NullBars.vue
│  │  ├─ DTypeBadge.vue
│  │  ├─ SampleTable.vue     # first N rows preview
│  │  └─ QualityChecks.vue   # inferred issues/validations
│  ├─ composables/
│  │  ├─ useProfile.ts       # SSR-aware fetch (serverFetch) → profile
│  │  └─ useUpload.ts        # client upload + progress
│  ├─ types/profile.ts       # shared ProfileReport / ColumnProfile TS types
│  └─ app.vue                # layout
├─ server/
│  ├─ utils/
│  │  ├─ polars.ts           # ONLY place `import pl from 'nodejs-polars'` lives (server-only)
│  │  ├─ profile.ts          # buildProfile(df): ColumnProfile[] + dataset summary
│  │  ├─ jobStore.ts         # in-process Map<jobId, Job> + TTL eviction
│  │  └─ reportCache.ts      # cache computed profile JSON by jobId
│  ├─ api/
│  │  ├─ upload.post.ts      # multipart → temp file, size caps, returns jobId + metadata
│  │  ├─ profile/[jobId].get.ts   # run/return profile (caches)
│  │  ├─ jobs/[jobId].delete.ts   # cleanup
│  │  └─ sample.csv.get.ts  # demo dataset for SSR/SEO without upload
│  └─ plugins/cache.ts       # optional: warm caches
├─ public/                   # static assets
└─ README.md
```

---

## 4. The Polars profiling engine (`server/utils/polars.ts` + `profile.ts`)

All Polars code lives here only. Confirm exact method names at implementation time (API moved between versions), but the design:

- **Load**: streaming, low-memory, lazy for big files.
  - `pl.readCSV(bufPath, { inferSchemaLength, lowMemory, nThreads, ... })` → DataFrame
  - or `pl.lazyFrame(...)` + `.collect()` to keep memory bounded.
  - For uploads read from the **stored temp file path** (stream from disk), not the whole buffer in memory.
- **Dataset-level**: `rowCount`, `columnCount`, `schema` (name → dtype), total bytes, read time, `duplicateRow` count (`df.withRowId`/`distinct` diff), memory size.
- **Per-column `ColumnProfile`**:
  - `nullCount` (`col.nullCount()`), `nullPct`,
  - `distinctCount` (`col.distinct().len()`, optionally sampled for huge cols),
  - `dType`,
  - numeric: `min/max/mean/median/quantiles(0.25,0.75)/std` + **histogram** (bin via `cut`/`bin` then `group_by().agg(count)`) on a **sample** (e.g. 100k rows) to bound cost,
  - string/date: `minLen/maxLen/avgLen`, `topK` values via `group_by().sort().head(K)` (K≈10), uniqueness ratio (categorical vs free-text heuristic),
  - bool: true/false counts.
  - Use **lazy** queries and **column pruning** (`select` only needed cols) to keep it fast even on wide files.
- **Sampling for heavy stats**: cap expensive per-column ops at `SAMPLE_ROWS` (e.g. 100_000) so a 50M-row file doesn't OOM/Hang. Document that histograms are sampled.
- Output a serializable `ProfileReport` (no Polars objects cross the API boundary — plain JSON).
- **Safety**: time-box the profiling (`AbortController`/timeout), set `nThreads` sensibly, cap output size (top-K, sample rows).

Suggested output type (`app/types/profile.ts`), shared by client + server:
```ts
export interface ColumnProfile {
  name: string; dtype: DType;
  nullCount: number; nullPct: number;
  distinctCount: number; uniqueness: number;   // distinct/rowCount
  numeric?: { min:number; max:number; mean:number; median:number; q25:number; q75:number; std:number;
             histogram:{ binStart:number; count:number }[] };
  textual?: { minLen:number; maxLen:number; avgLen:number; topValues:{ value:string; count:number }[] };
  boolean?: { trueCount:number; falseCount:number };
}
export interface ProfileReport {
  jobId: string; generatedAt: string;
  dataset: { rowCount:number; columnCount:number; approxSizeBytes:number; readMs:number;
             duplicateRowCount:number; sampleRows:number };
  columns: ColumnProfile[];
  sampleRows: Record<string, unknown>[];   // first N rows for preview
  quality: { level:'ok'|'warn'|'error'; messages: {level:string; message:string}[] };
}
```

---

## 5. API / routes

- **`POST /api/upload`** (multipart, `h3` `readMultipart`).
  - Limit body size (hard cap, e.g. 200 MB — configurable). Reject on overflow.
  - Write stream to `.tmp/<jobId>/data.csv`, validate it's non-empty & parseable header, return `{ jobId, path, ... }` + cheap metadata (column headers from sniffing first lines, row count from line stream — cheap; do **not** run full profile here).
  - Generate `jobId = randomUUID()`; record `createdAt`.
- **`GET /api/profile/:jobId`**
  - Load report cache by jobId; if absent, run `buildProfile(df)` (bounded/time-boxed), cache JSON, return.
  - Returns `ProfileReport` JSON. Idempotent; safe for SSR fetch + client refresh.
- **`DELETE /api/jobs/:jobId`** — remove temp files + cache entry.
- **`GET /api/sample.csv`** — built-in demo CSV so the SSR report renders without a real upload (good for SEO/crawler smoke tests).
- SSR `report` page `serverFetch('/api/profile/'+jobId)` during render → embeds report in initial HTML (instant, crawlable). Client `useProfile()` may re-fetch to refresh/hydrate.

---

## 6. Vue + SSR concerns

- **SSR default on**; **disable prerender** (`nitro.prerender.routes = []`, don't add `nuxt-ssg`/`@nuxt/content` static build). Report pages are route-param + dynamic.
- Use **params-based route** (`pages/report/[jobId].vue`) — Nuxt 3/4 supports dynamic segments; no legacy `~`/`@` route magic needed.
- `useProfile()` must work in SSR: use Nitro **`$fetch`/`serverFetch`** on the server (no fetch/CORS issues), and a normal client `useFetch`/reactive state that **hydrates** from the server-rendered initial value. Keep client and server results consistent to avoid hydration mismatch.
- **Charts must be client-only** during SSR to avoid canvas mismatch: wrap `Histogram`/`TopValues` with `<ClientOnly>` or `onMounted`-gated mount; SSR renders a skeleton + the numeric data (e.g. a `<noscript>`-style data table fallback for crawlability).
- Chart lib: pick a **lightweight, tree-shakeable, Vue-native** option to keep the client bundle small — `vue-echarts` (ECharts) for capability or `chart.js` + `vue-chartjs` for size. Decide by bundle budget (target client JS < ~150 KB gzip).
- Avoid leaking server types/objects to client; the API boundary is plain JSON.

---

## 7. Nuxt 4 config — the critical bits

```ts
// nuxt.config.ts (Nuxt 4 — modules + nitro keys, no Nuxt3 `build` alias surprises)
export default defineNuxtConfig({
  ssr: true,                 // dynamic per-request SSR
  // ...
  // Keep native Polars OUT of the client bundle & let Nitro load the real binary
  nitro: {
    externals: {
      external: ['nodejs-polars'],   // do NOT bundle the native .node into anything
    },
    // raise multipart/body limits for large CSVs
    // (h3/nitro body limits — verify exact key for 4.5; e.g. server config or middleware)
    // set a hard cap so we never OOM; we also cap in /api/upload
    // store temp files; ensure .tmp/ is on the runtime container's writable fs
    base: '/',
  },
  // Make sure Polars is never optimized/bundled for the client
  vite: {
    ssr: { noExternal: [] },   // leave defaults; never force nodejs-polars into client
  },
  runtimeConfig: {
    maxUploadBytes: 200 * 1024 * 1024,
    sampleRows: 100_000,
    tmpDir: process.env.TMP_DIR || '.tmp',
    reportTtlMs: 60 * 60 * 1000,
  },
})
```

**Externalization is the make-or-break step.** In practice:
- The only file importing `nodejs-polars` is `server/utils/polars.ts`. Never import it from `app/**` or a shared client util.
- Add `nodejs-polars` to `nitro.externals.external` so the runtime `require`s the native binary instead of bundling it.
- Verify the platform optional-dep is installed for the **target runtime OS/arch** (Bun's CI/build host must match the runtime host — e.g. `darwin-arm64` for this Mac; `linux-x64-gnu` for a Linux container). Don't build on the wrong platform.
- Bun note: Bun supports N-API, so the native binary loads; but **build and run on a matching Node/Bun + OS**. Test on the actual runtime.

---

## 8. Build & run with Bun

```bash
bun install                 # installs nuxt, nodejs-polars + its platform binary
bunx nuxi dev               # dev server (Nitro) — runs on Bun
bunx nuxi build             # → .output/ (Nitro standalone-ish bundle, Polars externalized)
bun .output/server/index.mjs# prod server on Bun (alternatively: node .output/server/index.mjs)
```
- Use **Bun** as the dev/runtime; keep Node as the fallback. Pin `nodejs-polars` to a known-good version (`0.26.1`) since it releases frequently.
- The native binary is in `node_modules` — add it to a `.dockerignore`/build step that re-`bun install` on the target platform; **never** copy `node_modules` across platforms without reinstalling.

---

## 9. State, caching, cleanup

- **Single-instance**: `jobStore` = in-process `Map<jobId, {path, createdAt, report?}>`; `reportCache` = JSON cached by jobId. TTL eviction plugin + cleanup of temp files on `DELETE` and on schedule.
- **Multi-instance / production**: move job metadata behind a shared store (Redis or filesystem-on-volume); report cache in Redis; upload to object store (S3) instead of local `.tmp`. Design `jobStore`/`reportCache` behind interfaces so this is a drop-in.
- Security/hygiene: `jobId` opaque random; validate it exists & belongs to TTL window; clean orphaned temp files; cap concurrency of profiling jobs (worker/queue to avoid N simultaneous Polars runs OOMing); cap per-job memory & wall-clock (timeout).

---

## 10. Phased roadmap

**Phase 0 — Scaffold (½ day)**
- Add Nuxt 4 + `nodejs-polars` via `bun add`; confirm `import pl` works in a `server/api/test.get.ts` returning a small `df` summary. **Gate:** a route that loads a real CSV with Polars and returns JSON via Bun.
- Add `app/types/profile.ts`.

**Phase 1 — Upload + temp storage (½–1 day)**
- `POST /api/upload` with size caps + stream to `.tmp`. `jobStore` + TTL. `DELETE /api/jobs/:jobId`.
- **Gate:** upload a real CSV, get `jobId`, file exists on disk, 413 on oversize.

**Phase 2 — Profiling engine (1–1.5 days)**
- `server/utils/polars.ts` + `profile.ts`: dataset summary + `ColumnProfile` per column + `sampleRows` + `quality`.
- `GET /api/profile/:jobId` with caching + timeout.
- **Gate:** run on a 10M-row file; sane memory, sub-second on cached, no OOM, top-K + histogram present.

**Phase 3 — SSR report UI (1–1.5 days)**
- `pages/index.vue` (upload) + `pages/report/[jobId].vue` (SSR `useProfile` via serverFetch).
- Components: `ColumnCard`, `NullBars`, `DTypeBadge`, `SampleTable`, `QualityChecks` (SSR-safe); `Histogram`/`TopValues` client-only.
- **Gate:** first paint shows report HTML with charts as skeleton; no hydration warnings; report crawlable.

**Phase 4 — Hardening (1 day)**
- Job concurrency queue + per-job timeout/memory caps; chart bundle-budget check; `.env`/runtimeConfig; error surfaces for corrupted/oversized/garbage input; accessibility; small unit tests on `profile.ts` with fixture CSVs (Vitest on Vitest-node; Polars runs in node/bun).

**Phase 5 — Deploy (½–1 day)**
- Build on **matching OS/arch** (linux-x64 for containers); reinstall native binary in image; run with Bun; health check; temp-dir/volume; rate-limit `/api/upload`.

---

## 11. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| Native `nodejs-polars` leaks into client bundle / browser crash | Polars import **only** in `server/**`; `nitro.externals.external`; never reference in client |
| Built on wrong OS/arch → missing binary at runtime | Build/run on matching platform; reinstall `node_modules` on target; pin version `0.26.1` |
| Huge CSV → OOM / hang | Low-memory lazy read, column pruning, **sampled** heavy stats, per-job **timeout**, cap concurrency, upload **size limits** |
| Hydration mismatch on SSR charts | `<ClientOnly>`/mount-gated charts; consistent server/client initial data; `useFetch`/serverFetch parity |
| `jobStore` not shared in multi-instance | Interface it; swap to Redis/object-store for prod |
| Polars API drift (frequent releases) | **Pin the version**; confirm exact method names (`readCSV`, `distinct().len()`, `cut`/`bin`, `group_by()`) at Phase 2 |
| Temp file leak / DoS | TTL + scheduled cleanup + `DELETE`; cap disk usage |
| Security (path traversal, injection) | Opaque `jobId` (UUID), no user-controlled paths, validate inputs, rate-limit upload |

---

## 12. Open questions / decisions to confirm

1. **Max file size & row cap** (drives upload limits + sampling strategy) — default proposed: 200 MB / `SAMPLE_ROWS=100k`.
2. **Concurrency model** for profiling (in-process queue vs. separate worker/queue) and whether multi-instance from day one.
3. **Chart library** — `vue-echarts` (feature-rich, heavier) vs `chart.js`/`vue-chartjs` (lighter). Pick after measuring bundle.
4. **Deployment target** (Docker on Linux `x64`?) — determines which native binary must ship and that we must `bun install` in-image.
5. **Auth / multi-tenant?** Currently assumed single-tenant internal tool.
6. **SSR vs SSG**: confirmed dynamic SSR. If a static report for a fixed dataset is ever wanted, `/api/sample.csv` + `report/[jobId].vue` already supports a pre-renderable path.
