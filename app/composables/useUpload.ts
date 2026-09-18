// useUpload — client-side CSV upload with progress.
//
// Uses XMLHttpRequest so we can report upload progress. On success the caller
// navigates to /report/:jobId, where the page performs the (cached) profile.
import { ref, type Ref } from 'vue'
import type { UploadResult } from '~/shared/types'

export interface UploadState {
   uploading: Ref<boolean>
   progress: Ref<number>  // 0..100
   error: Ref<string>
   last: Ref<UploadResult | null>
   upload: (file: File) => Promise<UploadResult>
   reset: () => void
}

export function useUpload(): UploadState {
   const uploading = ref(false)
   const progress = ref(0)
   const error = ref('')
   const last = ref<UploadResult | null>(null)

   function reset() {
      uploading.value = false
      progress.value = 0
      error.value = ''
      last.value = null
   }

   function upload(file: File): Promise<UploadResult> {
      error.value = ''
      progress.value = 0
      uploading.value = true

      return new Promise<UploadResult>((resolve, reject) => {
         const form = new FormData()
         form.append('file', file, file.name)

         const xhr = new XMLHttpRequest()
         xhr.open('POST', '/api/upload', true)

         xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100)
         }

         xhr.onload = () => {
            uploading.value = false
            if (xhr.status >= 200 && xhr.status < 300) {
               try {
                  const data = JSON.parse(xhr.responseText) as UploadResult
                  last.value = data
                  progress.value = 100
                  resolve(data)
               } catch (e) {
                  error.value = 'Invalid response from the server.'
                  reject(e)
               }
            } else {
               let msg = xhr.statusText || `Upload failed (HTTP ${xhr.status})`
               try {
                  const body = JSON.parse(xhr.responseText) as { statusMessage?: string; message?: string }
                  msg = body.statusMessage || body.message || msg
               } catch {
                  /* keep default */
               }
               error.value = msg
               progress.value = 0
               reject(new Error(error.value))
            }
         }

         xhr.onerror = () => {
            uploading.value = false
            error.value = 'Network error — could not reach the server.'
            reject(new Error(error.value))
         }

         xhr.ontimeout = () => {
            uploading.value = false
            error.value = 'The upload timed out.'
            reject(new Error(error.value))
         }

         xhr.timeout = 5 * 60 * 1000 // 5 minutes
         xhr.send(form)
      })
   }

   return { uploading, progress, error, last, upload, reset }
}
