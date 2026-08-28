<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getNodeUsbDevices } from '@/api/host';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{
  id: string;
  node: string;
  nodes: { label: string; value: string; disable?: boolean }[];
  map?: PveRecord | undefined;
  description: string;
  create: boolean;
  entryOnly: boolean;
  nodeLocked: boolean;
}>();
const emit = defineEmits<{
  submit: [value: { id: string; node: string; map: PveRecord; description: string }];
}>();
const name = shallowRef(props.id);
const selectedNode = shallowRef(props.node);
const comment = shallowRef(props.description);
const mode = shallowRef<'id' | 'path'>(props.map?.path ? 'path' : 'id');
const deviceValue = shallowRef(textValue(props.map?.id));
const pathValue = shallowRef(textValue(props.map?.path));
const devices = shallowRef<PveRecord[]>([]);
const loading = shallowRef(false);
const submitted = shallowRef(false);
const rows = computed<PveRecord[]>(() =>
  devices.value
    .filter((row) => textValue(row.usbpath) && textValue(row.prodid) && Number(row.class) !== 9)
    .map((row) => ({
      ...row,
      deviceKey: `${textValue(row.vendid)}:${textValue(row.prodid)}`,
      portKey: `${textValue(row.busnum)}-${textValue(row.usbpath)}`,
    }))
);
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'key',
    label: gettext('Device'),
    field: (row) => textValue(row.deviceKey || row.portKey),
    align: 'left',
  },
  {
    name: 'manufacturer',
    label: gettext('Manufacturer'),
    field: (row) => textValue(row.manufacturer),
    align: 'left',
  },
  {
    name: 'product',
    label: gettext('Product'),
    field: (row) => textValue(row.product),
    align: 'left',
  },
];
const selectedValue = computed(() => (mode.value === 'id' ? deviceValue.value : pathValue.value));
const canSubmit = computed(() =>
  Boolean(name.value.trim() && (props.entryOnly || (selectedNode.value && selectedValue.value)))
);
async function loadDevices() {
  if (!selectedNode.value || props.entryOnly) return;
  loading.value = true;
  try {
    devices.value = (await getNodeUsbDevices(selectedNode.value)).data || [];
  } finally {
    loading.value = false;
  }
}
function selectedDevice(row: PveRecord | undefined) {
  if (!row) return;
  if (mode.value === 'id') deviceValue.value = textValue(row.deviceKey);
  else pathValue.value = textValue(row.portKey);
}
function submit() {
  submitted.value = true;
  if (!canSubmit.value) return;
  const row = rows.value.find(
    (item) => textValue(mode.value === 'id' ? item.deviceKey : item.portKey) === selectedValue.value
  );
  const id =
    mode.value === 'path'
      ? row
        ? `${textValue(row.vendid)}:${textValue(row.prodid)}`
        : textValue(props.map?.id)
      : deviceValue.value;
  emit('submit', {
    id: name.value.trim(),
    node: selectedNode.value,
    map: {
      node: selectedNode.value,
      id,
      ...(mode.value === 'path' ? { path: pathValue.value } : {}),
    },
    description: comment.value.trim(),
  });
}
defineExpose({ submit });
watch(selectedNode, () => void loadDevices());
if (selectedNode.value) void loadDevices();
</script>
<template>
  <div class="q-pa-sm u-dense mapping-editor">
    <div class="u-border q-pa-md">
      <div class="mapping-editor__form-grid">
        <div class="mapping-editor__form-cell">
          <q-input
            v-model="name"
            dense
            class="q-field--with-bottom"
            :disable="!create"
            :label="`${gettext('Name')} *`"
            :error="submitted && !name.trim()"
            :error-message="gettext('This field is required')"
          />
        </div>
        <div
          v-if="!entryOnly"
          class="mapping-editor__form-cell"
        >
          <q-select
            v-if="!nodeLocked"
            v-model="selectedNode"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="nodes"
            :label="`${gettext('Mapping on Node')} *`"
            :error="submitted && !selectedNode"
            :error-message="gettext('This field is required')"
          />
          <q-input
            v-else
            :model-value="selectedNode"
            dense
            class="q-field--with-bottom"
            disable
            :label="`${gettext('Mapping on Node')} *`"
          />
        </div>
        <div
          v-if="create || entryOnly"
          class="mapping-editor__form-cell mapping-editor__form-cell--full"
        >
          <q-input
            v-model="comment"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
      </div>
         <section
      v-if="!entryOnly"
      class="mapping-editor__device-section q-mt-sm"
    >
      <div class="mapping-editor__choice">
        <q-radio
          v-model="mode"
          val="id"
          dense
          color="primary"
          :label="gettext('Use USB Vendor/Device ID')"
        />
        <SelectTable
          v-model="deviceValue"
          class="q-field--with-bottom"
          field-style="standard"
          row-key="deviceKey"
          :rows="rows"
          :columns="columns"
          :display-value="deviceValue"
          :loading="loading"
          :get-row-value="(row) => textValue(row.deviceKey)"
          :disable="mode !== 'id'"
          :label="gettext('Choose Device')"
          @selected="selectedDevice"
        />
        <div
          v-if="submitted && mode === 'id' && !deviceValue"
          class="mapping-editor__validation-error"
        >
          {{ gettext('This field is required') }}
        </div>
      </div>
      <div class="mapping-editor__choice">
        <q-radio
          v-model="mode"
          val="path"
          dense
          color="primary"
          :label="gettext('Use USB Port')"
        />
        <SelectTable
          v-model="pathValue"
          class="q-field--with-bottom"
          field-style="standard"
          row-key="portKey"
          :rows="rows"
          :columns="columns"
          :display-value="pathValue"
          :loading="loading"
          :get-row-value="(row) => textValue(row.portKey)"
          :disable="mode !== 'path'"
          :label="gettext('Choose Port')"
          @selected="selectedDevice"
        />
        <div
          v-if="submitted && mode === 'path' && !pathValue"
          class="mapping-editor__validation-error"
        >
          {{ gettext('This field is required') }}
        </div>
      </div>
    </section>
    </div>
 
  </div>
</template>

<style scoped>
.mapping-editor__device-section {
  padding-top: 8px;
  border-top: 1px solid #dfe1e6;
}

.mapping-editor__form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 0;
}

.mapping-editor__form-cell--full {
  grid-column: 1 / -1;
}

.mapping-editor__choice + .mapping-editor__choice {
  margin-top: 0;
}

.mapping-editor__choice :deep(.q-radio) {
  margin-bottom: 4px;
}

.mapping-editor__validation-error {
  margin-top: 4px;
  color: var(--q-negative);
  font-size: 12px;
}

@media (max-width: 599px) {
  .mapping-editor__form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .mapping-editor__form-cell--full {
    grid-column: auto;
  }
}
</style>
