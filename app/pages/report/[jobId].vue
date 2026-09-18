<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProfile } from '~/composables/useProfile'

const route = useRoute()
const jobId = computed(() => String(route.params.jobId ?? ''))

const { report, pending, error, refresh } = useProfile(jobId)

useHead({
   title: computed(() => (report.value?.dataset?.fileName ? report.value.dataset.fileName : 'Report')),
})
</script>

<template>
   <div class="page-report">
      <div v-if="pending && !report" class="report-state report-state--loading" role="status">
         <div class="spinner" aria-hidden="true" />
         <p>Profiling your dataset on the server…</p>
         <p class="report-state__hint">First visit runs Polars; repeat visits use the cached report.</p>
      </div>

      <div v-else-if="error" class="report-state report-state--error" role="alert">
         <h1>Could not load report</h1>
         <p>{{ error.message || 'An unexpected error occurred.' }}</p>
         <div class="report-state__actions">
            <button type="button" class="btn btn--primary" @click="refresh">Retry</button>
            <NuxtLink to="/" class="btn btn--ghost">Upload another file</NuxtLink>
         </div>
      </div>

      <template v-else-if="report">
         <div class="report-toolbar">
            <NuxtLink to="/" class="btn btn--ghost">← Upload another</NuxtLink>
            <button type="button" class="btn btn--ghost" :disabled="pending" @click="refresh">
               {{ pending ? 'Refreshing…' : 'Refresh' }}
            </button>
         </div>
         <ProfileReport :report="report" />
      </template>
   </div>
</template>
