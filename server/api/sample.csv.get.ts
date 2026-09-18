// GET /api/sample.csv — built-in demo dataset for crawlers / manual download.
import { readFile } from 'node:fs/promises'
import { getDemoJob } from '~~/server/utils/sampleData'
import { getServerConfig } from '~~/server/utils/config'

export default defineEventHandler(async (event) => {
   const c = getServerConfig()
   const demo = await getDemoJob(5_000, c.base)
   const csv = await readFile(demo.csvPath)

   setHeader(event, 'content-type', 'text/csv; charset=utf-8')
   setHeader(event, 'content-disposition', `inline; filename="${demo.fileName}"`)
   setHeader(event, 'cache-control', 'public, max-age=3600')

   return csv
})
