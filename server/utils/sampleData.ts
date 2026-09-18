// Generates a self-contained demo CSV on disk so the app works end-to-end
// without a user upload (also used to smoke-test the profiler). The file is
// written once per process and reused.

import { writeFile } from 'node:fs/promises'
import { stat as fsStat } from 'node:fs/promises'
import { createJob } from '../services/job'
import { csvPath, ensureJobDir, tmpBase } from './storage'

// 16 columns, deliberately mixing types + a few "interesting" quality signals:
//   * ~3% empty `detail`, ~6% empty `rating`, lots of empty `notes`
//   * a low-cardinality categorical (`category`, `channel`), etc.
//   * ~4% of rows are EXACT duplicates (a real "duplicate row" signal)
const PRODUCTS = ['Widget', 'Gadget', 'Gizmo', 'Doohickey', 'Gizmonk']
const CATEGORIES = ['electronics', 'home', 'office', 'toys', 'outdoor']
const COUNTRIES = ['US', 'DE', 'FR', 'JP', 'BR', 'IN', 'CA', 'AU', 'GB']
const CHANNELS = ['web', 'mobile', 'retail', 'partner']
const REGIONS = ['north', 'south', 'east', 'west', 'central']
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const DISCOUNTS = [0, 0, 0, 5, 10, 15, 20, 25]
const NOTES = ['bulk order', 'seasonal sale', 'return pending', 'gift wrapped', 'expedited shipping', 'discount applied']

const HEADER =
     'order_id,detail,date,region,country,product,category,channel,units,unit_price,subtotal,discount_pct,is_returned,rating,order_total,notes'

function pick<T>(arr: T[], r: () => number): T {
   return arr[Math.floor(r() * arr.length) % arr.length]
}

/** Simple LCG — stable enough for a re-profilable demo (not cryptographic). */
function makeRng(seed = 1337): () => number {
   let s = seed >>> 0
   return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0
      return s / 0xffffffff
      }
}

/** Build a CSV string with realistic, deliberately "interesting" data. */
export function buildDemoCsv(nRows = 5_000): string {
   const r = makeRng()
   const lines: string[] = [HEADER]
   let lastBody = ''

   for (let i = 1; i <= nRows; i++) {
      const units = 1 + Math.floor(r() * 10)
      const unitPrice = Math.round((5 + r() * 200) * 100) / 100
      const subtotal = Math.round(units * unitPrice * 100) / 100
      const discountPct = pick(DISCOUNTS, r)
      const isReturned = r() < 0.12 ? 'true' : 'false'
      const rating = r() < 0.06 ? '' : String(1 + Math.floor(r() * 5)) // ~6% missing
      const orderTotal = Math.round((subtotal * (1 - discountPct / 100)) * 100) / 100
      const date = `${2023 + Math.floor(r() * 2)}-${pick(MONTHS, r)}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`
      const detail = r() < 0.03 ? '' : `#${i}` // ~3% empty
      const notes = r() < 0.15 ? pick(NOTES, r) : '' // ~85% empty -> high-missingness signal
      const dup = i % 25 === 0

       // product is a realistic high-cardinality-ish categorical
      const product = pick(PRODUCTS, r)

      const fields = [
          `ORD-${String(i).padStart(6, '0')}`,
         detail,
         date,
         pick(REGIONS, r),
         pick(COUNTRIES, r),
         product,
         pick(CATEGORIES, r),
         pick(CHANNELS, r),
         String(units),
         String(unitPrice),
         String(subtotal),
         String(discountPct),
         isReturned,
         rating,
         String(orderTotal),
         notes,
         ]

      const body = fields.join(',')
      if (dup && lastBody) {
         lines.push(lastBody) // exact duplicate row (data-quality signal)
      }
      lastBody = body
      lines.push(body)
      }

   return lines.join('\n')
}

// module-level cache so the demo is built at most once per process
let cachedPath: string | null = null
let cachedJobId: string | null = null

export interface DemoJob {
   jobId: string
   csvPath: string
   sizeBytes: number
   fileName: string
}

/**
 * Return a job describing the demo dataset, creating it on first use.
 * Uses a STABLE job id `demo` so the CSV is reused and the report is cacheable.
 */
export async function getDemoJob(maxRows = 5_000, base = tmpBase()): Promise<DemoJob> {
   const jobId = 'demo'
   if (cachedJobId === jobId && cachedPath) {
      return { jobId, csvPath: cachedPath, sizeBytes: 0, fileName: 'demo-sales.csv' }
      }

   await ensureJobDir(jobId, base)
   const path = csvPath(jobId, base)

     // Build the CSV at most once per process; the module-level cache covers repeats.
   if (!cachedPath) {
      const csv = buildDemoCsv(maxRows)
      await writeFile(path, csv)
      cachedPath = path
      }

   cachedJobId = jobId
   let sizeBytes = 0
   try {
      sizeBytes = (await fsStat(path)).size
        } catch {
        }
   await createJob({ jobId, fileName: 'demo-sales.csv', sizeBytes }, base)

   return { jobId, csvPath: path, sizeBytes, fileName: 'demo-sales.csv' }
}
