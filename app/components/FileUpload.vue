<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRuntimeConfig } from 'nuxt/app'
import { useUpload } from '~/composables/useUpload'

const router = useRouter()
const config = useRuntimeConfig()
const maxMb = (config.public?.maxFileSizeMb as number) || 200

const { uploading, progress, error, upload, reset } = useUpload()
const dragOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function openPicker() {
   inputRef.value?.click()
}

async function handleFiles(files: FileList | File[] | null) {
   const file = files?.[0]
   if (!file) return
   if (!/\.csv$/i.test(file.name) && file.type && !file.type.includes('csv') && file.type !== 'text/plain') {
      error.value = 'Please choose a .csv file.'
      return
   }
   try {
      const result = await upload(file)
      await router.push(`/report/${result.jobId}`)
   } catch {
      /* error ref set in composable */
   }
}

function onInputChange(e: Event) {
   const input = e.target as HTMLInputElement
   void handleFiles(input.files)
   input.value = ''
}

function onDrop(e: DragEvent) {
   dragOver.value = false
   e.preventDefault()
   void handleFiles(e.dataTransfer?.files ?? null)
}

function onDragOver(e: DragEvent) {
   e.preventDefault()
   dragOver.value = true
}

function onDragLeave() {
   dragOver.value = false
}
</script>

<template>
   <div class="upload-panel">
      <div
         class="upload-drop"
         :class="{ 'upload-drop--active': dragOver, 'upload-drop--busy': uploading }"
         role="button"
         tabindex="0"
         aria-label="Upload a CSV file"
         @click="openPicker"
         @keydown.enter.prevent="openPicker"
         @keydown.space.prevent="openPicker"
         @dragover="onDragOver"
         @dragleave="onDragLeave"
         @drop="onDrop"
      >
         <input
            ref="inputRef"
            type="file"
            accept=".csv,text/csv,text/plain"
            class="upload-drop__input"
            :disabled="uploading"
            @change="onInputChange"
         />
         <div v-if="uploading" class="upload-drop__progress">
            <div class="upload-drop__bar" :style="{ width: `${progress}%` }" />
            <p class="upload-drop__status">Uploading… {{ progress }}%</p>
         </div>
         <template v-else>
            <p class="upload-drop__title">Drop a CSV here or click to browse</p>
            <p class="upload-drop__hint">Max {{ maxMb }} MB · profiling runs on the server via nodejs-polars</p>
         </template>
      </div>

      <p v-if="error" class="upload-error" role="alert">
         {{ error }}
         <button type="button" class="upload-error__retry" @click="reset">Dismiss</button>
      </p>
   </div>
</template>
