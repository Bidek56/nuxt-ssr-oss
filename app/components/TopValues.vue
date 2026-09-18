<script setup lang="ts">
import { computed } from 'vue'
import type { TopValue } from '~/shared/types'
import { compactNumber, formatPct } from '~/utils/format'

const props = defineProps<{
   values: TopValue[]
   totalRows?: number
   truncated?: number
}>()

const rows = computed(() => {
   const vals = props.values || []
   const max = vals.reduce((m, v) => Math.max(m, v.count), 0) || 1
   return vals.map((v) => ({ ...v, w: (v.count / max) * 100 }))
})
</script>

<template>
      <div v-if="rows.length" class="top-values">
          <ul class="top-values__list">
               <li v-for="v in rows" :key="v.label" class="top-values__row">
                   <span class="top-values__label" :title="v.label">{{ v.label }}</span>
                     <span class="top-values__bar">
                         <span class="top-values__fill" :style="{ width: `${v.w}%` }" />
                   </span>
                     <span class="top-values__count">{{ compactNumber(v.count) }}</span>
                 </li>
          </ul>
          <p v-if="truncated" class="top-values__muted">+ {{ truncated }} more value(s) not shown.</p>
       </div>
</template>
