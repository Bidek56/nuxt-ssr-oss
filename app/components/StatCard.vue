<script setup lang="ts">
const props = defineProps<{
   label: string
   value: string | number
   hint?: string
   tone?: 'ok' | 'mild' | 'high' | 'severe' | 'neutral'
   icon?: string
}>()
</script>

<template>
    <figure class="stat-card" :class="`tone-${tone || 'neutral'}`">
       <figcaption class="stat-card__label">
          <span v-if="icon" class="stat-card__icon" aria-hidden="true">{{ icon }}</span>
          {{ label }}
      </figcaption>
      <div class="stat-card__value">{{ value }}</div>
      <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
     </figure>
</template>
