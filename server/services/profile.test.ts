import { describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildProfile } from './profile'

describe('buildProfile', () => {
   test('profiles a small CSV with expected shape', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'profiler-test-'))
      const path = join(dir, 'tiny.csv')
      await writeFile(
         path,
         'id,name,score,active\n1,alice,10.5,true\n2,bob,,false\n3,alice,10.5,true\n',
      )

      try {
         const report = await buildProfile(path, 'test-job', 'tiny.csv', 0, {
            sampleRows: 1000,
            previewRows: 5,
            histogramBins: 5,
            topValues: 5,
         })

         expect(report.jobId).toBe('test-job')
         expect(report.dataset.rowCount).toBe(3)
         expect(report.dataset.columnCount).toBe(4)
         expect(report.columns.length).toBe(4)
         expect(report.previewRows.length).toBeGreaterThan(0)
         expect(report.columns.some((c) => c.name === 'score' && c.numeric)).toBe(true)
         expect(report.dataset.duplicateRowCount).toBeGreaterThanOrEqual(0)
      } finally {
         await rm(dir, { recursive: true, force: true })
      }
   })
})
