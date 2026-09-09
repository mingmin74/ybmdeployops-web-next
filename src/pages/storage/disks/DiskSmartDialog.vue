<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  disk: string;
  loading: boolean;
  values: PveRecord;
}>();
const emit = defineEmits<{ reload: [] }>();

const columns: QTableColumn<PveRecord>[] = [
  { name: 'id', label: 'ID', field: 'id', align: 'right' },
  { name: 'name', label: gettext('Attribute'), field: 'name', align: 'left' },
  { name: 'value', label: gettext('Value'), field: (row) => row.raw ?? row.value, align: 'left' },
  { name: 'normalized', label: gettext('Normalized'), field: (row) => row.normalized ?? row.value, align: 'right' },
  { name: 'threshold', label: gettext('Threshold'), field: 'threshold', align: 'right' },
  { name: 'worst', label: gettext('Worst'), field: 'worst', align: 'right' },
  { name: 'flags', label: gettext('Flags'), field: 'flags', align: 'left' },
  { name: 'fail', label: gettext('Failing'), field: 'fail', align: 'left' },
];
const attributes = computed(() => Array.isArray(props.values.attributes) ? props.values.attributes as PveRecord[] : []);
const isText = computed(() => props.values.type === 'text');
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="`${gettext('S.M.A.R.T. Values')} (${disk})`" width="800px" :loading="loading">
      <pre v-if="isText" class="smart-text q-ma-none q-pa-sm">{{ textValue(values.text) }}</pre>
      <q-table
        v-else
        flat
        dense
        row-key="id"
        table-header-class="u-table-header"
        :rows="attributes"
        :columns="columns"
        :rows-per-page-options="[0]"
        :pagination="{ page: 1, rowsPerPage: 0 }"
        :no-data-label="gettext('No S.M.A.R.T. Values')"
        hide-bottom
      />
      <template #foot>
        <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Reload')" @click="emit('reload')" />
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Close')" />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.smart-text {
  min-height: 280px;
  max-height: 430px;
  overflow: auto;
  white-space: pre;
  font-family: monospace;
}
</style>
