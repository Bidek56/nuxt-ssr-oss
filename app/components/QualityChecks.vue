<script setup lang="ts">
import { computed } from 'vue'
import type { QualityMessage, QualityLevel } from '~/shared/types'

const props = defineProps<{ messages: QualityMessage[] }>()

const groups = computed(() => {
   const by = { error: [] as QualityMessage[], warn: [] as QualityMessage[], ok: [] as QualityMessage[], info: [] as QualityMessage[] }
   for (const m of props.messages || []) {
       const lvl: QualityLevel = m.level === 'ok' || m.level === 'info' ? 'ok' : m.level;
      (by[lvl] ||= []).push(m)
       }
   return [
       { level: 'error' as QualityLevel, items: by.error, icon: '✗', label: 'Errors' },
       { level: 'warn' as QualityLevel, items: by.warn, icon: '!', label: 'Warnings' },
       { level: 'ok' as QualityLevel, items: by.ok, icon: '✓', label: 'Checks passed' },
       { level: 'info' as QualityLevel, items: by.info, icon: 'i', label: 'Info' },
       ].filter((g) => g.items.length > 0)
})

const total = computed(() => (props.messages || []).length)
const hasIssues = computed(() =>
   total.value === 0 ||
   (props.messages || []).every((m) => m.level === 'ok' || m.level === 'info'),
     )
</script>

<template>
        <section class="quality-checks">
            <header class="quality-checks__head">
                 <h2 class="quality-checks__title">Data quality checks</h2>
                <span v-if="hasIssues" class="quality-badge quality-badge--ok">No issues detected</span>
                <span v-else class="quality-badge quality-badge--bad">{{ total }} issue(s)</span>
            </header>

            <div v-if="!total" class="quality-empty">This dataset looks clean — no issues detected.</div>

            <div v-for="g in groups" :key="g.level" class="quality-group" :class="`quality-group--${g.level}`">
                <h3 class="quality-group__title">
                     <span class="quality-group__icon">{{ g.icon }}</span>
                    {{ g.label }}
                     <span class="quality-group__count">{{ g.items.length }}</span>
                 </h3>
                 <ul class="quality-list">
                     <li v-for="(m, i) in g.items" :key="i" class="quality-item">
                        <span class="quality-item__col" v-if="m.column" :title="m.column">{{ m.column }}</span>
                        <span class="quality-item__msg">{{ m.message }}</span>
                    </li>
                 </ul>
             </div>
        </section>
</template>
