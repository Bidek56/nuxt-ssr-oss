// useProfile — resolve a ProfileReport for a job id.
//
// `demo` is served by /api/sample-profile; any other id is served by the generic
// /api/profile/:jobId route. Fetched with server: true so the report is fully
// server-rendered into the first HTML payload (crawable / no-JS friendly).
import { useAsyncData } from 'nuxt/app'
import { computed, toValue, type Ref, type MaybeRef } from 'vue'
import type { ProfileReport } from '~/shared/types'

export function profileUrlFor(jobId: string): string {
   return jobId === 'demo'
       ? '/api/sample-profile'
       : `/api/profile/${encodeURIComponent(jobId)}`
}

export interface ProfileQuery {
   report: Ref<ProfileReport | null>
   pending: Ref<boolean>
   error: Ref<Error | null>
   refresh: () => Promise<void>
}

export function useProfile(jobId: MaybeRef<string>): ProfileQuery {
   const id = computed(() => toValue(jobId))

   const { data, pending, error, execute } = useAsyncData<ProfileReport | null>(
      () => `profile:${id.value}`,
      async () => {
         // A relative URL keeps same-origin on both server and client.
         return await $fetch<ProfileReport>(profileUrlFor(id.value))
      },
      { server: true, watch: [id] },
   )

   return {
       report: data,
     pending,
     error,
     refresh: () => execute(),
      }
}
