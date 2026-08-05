<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { getNodeStorage } from '@/api/storageContent';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { formatBytes, textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

type CloudInitBus = 'ide' | 'sata' | 'scsi';

const visible = defineModel<boolean>({ default: false });
const form = reactive<{
  bus: CloudInitBus;
  deviceId: number;
  storage: string;
  format: string;
}>({
  bus: 'ide',
  deviceId: 2,
  storage: '',
  format: 'raw',
});
const imageStorageRows = shallowRef<PveRecord[]>([]);
const storageLoading = shallowRef(false);
const { config, hasVmCapability, loading, node, updateConfig } = useVmHardwareContext();

const busOptions = [
  { label: 'IDE', value: 'ide' },
  { label: 'SATA', value: 'sata' },
  { label: 'SCSI', value: 'scsi' },
];

const busMaxIds: Record<CloudInitBus, number> = {
  ide: 3,
  sata: 5,
  scsi: 13,
};

const storageColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'storage',
    label: gettext('Storage'),
    field: (row) => textValue(row.storage),
    align: 'left',
  },
  { name: 'type', label: gettext('Type'), field: (row) => textValue(row.type), align: 'left' },
  {
    name: 'avail',
    label: gettext('Avail'),
    field: (row) => formatBytes(textValue(row.avail)),
    align: 'right',
  },
  {
    name: 'total',
    label: gettext('Total'),
    field: (row) => formatBytes(textValue(row.total)),
    align: 'right',
  },
];

const diskFormatOptions = computed(() =>
  ['raw', 'qcow2', 'vmdk']
    .filter((format) => storageFormats.value.supported.includes(format))
    .map((value) => ({
      label:
        value === 'raw'
          ? `${gettext('Raw disk image')} (raw)`
          : value === 'qcow2'
            ? `${gettext('QEMU image format')} (qcow2)`
            : `${gettext('VMware image format')} (vmdk)`,
      value,
    })),
);
const storageFormats = computed(() => storageFormatInfo(form.storage));
const diskFormatDisabled = computed(() => diskFormatOptions.value.length <= 1);
const deviceMax = computed(() => busMaxIds[form.bus]);
const deviceIdValid = computed(
  () => Number.isInteger(form.deviceId) && form.deviceId >= 0 && form.deviceId <= deviceMax.value,
);
const deviceKey = computed(() => `${form.bus}${form.deviceId}`);
const deviceInUse = computed(
  () => deviceIdValid.value && config.value[deviceKey.value] !== undefined,
);
const hasCloudInitDrive = computed(() =>
  Object.entries(config.value).some(
    ([key, value]) => /^(ide|scsi|sata)\d+$/.test(key) && textValue(value).includes('cloudinit'),
  ),
);
const dialogLoading = computed(() => loading.value || storageLoading.value);
const canAdd = computed(
  () =>
    hasVmCapability('VM.Config.CDROM') &&
    hasVmCapability('VM.Config.Cloudinit') &&
    !hasCloudInitDrive.value &&
    Boolean(form.storage.trim()) &&
    deviceIdValid.value &&
    !deviceInUse.value,
);

function storageFormatInfo(storageName: string) {
  const storage = imageStorageRows.value.find((row) => textValue(row.storage) === storageName);
  const formats = storage?.formats;
  let supported = ['raw'];
  let defaultFormat = 'raw';
  if (formats && typeof formats === 'object' && !Array.isArray(formats)) {
    const source = formats as Record<string, unknown>;
    if (Array.isArray(source.supported)) {
      supported = source.supported.map(String);
      defaultFormat = textValue(source.default) || defaultFormat;
    } else {
      supported = Object.entries(source)
        .filter(([, enabled]) => enabled)
        .map(([format]) => format);
    }
  } else if (Array.isArray(storage?.format)) {
    const validFormats = storage.format[0];
    defaultFormat = textValue(storage.format[1]) || defaultFormat;
    if (validFormats && typeof validFormats === 'object') {
      supported = Object.entries(validFormats as Record<string, unknown>)
        .filter(([, enabled]) => enabled)
        .map(([format]) => format);
    }
  }
  supported = supported.filter((format) => ['raw', 'qcow2', 'vmdk'].includes(format));
  return { supported: supported.length ? supported : ['raw'], defaultFormat };
}

