<script setup lang="ts">
// Interactive bar chart. Client-only: chart.js is imported here so it is never
// pulled into the SSR render or a non-hydrated path. Used inside <ClientOnly>.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { Chart } from 'chart.js'
import type { HistogramBin } from '~/shared/types'

const props = defineProps<{
   bins: HistogramBin[]
   label?: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function shorten(v: number): string {
   const a = Math.abs(v)
   if (a >= 1000) return `${(v / 1000).toFixed(1)}k`
   return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

async function render() {
   const el = canvas.value
   chart?.destroy()
   chart = null
   if (!el || !props.bins?.length) return
   const mod = await import('chart.js')
   const { Chart: ChartClass } = mod

   chart = new ChartClass(el, {
      type: 'bar',
      data: {
           labels: props.bins.map((b) => shorten(b.value)),
          datasets: [
             {
                label: props.label || 'count',
               data: props.bins.map((b) => b.count),
               backgroundColor: 'rgba(99, 102, 241, 0.7)',
               borderColor: 'rgba(99, 102, 241, 1)',
               borderWidth: 1,
               borderRadius: 2,
                  },
              ],
            },
      options: {
         indexAxis: 'x',
         responsive: true,
         maintainAspectRatio: false,
         animation: false,
         plugins: { legend: { display: false } },
         scales: {
            x: {
               ticks: { maxTicksLimit: 8, autoSkip: true, font: { size: 10 } },
               grid: { display: false },
                },
            y: {
               beginAtZero: true,
               ticks: { precision: 0, font: { size: 10 } },
               grid: { color: 'rgba(127,127,127,0.12)' },
                },
             },
          },
          })
      }

onMounted(render)
watch(() => props.bins, render, { deep: true })
onBeforeUnmount(() => {
   chart?.destroy()
   chart = null
})
</script>

<template>
     <div class="hist-canvas-wrap">
        <canvas ref="canvas" role="img" :aria-label="`Histogram of ${label || 'values'}`" />
     </div>
</template>
