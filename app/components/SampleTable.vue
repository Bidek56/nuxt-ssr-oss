<script setup lang="ts">
import { cellValue } from '~/utils/format'

const props = defineProps<{
   columns: string[]
   rows: Record<string, unknown>[]
   note?: string
}>()
</script>

<template>
      <figure class="sample-table">
          <div class="sample-table__scroll">
              <table class="sample-table__grid">
                  <thead>
                          <tr>
                              <th
                                   v-for="c in columns"
                                 :key="c"
                                  class="sample-table__th"
                               >
                                   {{ c }}
                         </th>
                    </tr>
                 </thead>
                 <tbody>
                     <tr v-for="(row, i) in rows" :key="i">
                             <td
                                  v-for="c in columns"
                                :key="c"
                                 class="sample-table__td"
                              >
                                   <span v-if="row[c] === null || row[c] === undefined" class="cell-null">null</span>
                                    <template v-else>{{ cellValue(row[c]) }}</template>
                            </td>
                     </tr>
                 </tbody>
              </table>
             </div>
             <figcaption v-if="note" class="sample-table__note">{{ note }}</figcaption>
        </figure>
</template>
