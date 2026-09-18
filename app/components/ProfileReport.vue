<script setup lang="ts">
import type { ProfileReport } from '~/shared/types'

defineProps<{ report: ProfileReport }>()
</script>

<template>
   <div class="profile-report">
      <DatasetSummary :report="report" />

      <QualityChecks :messages="report.qualitySummary" />

      <section class="profile-section">
         <header class="profile-section__head">
            <h2 class="profile-section__title">Column profiles</h2>
            <p class="profile-section__sub">{{ report.columns.length }} columns · server-rendered stats</p>
         </header>
         <div class="column-grid">
            <ColumnCard v-for="col in report.columns" :key="col.name" :column="col" />
         </div>
      </section>

      <section class="profile-section">
         <header class="profile-section__head">
            <h2 class="profile-section__title">Sample preview</h2>
            <p class="profile-section__sub">First {{ report.previewRows.length }} rows</p>
         </header>
         <SampleTable
            :columns="report.previewColumns"
            :rows="report.previewRows"
            note="Preview is read from the head of the file; histograms and top values may use a bounded sample on very large files."
         />
      </section>
   </div>
</template>
