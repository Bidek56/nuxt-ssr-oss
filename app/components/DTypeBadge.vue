<script setup lang="ts">
import type { DType } from '~/shared/types'

const props = defineProps<{ dtype: DType; raw?: string }>()

const tones: Record<DType, string> = {
   Integer: 'tone-int',
   Float: 'tone-float',
   Boolean: 'tone-bool',
   Date: 'tone-date',
   Time: 'tone-date',
   Duration: 'tone-date',
   String: 'tone-string',
   Other: 'tone-other',
}
</script>

<template>
   <span class="dtype-badge" :class="tones[dtype] || 'tone-other'" :title="raw ? `raw: ${raw}` : dtype">
      <span class="dtype-badge__dot" aria-hidden="true" />
      {{ dtype }}
      <span v-if="raw && raw !== dtype.toLowerCase()" class="dtype-badge__raw">{{ raw }}</span>
   </span>
</template>
