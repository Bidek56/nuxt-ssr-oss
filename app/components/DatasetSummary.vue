<script setup lang="ts">
import type { ProfileReport } from '~/shared/types'
import { formatBytes, formatNumber, formatPct } from '~/utils/format'

const props = defineProps<{ report: ProfileReport }>()
const d = computed(() => props.report.dataset)
const readMs = computed(() => Math.round(d.value.readMs * 100) / 100)
const generated = computed(() => {
   try {
      return new Date(props.report.generatedAt).toLocaleString()
       } catch {
       return props.report.generatedAt
        }
})
</script>

<template>
        <section class="dataset-summary">
            <header class="dataset-summary__head">
                <div>
                       <h1 class="dataset-summary__title">{{ d.fileName }}</h1>
               <p class="dataset-summary__sub">
                       profiled with <code>nodejs-polars {{ report.polarsVersion }}</code> ·
                       generated {{ generated }}
                    </p>
                </div>
                <div class="dataset-summary__meta">
                       <span v-if="d.sampleUsed" class="pill pill--warn">
                           stats sampled over {{ formatNumber(d.sampleRows) }} rows
                    </span>
                    <span v-else class="pill pill--ok">full scan</span>
                </div>
            </header>

            <div class="summary-grid">
                 <StatCard label="Rows" :value="formatNumber(d.rowCount)" icon="≣" hint="data rows (header excluded)" tone="neutral" />
                 <StatCard label="Columns" :value="formatNumber(d.columnCount)" icon="⊞" tone="neutral" />
                 <StatCard
                    label="Size on disk"
                    :value="formatBytes(d.approxSizeBytes)"
                    icon="⇅"
                    tone="neutral"
                 />
                 <StatCard
                    label="Read time"
                    :value="`${readMs} ms`"
                    icon="⏱"
                    :hint="`${d.columnCount} cols · ${d.rowCount.toLocaleString()} rows`"
                    tone="neutral"
                 />
                <StatCard
                   label="Duplicate rows"
                 :value="
                       d.duplicateRowPct > 0 ? formatNumber(d.duplicateRowCount) : 'none'
                         "
                         icon="⧉"
                         :hint="d.duplicateRowPct > 0 ? formatPct(d.duplicateRowPct) + ' of rows' : '0 duplicates detected'"
                         :tone="d.duplicateRowPct > 0.05 ? 'severe' : d.duplicateRowPct > 0 ? 'mild' : 'ok'"
                      />
             </div>
        </section>
</template>
