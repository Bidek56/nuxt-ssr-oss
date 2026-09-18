<script setup lang="ts">
// SSR-safe histogram: a pure SVG bar chart is always rendered (crawlers + no-JS),
// and on the client it is swapped for an interactive chart.js canvas via
// <ClientOnly>. The chart.js canvas lives in HistogramChart.vue so the heavy
// lib only loads on the client inside a <ClientOnly> boundary.
import { computed, defineAsyncComponent } from 'vue'
import type { HistogramBin } from '~/shared/types'

const props = defineProps<{
   bins: HistogramBin[]
   label?: string
}>()

const ChartCanvas = defineAsyncComponent(() =>
   import('./HistogramChart.vue').then((m) => m.default),
    )

// SVG geometry (viewBox 0 0 320 120, bars scaled to the max count).
const MAXW = 320
const MAXH = 120
const maxCount = computed(() => props.bins?.reduce((m, b) => Math.max(m, b.count), 0) || 1)

const bars = computed(() => {
   const bins = props.bins || []
   if (!bins.length) return []
   const total = bins.length
   const slotW = MAXW / total
   return bins.map((b, i) => ({
      x: i * slotW,
      w: Math.max(1, slotW - 1),
      h: (b.count / maxCount.value) * MAXH,
      }))
})

const hasBars = computed(() => (props.bins || []).length > 0)

function xLabel(v: number): string {
   const a = Math.abs(v)
   if (a >= 1000) return `${(v / 1000).toFixed(1)}k`
   return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
</script>

<template>
      <figure v-if="hasBars" class="histogram">
         <ClientOnly>
             <template #default>
                 <div class="histogram__canvas">
                     <HistogramChart :bins="bins" :label="`count of ${label || 'values'}`" />
                </div>
            </template>
            <template #fallback>
                 <div class="histogram__svg">
                     <svg :viewBox="`0 0 ${MAXW} ${MAXH + 16}`" preserveAspectRatio="none" class="histogram__svgel" role="img"
                           :aria-label="`Histogram of ${label || 'values'}`">
                         <rect
                               v-for="(b, i) in bars"
                               :key="i"
                              :x="b.x"
                              :y="MAXH - b.h"
                            :width="b.w"
                           :height="b.h"
                          class="histogram__bar"
                          />
                     </svg>
                     <div class="histogram__axis">
                         <span>{{ xLabel(bins[0].value) }}</span>
                          <span v-if="bins.length > 1" class="histogram__axis-mid">{{ label || 'value' }}</span>
                          <span>{{ xLabel(bins[bins.length - 1].value) }}</span>
                     </div>
                </div>
             </template>
         </ClientOnly>
         <figcaption class="histogram__legend">
             <span>{{ label || 'Distribution' }}</span>
             <span>{{ bins.length }} bins</span>
         </figcaption>
      </figure>
      <p v-else class="histogram__empty">No non-null values to chart.</p>
</template>