function resetDiskFormat() {
  const { supported, defaultFormat } = storageFormats.value;
  form.format = supported.includes('qcow2')
    ? 'qcow2'
    : supported.includes(defaultFormat)
      ? defaultFormat
      : supported.includes('raw')
        ? 'raw'
        : supported[0] || 'raw';
}

function canSelectStorage(row: PveRecord) {
  return row.avail === undefined || Number(row.avail) > 0;
}

function nextFreeDevice(preferredBusses: CloudInitBus[] = ['ide', 'scsi', 'sata']) {
  if (preferredBusses.includes('ide') && config.value.ide2 === undefined) {
    return { bus: 'ide' as const, id: 2 };
  }
  for (const bus of preferredBusses) {
    for (let id = 0; id <= busMaxIds[bus]; id += 1) {
      if (config.value[`${bus}${id}`] === undefined) return { bus, id };
    }
  }
  return { bus: preferredBusses[0] || 'ide', id: 0 };
}

function resetDevice() {
  const slot = nextFreeDevice();
  form.bus = slot.bus;
  form.deviceId = slot.id;
}

function clampDeviceId() {
  if (!Number.isFinite(form.deviceId)) {
    form.deviceId = 0;
    return;
  }
  if (form.deviceId > deviceMax.value) form.deviceId = deviceMax.value;
  if (form.deviceId < 0) form.deviceId = 0;
}

async function loadImageStorages() {
  storageLoading.value = true;
  try {
    const response = await getNodeStorage(node.value, 'images');
    imageStorageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage)),
    );
    const firstUsable = imageStorageRows.value.find(canSelectStorage);
    form.storage = textValue(firstUsable?.storage);
    resetDiskFormat();
  } finally {
    storageLoading.value = false;
  }
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  Object.assign(form, { storage: '', format: 'raw' });
  resetDevice();
  void loadImageStorages();
});

watch(
  () => form.bus,
  (bus) => {
    const slot = nextFreeDevice([bus]);
    form.deviceId = slot.id;
  },
);

watch(
  () => form.storage,
  () => {
    resetDiskFormat();
  },
);

async function addCloudInitDrive() {
  if (!canAdd.value) return;
  const parts = [`${form.storage.trim()}:cloudinit`];
  if (!diskFormatDisabled.value && form.format) parts.push(`format=${form.format}`);
  await updateConfig({ [deviceKey.value]: parts.join(',') });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow
      :title="`${gettext('Add')}:${gettext('CloudInit Drive')}`"
      width="430px"
      :loading="dialogLoading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-8">
              <q-select
                v-model="form.bus"
                dense
                options-dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :options="busOptions"
                :label="gettext('Bus/Device')"
              />
            </div>
            <div class="col-4">
              <q-input
                v-model.number="form.deviceId"
                dense
                type="number"
                min="0"
                :max="deviceMax"
                class="q-field--with-bottom"
                :label="gettext('Device')"
                :error="!deviceIdValid || deviceInUse"
                :error-message="
                  deviceInUse ? gettext('This device is already in use') : `[0-${deviceMax}]`
                "
                @blur="clampDeviceId"
                @update:model-value="clampDeviceId"
              />
            </div>
            <div class="col-12">
              <SelectTable
                v-model="form.storage"
                row-key="storage"
                field-style="standard"
                width="500px"
                style="width: 100%"
                class="q-field--with-bottom"
                :rows="imageStorageRows"
                :columns="storageColumns"
                :display-value="form.storage"
                :loading="storageLoading"
                :get-row-value="(row) => textValue(row.storage)"
                :can-select="canSelectStorage"
                :error="!form.storage"
                :error-message="gettext('This field is required')"
                :label="gettext('Storage')"
              />
              <q-select
                v-model="form.format"
                dense
                options-dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :disable="diskFormatDisabled"
                :options="diskFormatOptions"
                :label="gettext('Format')"
              />
            </div>
          </div>
        </div>
        <div v-if="hasCloudInitDrive" class="cloud-init-warning q-mt-sm">
          {{ gettext('CloudInit Drive') }} {{ gettext('This device is already in use') }}
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canAdd"
          :label="gettext('Add')"
          @click="addCloudInitDrive"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.cloud-init-warning {
  padding: 8px 10px;
  border: 1px solid #f3d29a;
  background: #fff7e6;
  color: #8a5a00;
  font-size: 12px;
  line-height: 1.5;
}
</style>
