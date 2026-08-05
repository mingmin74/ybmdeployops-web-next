<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed } from 'vue';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import type { PveRecord } from '@/api/resources';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

const { form, resources, errors } = useCreateCtWizardContext();
const { validationErrors } = errors;

const storageRows = computed<PveRecord[]>(() => resources.storageOptions.value.map((storage) => ({
  storage,
  type: 'storage',
  content: 'vztmpl',
})));
const templateRows = computed<PveRecord[]>(() => resources.templateRows.value);
function templateValue(row: PveRecord) {
  return String(row.volid || row.filename || '');
}
function templateName(row: PveRecord) {
  return templateValue(row).replace(/^.*:(.*\/)?/, '');
}
function formatSize(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let displaySize = size;
  let unitIndex = 0;
  while (displaySize >= 1024 && unitIndex < units.length - 1) {
    displaySize /= 1024;
    unitIndex += 1;
  }
  return `${displaySize >= 10 || unitIndex === 0 ? Math.round(displaySize) : displaySize.toFixed(1)} ${units[unitIndex]}`;
}
const storageColumns: QTableColumn<PveRecord>[] = [
  { name: 'storage', label: gettext('Storage'), field: (row) => String(row.storage || ''), align: 'left' },
  { name: 'type', label: gettext('Type'), field: (row) => String(row.type || ''), align: 'left' },
  { name: 'content', label: gettext('Content'), field: (row) => String(row.content || ''), align: 'left' },
];
const templateColumns: QTableColumn<PveRecord>[] = [
  { name: 'volid', label: gettext('Template'), field: templateName, align: 'left', style: 'width: 320px; max-width: 320px', headerStyle: 'width: 320px' },
  { name: 'format', label: gettext('Format'), field: (row) => String(row.format || ''), align: 'left', style: 'width: 90px', headerStyle: 'width: 90px' },
  { name: 'size', label: gettext('Size'), field: (row) => formatSize(row.size), align: 'right', style: 'width: 100px', headerStyle: 'width: 100px' },
];
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <div class="col">
          <SelectTable
            v-model="form.templateStorage"
            row-key="storage"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="storageRows"
            :columns="storageColumns"
            :display-value="form.templateStorage"
            :get-row-value="(row) => String(row.storage || '')"
            :error="Boolean(validationErrors.templateStorage)"
            :error-message="validationErrors.templateStorage"
            :label="gettext('Storage')"
          />
        </div>
        <div class="col">
          <SelectTable
            v-model="form.ostemplate"
            row-key="volid"
            field-style="standard"
            fixed-layout
            width="500px"
            class="q-field--with-bottom"
            :rows="templateRows"
            :columns="templateColumns"
            :display-value="form.ostemplate"
            :get-row-value="templateValue"
            :disable="!form.templateStorage"
            :error="Boolean(validationErrors.ostemplate)"
            :error-message="validationErrors.ostemplate"
            :label="gettext('Template')"
          />
        </div>
      </div>
    </div>
  </q-scroll-area>
</template>
