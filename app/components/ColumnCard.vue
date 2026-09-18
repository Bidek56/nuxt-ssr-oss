<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnProfile } from '~/shared/types'
import { formatNumber, formatPct, round } from '~/utils/format'

const props = defineProps<{ column: ColumnProfile }>()

const c = computed(() => props.column)

const numeric = computed(() => c.value.numeric)
const isFloatLike = computed(() => c.value.dtype === 'Float')
const stats = computed(() => {
   const n = numeric.value
   if (!n) return []
   return [
      { label: 'min', value: isFloatLike.value ? round(n.min) : n.min },
      { label: 'max', value: isFloatLike.value ? round(n.max) : n.max },
      { label: 'mean', value: round(n.mean) },
      { label: 'median', value: round(n.median) },
      { label: 'std dev', value: round(n.std) },
      { label: 'p25', value: round(n.q1) },
      { label: 'p75', value: round(n.q3) },
       ]
})

const categoricalNote = computed(() =>
   c.value.isCategorical ? 'low cardinality — likely categorical' : `distinct ≈ ${formatNumber(c.value.distinctCount)}`,
)
</script>

<template>
       <article class="col-card">
           <header class="col-card__head">
               <div class="col-card__title">
                      <h3 class="col-card__name">{{ c.name }}</h3>
                      <DTypeBadge :dtype="c.dtype" :raw="c.dtypeRaw" />
                      <span v-if="c.sampled" class="col-card__sampled" title="heavier stats computed over a sample">
                          sampled
                      </span>
                  </div>
                  <div class="col-card__meta">
                      <span class="col-card__card"><strong>{{ formatPct(c.cardinalityRatio) }}</strong> distinct</span>
                  </div>
             </header>

             <NullBar :null-count="c.nullCount" :row-count="c.rowCount" />

             <!-- categorical summary chips -->
             <p v-if="categoricalNote" class="col-card__note">{{ categoricalNote }}</p>

             <!-- numeric stats -->
             <div v-if="numeric" class="col-card__stats">
                     <div v-for="s in stats" :key="s.label" class="stat">
                         <span class="stat__label">{{ s.label }}</span>
                         <span class="stat__value">{{ s.value }}</span>
                      </div>
                 </div>

             <!-- boolean summary -->
             <div v-if="c.boolean" class="col-card__bool">
                 <span class="bool-pill bool-pill--true">true {{ formatPct(c.boolean.truePct) }}</span>
                 <span class="bool-pill bool-pill--false">false {{ formatPct(c.boolean.falsePct) }}</span>
             </div>

             <!-- histogram (numeric) or top values (categorical / textual) -->
             <Histogram v-if="numeric" :bins="numeric.histogram" :label="c.name" />

             <TopValues
                 v-if="c.topValues?.length"
                :values="c.topValues"
                :truncated="c.distinctCount - (c.topValues?.length || 0)"
              />

             <TopValues
                 v-else-if="c.textual?.topValues?.length"
                :values="c.textual.topValues"
                :truncated="c.distinctCount - (c.textual.topValues?.length || 0)"
              />

             <!-- per-column quality issues -->
             <ul v-if="c.issues?.length" class="col-card__issues">
                 <li
                     v-for="(issue, i) in c.issues"
                     :key="i"
                     class="col-card__issue"
                      :class="`level-${issue.level}`"
                   >
                       <span class="col-card__issue-dot" :class="`dot-${issue.level}`" />
                       {{ issue.message }}
                 </li>
             </ul>
        </article>
</template>
