<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, formatPct } from '~/utils/format'

const props = defineProps<{
   nullCount: number
   rowCount: number
}>()

const pct = computed(() =>
   props.rowCount > 0 ? props.nullCount / props.rowCount : 0,
   )

// Colour: green (clean) -> amber (some) -> red (heavy).
const tone = computed(() => {
   const p = pct.value
   if (p <= 0.01) return 'ok'
   if (p <= 0.15) return 'mild'
   if (p <= 0.5) return 'high'
   return 'severe'
})
</script>

<template>
    <div class="nullbar" :title="`nulls ${formatNumber(nullCount)} / ${formatNumber(rowCount)}`">
       <div class="nullbar__track">
          <div class="nullbar__fill" :class="`fill-${tone}`" :style="{ width: `${(pct * 100).toFixed(2)}%` }" />
       </div>
       <div class="nullbar__label">
          <span v-if="pct === 0" class="nullbar__ok">0 missing</span>
          <span v-else>{{ formatPct(pct) }} missing</span>
          <span class="nullbar__count">{{ formatNumber(nullCount) }}</span>
       </div>
    </div>
</template>
