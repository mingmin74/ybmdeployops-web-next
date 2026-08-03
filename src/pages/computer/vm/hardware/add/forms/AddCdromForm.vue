<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { formatBytes, textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../../context/vmHardwareContext';

type CdromBus = 'ide' | 'sata' | 'scsi';
type CdromMediaType = 'iso' | 'cdrom' | 'none';

interface AddCdromFormModel {
  cdromMediaType: CdromMediaType;
  cdromStorage: string;
  cdromVolid: string;
  cdromBus: CdromBus;
  cdromDeviceId: number;
}

const form = defineModel<AddCdromFormModel>('form', { required: true });
const { deviceInUse = false } = defineProps<{ deviceInUse?: boolean }>();
const { node } = useVmHardwareContext();

const storageRows = shallowRef<PveRecord[]>([]);
const isoRows = shallowRef<PveRecord[]>([]);
const storageLoading = shallowRef(false);
const isoLoading = shallowRef(false);

const cdromBusLimits: Record<CdromBus, number> = {
  ide: 4,
  sata: 6,
  scsi: 31,
};

const busOptions = [
  { label: 'IDE', value: 'ide' },
  { label: 'SATA', value: 'sata' },
  { label: 'SCSI', value: 'scsi' },
];

const storageColumns: QTableColumn<PveRecord>[] = [
  { name: 'storage', label: gettext('Storage'), field: (row) => textValue(row.storage), align: 'left' },
  { name: 'type', label: gettext('Type'), field: (row) => textValue(row.type), align: 'left' },
  { name: 'avail', label: gettext('Avail'), field: (row) => formatBytes(textValue(row.avail)), align: 'right' },
  { name: 'total', label: gettext('Total'), field: (row) => formatBytes(textValue(row.total)), align: 'right' },
];

const isoColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'volid',
    label: gettext('ISO image'),
    field: (row) => isoImageName(row.volid),
    align: 'left',
    style: 'width: 290px; max-width: 290px',
    headerStyle: 'width: 290px',
  },
  { name: 'format', label: gettext('Format'), field: (row) => textValue(row.format), align: 'left' },
  { name: 'size', label: gettext('Size'), field: (row) => formatIsoSize(row.size), align: 'right' },
];

const deviceMax = computed(() => cdromBusLimits[form.value.cdromBus] - 1);
const isoDisabled = computed(() => form.value.cdromMediaType !== 'iso');
const storageDisplay = computed(() => form.value.cdromStorage);
const isoDisplay = computed(() => isoImageName(form.value.cdromVolid));
const storageError = computed(() => form.value.cdromMediaType === 'iso' && !form.value.cdromStorage);
const isoError = computed(() => form.value.cdromMediaType === 'iso' && !form.value.cdromVolid);
const deviceError = computed(
  () =>
    deviceInUse ||
    form.value.cdromDeviceId < 0 ||
    form.value.cdromDeviceId > deviceMax.value
);

function isoImageName(value: unknown) {
  return textValue(value).replace(/^.*:(.*\/)?/, '');
}

function formatIsoSize(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unitIndex = 0;
  let displaySize = size;
  while (displaySize >= 1024 && unitIndex < units.length - 1) {
    displaySize /= 1024;
    unitIndex += 1;
  }
  return `${displaySize >= 10 || unitIndex === 0 ? displaySize.toFixed(0) : displaySize.toFixed(1)} ${units[unitIndex]}`;
}

async function loadStorages() {
  storageLoading.value = true;
  try {
    const response = await getNodeStorage(node.value, 'iso');
    storageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage))
    );
    const storageNames = storageRows.value.map((row) => textValue(row.storage)).filter(Boolean);
    if (!storageNames.includes(form.value.cdromStorage)) {
      form.value.cdromStorage = storageNames[0] || '';
    }
  } finally {
    storageLoading.value = false;
  }
}

async function loadIsoImages(selectFirst = false) {
  if (!form.value.cdromStorage) {
    isoRows.value = [];
    form.value.cdromVolid = '';
    return;
  }
  isoLoading.value = true;
  try {
    const response = await getStorageContent(node.value, form.value.cdromStorage, 'iso');
    isoRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.volid).localeCompare(textValue(right.volid))
    );
    const selectedExists = isoRows.value.some(
      (row) => textValue(row.volid) === form.value.cdromVolid
    );
    if (selectFirst || !selectedExists) {
      form.value.cdromVolid = textValue(isoRows.value[0]?.volid);
    }
  } finally {
    isoLoading.value = false;
  }
}

watch(
  () => form.value.cdromStorage,
  () => {
    if (form.value.cdromMediaType === 'iso') void loadIsoImages(true);
  },
);

watch(
  () => form.value.cdromMediaType,
  (mediaType) => {
    if (mediaType === 'iso') void loadIsoImages(false);
  },
);

onMounted(async () => {
  await loadStorages();
  if (form.value.cdromMediaType === 'iso') await loadIsoImages(false);
});
</script>

<template>
  <div class="add-cdrom-form u-dense">
    <div class="column u-border q-pa-md">
      <div class="row q-col-gutter-sm">
        <div class="col-8">
          <q-select
            v-model="form.cdromBus"
            class="q-field--with-bottom"
            dense
            options-dense
            emit-value
            map-options
            :label="gettext('Bus/Device')"
            :options="busOptions"
          />
        </div>
        <div class="col-4">
          <q-input
            v-model.number="form.cdromDeviceId"
            class="q-field--with-bottom"
            dense
            type="number"
            min="0"
            :max="deviceMax"
            :label="gettext('Device')"
            :error="deviceError"
            :error-message="deviceInUse ? gettext('This device is already in use') : `${gettext('Value must be between')} 0 ${gettext('and')} ${deviceMax}`"
          />
        </div>

        <div class="col-12">
          <q-radio
            v-model="form.cdromMediaType"
            dense
            val="iso"
            :label="gettext('Use CD/DVD disc image file (iso)')"
          />
        </div>
        <div class="col-12 add-cdrom-form__iso-fields">
          <SelectTable
            v-model="form.cdromStorage"
            row-key="storage"
            field-style="standard"
            width="500px"
            style="width: 390px"
            :rows="storageRows"
            :columns="storageColumns"
            :display-value="storageDisplay"
            :loading="storageLoading"
            :get-row-value="(row) => textValue(row.storage)"
            :disable="isoDisabled"
            :error="storageError"
            :error-message="gettext('This field is required')"
            :label="gettext('Storage')"
          />
          <SelectTable
            v-model="form.cdromVolid"
            row-key="volid"
            field-style="standard"
            width="500px"
            style="width: 390px"
            :rows="isoRows"
            :columns="isoColumns"
            :display-value="isoDisplay"
            :loading="isoLoading"
            :get-row-value="(row) => textValue(row.volid)"
            :disable="isoDisabled"
            :error="isoError"
            :error-message="gettext('This field is required')"
            :label="gettext('ISO image')"
          />
        </div>
        <div class="col-12">
          <q-radio
            v-model="form.cdromMediaType"
            dense
            val="cdrom"
            :label="gettext('Use physical CD/DVD Drive')"
          />
        </div>
        <div class="col-12">
          <q-radio
            v-model="form.cdromMediaType"
            dense
            val="none"
            :label="gettext('Do not use any media')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-cdrom-form__iso-fields {
  padding-left: 36px;
}

.add-cdrom-form__iso-fields > * + * {
  margin-top: 8px;
}
</style>
