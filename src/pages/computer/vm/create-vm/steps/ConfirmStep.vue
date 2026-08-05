<script setup lang="ts">
import { gettext } from '@/locale';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { derived } = useCreateVmWizardContext();
const { summaryRows, stepContentHeight } = derived;
</script>

<template>
  <q-scroll-area class="q-pa-sm u-size-13" :style="{ height: stepContentHeight('confirm') }">
    <q-markup-table flat dense class="vm-create-summary u-border-dotted-blue bg-white">
      <thead>
        <tr>
          <th class="text-left">{{ gettext('Key') }}</th>
          <th class="text-left">{{ gettext('Value') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summaryRows" :key="row[0]">
          <td>{{ row[0] }}</td>
          <td class="vm-create-summary-value">{{ row[1] }}</td>
        </tr>
      </tbody></q-markup-table
    >
  </q-scroll-area>
</template>

<style scoped>
.vm-create-summary td:first-child {
  width: 180px;
  color: #666666;
}
.vm-create-summary-value {
  white-space: normal;
  word-break: break-all;
}
</style>
