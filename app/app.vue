<script setup lang="ts">
import { useRuntimeConfig } from 'nuxt/app'

const config = useRuntimeConfig()
const appName = (config.public?.appName as string) || 'Polars CSV Profiler'
const now = new Date().getFullYear()
</script>

<template>
   <div class="app-shell">
      <header class="site-header">
         <NuxtLink to="/" class="brand">
            <span class="brand__mark">▚</span>
            <span class="brand__name">{{ appName }}</span>
            <span class="brand__tag">Rust · nodejs-polars · SSR</span>
         </NuxtLink>
         <nav class="site-nav">
            <NuxtLink to="/">Profile</NuxtLink>
            <NuxtLink to="/report/demo">Demo report</NuxtLink>
            <a href="/api/health" target="_blank" rel="noreferrer" class="nav-health">health</a>
            <a href="https://github.com/pola-rs/nodejs-polars" target="_blank" rel="noreferrer">nodejs-polars ↗</a>
         </nav>
      </header>

      <main class="site-main">
         <NuxtPage />
      </main>

      <footer class="site-footer">
         <p>
            Server-rendered with Nuxt 4 · dynamic SSR · native <code>nodejs-polars</code> engine.
            Reports are cached on the server; charts hydrate client-side with an SVG fallback.
         </p>
         <p class="site-footer__year">© {{ now }} · Polars CSV Profiler</p>
      </footer>
   </div>
</template>
