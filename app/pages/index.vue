<script setup lang="ts">
import { useRuntimeConfig } from 'nuxt/app'

const config = useRuntimeConfig()
const appName = (config.public?.appName as string) || 'Polars CSV Profiler'

useHead({
   title: 'Upload',
   meta: [{ name: 'description', content: 'Upload a CSV for server-side data profiling with nodejs-polars.' }],
})
</script>

<template>
   <div class="page-landing">
      <section class="hero">
         <h1 class="hero__title">{{ appName }}</h1>
         <p class="hero__lead">
            Upload any CSV and get a rich, <strong>server-rendered</strong> profiling report — schema, missing values,
            distributions, duplicates, and quality checks — powered by Rust via <code>nodejs-polars</code>.
         </p>
         <ul class="hero__bullets">
            <li>Dynamic SSR — crawlable HTML on first paint</li>
            <li>Heavy stats bounded with sampling on large files</li>
            <li>Interactive charts hydrate client-side (SVG fallback for no-JS)</li>
         </ul>
      </section>

      <FileUpload />

      <section class="demo-cta">
         <h2 class="demo-cta__title">No file handy?</h2>
         <p class="demo-cta__text">
            Open the built-in sales demo — same pipeline as a real upload, cached for fast repeat visits.
         </p>
         <div class="demo-cta__actions">
            <NuxtLink to="/report/demo" class="btn btn--primary">View demo report</NuxtLink>
            <a href="/api/sample.csv" class="btn btn--ghost" download>Download sample CSV</a>
         </div>
      </section>
   </div>
</template>
