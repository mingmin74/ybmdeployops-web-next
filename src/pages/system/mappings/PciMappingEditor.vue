<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getNodePciDevices } from '@/api/host';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{
  id: string;
  node: string;
  nodes: { label: string; value: string; disable?: boolean }[];
  maps: PveRecord[];
  global: { description: string; mdev: boolean; liveMigration: boolean };
  create: boolean;
  entryOnly: boolean;
  nodeLocked: boolean;
}>();
const emit = defineEmits<{
  submit: [
    value: {
      id: string;
      node: string;
      maps: PveRecord[];
      description: string;
      mdev: boolean;
      liveMigration: boolean;
    }
  ];
}>();

const name = shallowRef(props.id);
const selectedNode = shallowRef(props.node);
const description = shallowRef(props.global.description);
const mdev = shallowRef(props.global.mdev);
const liveMigration = shallowRef(props.global.liveMigration);
const devices = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const loading = shallowRef(false);
const submitted = shallowRef(false);
const columns: QTableColumn<PveRecord>[] = [
  { name: 'id', label: gettext('ID'), field: (row) => textValue(row.id), align: 'left' },
  {
    name: 'iommugroup',
    label: gettext('IOMMU Group'),
    field: (row) => textValue(row.iommugroup),
    align: 'left',
  },
  {
    name: 'vendor',
    label: gettext('Vendor'),
    field: (row) => textValue(row.vendor_name || row.vendor),
    align: 'left',
  },
  {
    name: 'device',
    label: gettext('Device'),
    field: (row) => textValue(row.device_name || row.device),
    align: 'left',
  },
];
const noIommu = computed(
  () => devices.value.length > 0 && devices.value.every((row) => Number(row.iommugroup) === -1)
);
function hasMdev(row: PveRecord) {
  return row.mdev === true || textValue(row.mdev) === '1';
}
const visibleDevices = computed(() => (mdev.value ? devices.value.filter(hasMdev) : devices.value));
const multipleWarning = computed(() => selected.value.length > 1);
const groupWarning = computed(() =>
  selected.value.some((current) => {
    const group = Number(current.iommugroup);
    const path = textValue(current.id);
    return (
      group >= 0 &&
      devices.value.some(
        (row) =>
          Number(row.iommugroup) === group &&
          textValue(row.id) !== path &&
          !textValue(row.id).startsWith(path)
      )
    );
  })
);
const canSubmit = computed(() =>
  Boolean(name.value.trim() && (props.entryOnly || (selectedNode.value && selected.value.length)))
);

function normalizedId(row: PveRecord, key: string) {
  return textValue(row[key]).replace(/0x/g, '');
}
function mapFromDevice(device: PveRecord): PveRecord {
  const group = Number(device.iommugroup);
  return {
    node: selectedNode.value,
    path: textValue(device.id),
    id: `${normalizedId(device, 'vendor')}:${normalizedId(device, 'device')}`,
    'subsystem-id': `${normalizedId(device, 'subsystem_vendor')}:${normalizedId(
      device,
      'subsystem_device'
    )}`,
    ...(group !== -1 ? { iommugroup: group } : {}),
  };
}
async function loadDevices() {
  selected.value = [];
  if (!selectedNode.value || props.entryOnly) return;
  loading.value = true;
  try {
    devices.value = (await getNodePciDevices(selectedNode.value)).data || [];
    const paths = new Set(props.maps.map((map) => textValue(map.path)));
    selected.value = devices.value.filter((device) => paths.has(textValue(device.id)));
  } finally {
    loading.value = false;
  }
}
function submit() {
  submitted.value = true;
  if (!canSubmit.value) return;
  // Keep configured paths which are currently not returned by the host scan; editing a
  // mapping must never silently discard a PCI device merely because it is unavailable.
  const availablePaths = new Set(devices.value.map((device) => textValue(device.id)));
  const unavailable = props.maps.filter((map) => !availablePaths.has(textValue(map.path)));
  emit('submit', {
    id: name.value.trim(),
    node: selectedNode.value,
    maps: [...selected.value.map(mapFromDevice), ...unavailable],
    description: description.value.trim(),
    mdev: mdev.value,
    liveMigration: liveMigration.value,
  });
}
defineExpose({ submit });
watch(selectedNode, () => void loadDevices());
watch(mdev, () => {
  selected.value = selected.value.filter((device) => !mdev.value || hasMdev(device));
});
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
            v-model="description"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
      </div>
      <div
        v-if="create || entryOnly"
        class="mapping-editor__options"
      >
        <div class="mapping-editor__option">
          <q-checkbox
            v-model="mdev"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Use with Mediated Devices')"
          />
        </div>
        <div class="mapping-editor__option">
          <q-checkbox
            v-model="liveMigration"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Live Migration Capable')"
          />
        </div>
      </div>
      <section
        v-if="!entryOnly"
        class="mapping-editor__device-section q-mt-sm"
      >
        <div class="mapping-editor__required-label">{{ gettext('PCI Device') }} *</div>
        <q-table
          flat
          dense
          bordered
          row-key="id"
          selection="multiple"
          :rows="visibleDevices"
          :columns="columns"
          :selected="selected"
          :loading="loading"
          :pagination="{ rowsPerPage: 8 }"
          @update:selected="selected = [...$event]"
        />
        <div
          v-if="noIommu || multipleWarning || groupWarning"
          class="mapping-editor__hint"
        >
          <div v-if="noIommu">
            {{
              gettext(
                'No IOMMU detected, please activate it. See Documentation for further information.'
              )
            }}
          </div>
          <div v-if="multipleWarning">
            {{
              gettext(
                'When multiple devices are selected, the first free one will be chosen on guest start.'
              )
            }}
          </div>
          <div v-if="groupWarning">
            {{
              gettext(
                'A selected device is not in a separate IOMMU group, make sure this is intended.'
              )
            }}
          </div>
        </div>
        <div
          v-if="submitted && selected.length === 0"
          class="mapping-editor__validation-error"
        >
          {{ gettext('This field is required') }}
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mapping-editor__hint {
  padding: 8px 10px;
  border: 1px solid #f3d29a;
  background: #fff7e6;
  color: #8a5a00;
  font-size: 12px;
}

.mapping-editor__form-grid,
.mapping-editor__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 0;
}

.mapping-editor__form-cell--full {
  grid-column: 1 / -1;
}

.mapping-editor__options {
  margin-top: 0;
}

.mapping-editor__device-section {
  padding-top: 8px;
  border-top: 1px solid #dfe1e6;
}

.mapping-editor__required-label {
  margin-bottom: 4px;
  color: #333;
  font-size: 12px;
}

.mapping-editor__validation-error {
  margin-top: 4px;
  color: var(--q-negative);
  font-size: 12px;
}

@media (max-width: 599px) {
  .mapping-editor__form-grid,
  .mapping-editor__options {
    grid-template-columns: minmax(0, 1fr);
  }

  .mapping-editor__form-cell--full {
    grid-column: auto;
  }
}
</style>
