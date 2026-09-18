# Polars CSV Profiler

A **server-rendered** CSV data-profiling app built with **Nuxt 4 · Vue 3
(dynamic SSR) · Vite · Bun** and powered by **[nodejs-polars](https://github.com/pola-rs/nodejs-polars)**
— the Rust [Polars](https://www.pola.rs/) engine via a native N-API binary.

You upload a CSV; the server profiles it (schema, per-column statistics,
histograms, top values, duplicate detection, and data-quality checks) and
**server-renders a rich report page**. Charts hydrate client-side; the fallback
is inline SVG, so crawlers and no-JS visitors get a complete, semantic report.

## Highlights

- **Dynamic SSR** — each request may profile a *different* CSV; nothing is
  prerendered.
- **Native engine, isolated** — `nodejs-polars` is a native binary and is
  imported in exactly one file (`server/utils/polars.ts`); it is externalized in
  Nitro so it never reaches the client bundle.
- **Cost-bounded** — cheap native passes (nulls, min/max/mean/median/std/
  quantiles) run over the full data; heavier stats (cardinality, top-values,
  histograms) run over a bounded sample (≤ 100k rows). Duplicate detection is
  capped at 2M rows.
- **Cached & shareable** — each report is cached in memory + on disk
  (`report.json`), keyed by job id, so repeat visits are instant and URLs are
  shareable within the TTL.
- **SSR-safe charts** — interactive `chart.js` canvas on the client, with an
  SVG bar fallback rendered server-side.

## Architecture

```
Client                Server (Nitro / Bun)                 Native
──────                ──────────────────────                 ──────
POST /api/upload  ──►  stream to .tmp/<jobId>/data.csv,
                       cap bytes, strip BOM, create job
                       │
GET /api/profile/:id ─► buildProfile() ──► server/utils/polars.ts ──► nodejs-polars (Rust)
                       (cached on 2nd+ read)                    (readCSV, select,
                       page server-renders report HTML            sample, valueCounts,
                                                                unique, ...)
Client hydrates charts (chart.js) ──► report page
```

### Where the code lives

| Area                         | Path                                              |
|------------------------------|---------------------------------------------------|
| Native Polars facade         | `server/utils/polars.ts`  (the *only* native import) |
| Temp storage / job lifecycle | `server/utils/storage.ts`, `server/services/job.ts` |
| Demo dataset generator        | `server/utils/sampleData.ts`                        |
| The profiler                  | `server/services/profile.ts` (uses only `pl`)       |
| Demo profile route            | `server/api/sample-profile.get.ts`                  |
| Upload route                   | `server/api/upload.post.ts`                        |
| Profile route                  | `server/api/profile/[jobId].get.ts`                |
| Job delete / health           | `server/api/jobs/[jobId].delete.ts`, `server/api/health.get.ts` |
| TTL cleanup plugin            | `server/plugins/cleanup.ts`                         |
| Shared types                  | `shared/types.ts` (type-only, erased — safe everywhere) |
| UI / SSR pages                | `app/` (pages, components, composables, styles)    |

The profiler imports **only** `pl` from `server/utils/polars.ts` — never
`nodejs-polars` directly — so the native dependency stays in one place and is
easy to swap or stub.

### Isolation & security

- **Native isolation** — `nitro.externals.external` includes `nodejs-polars` and
  its platform packages, so the client bundle cannot pull in the binary.
- **Path traversal** — job ids are validated (`/^[A-Za-z0-9_-]+$/`) and
  sanitised before any filesystem use.
- **Upload cap** — uploads are streamed to disk with a byte limit
  (`maxUploadBytes`, default 200 MB); oversized uploads get `413` and are
  cleaned up.
- **BOM** — a leading UTF-8 BOM is stripped so the first column name is clean.

## Getting started

```bash
bun install        # installs Nuxt, nodejs-polars (+ platform binary), chart.js
bun run dev        # http://localhost:3000
```

### Run in production (Bun or Node)

```bash
bun run build            # nuxi build
bun run build:start      # bun .output/server/index.mjs
# or:
bun run start            # node .output/server/index.mjs
```

> **Native binary is platform-specific.** Build and run on a **matching
> OS/arch** (e.g. `darwin-arm64` locally, `linux-x64-gnu` for Linux
> containers). The correct `nodejs-polars-*` binary is installed automatically
> for the current platform by `bun install`.

## Configuration

All server-side knobs live in `runtimeConfig` in `nuxt.config.ts`:

| Key              | Default    | Meaning                                              |
|------------------|------------|-----------------------------------------------------|
| `maxUploadBytes` | 200 MB     | Max accepted upload size                             |
| `sampleRows`     | 100 000    | Heavy stats computed over at most this many rows     |
| `previewRows`    | 25         | Leading rows shown in the sample table               |
| `histogramBins`  | 30         | Bins per numeric histogram                           |
| `topValues`      | 10         | Top-N most frequent values per column                |
| `jobTtlMs`       | 30 min     | After which job dirs/reports are pruned             |
| `tmpDir`         | `./.tmp`   | Per-job working area (`data.csv` + `report.json`)    |

Public config (`public: { appName, maxFileSizeMb }`) is exposed to the client.

## API

| Method | Route                  | Body / Result                                   |
|--------|------------------------|-------------------------------------------------|
| `POST` | `/api/upload`          | `multipart/form-data` `file` → `UploadResult` (jobId…) |
| `GET`  | `/api/profile/:jobId`  | → `ProfileReport` (cached after first build)     |
| `GET`  | `/api/sample-profile`  | → `ProfileReport` for the built-in demo dataset  |
| `GET`  | `/api/sample.csv`      | → demo CSV file (download / SEO smoke test)      |
| `DELETE`| `/api/jobs/:jobId`    | → `{ removed: boolean }`                         |
| `GET`  | `/api/health`          | → liveness + Polars version + runtime info       |

## Single-instance vs multi-instance

The job store is an in-memory `Map` with an on-disk `report.json` cache —
perfect for a single process. For multiple instances or serverless, swap the
Map for Redis / a DB (the storage functions in `server/services/job.ts` are the
seam). Disk caches are written per job so reports survive restarts within the TTL.
