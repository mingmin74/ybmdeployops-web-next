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

const visible = defineModel<boolean>({ default: false });
const { kind = 'efi' } = defineProps<{ kind?: 'efi' | 'tpm' }>();
const form = reactive({ storage: '', format: 'raw', preEnrolledKeys: true, tpmVersion: 'v2.0' });
const imageStorageRows = shallowRef<PveRecord[]>([]);
const storageLoading = shallowRef(false);
const { config, hasVmCapability, loading, node, updateConfig } = useVmHardwareContext();

const storageColumns: QTableColumn<PveRecord>[] = [
  { name: 'storage', label: gettext('Storage'), field: (row) => textValue(row.storage), align: 'left' },
  { name: 'type', label: gettext('Type'), field: (row) => textValue(row.type), align: 'left' },
  { name: 'avail', label: gettext('Avail'), field: (row) => formatBytes(textValue(row.avail)), align: 'right' },
  { name: 'total', label: gettext('Total'), field: (row) => formatBytes(textValue(row.total)), align: 'right' },
];

const usesEfiBios = computed(() => textValue(config.value.bios, 'seabios') === 'ovmf');
const dialogTitle = computed(() => `${gettext('Add')}:${gettext(kind === 'efi' ? 'EFI Disk' : 'TPM State')}`);
const dialogLoading = computed(() => loading.value || storageLoading.value);
const storageLabel = computed(() => gettext(kind === 'efi' ? 'EFI Storage' : 'TPM Storage'));
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
    }))
);
const storageFormats = computed(() => storageFormatInfo(form.storage));
const diskFormatDisabled = computed(() => diskFormatOptions.value.length <= 1);
const canAdd = computed(() => {
  const key = kind === 'efi' ? 'efidisk0' : 'tpmstate0';
  return Boolean(hasVmCapability('VM.Config.Disk') && form.storage && !config.value[key]);
});

function storageFormatInfo(storageName: string) {
  const storage = imageStorageRows.value.find((row) => textValue(row.storage) === storageName);
  const formats = storage?.formats;
  let supported = ['raw', 'qcow2'];
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
    : supported.includes('raw')
    ? 'raw'
    : supported.includes(defaultFormat)
    ? defaultFormat
    : supported[0] || 'raw';
}

function canSelectStorage(row: PveRecord) {
  return row.avail === undefined || Number(row.avail) > 0;
}

async function loadImageStorages() {
  storageLoading.value = true;
  try {
    const response = await getNodeStorage(node.value, 'images');
    imageStorageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage))
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
  Object.assign(form, { storage: '', format: 'raw', preEnrolledKeys: true, tpmVersion: 'v2.0' });
  void loadImageStorages();
});

watch(
  () => form.storage,
  () => {
    resetDiskFormat();
  },
);

async function addFirmware() {
  const key = kind === 'efi' ? 'efidisk0' : 'tpmstate0';
  if (!canAdd.value) return;
  await updateConfig({
    [key]: kind === 'efi'
      ? `${form.storage}:1,efitype=4m,format=${form.format},pre-enrolled-keys=${form.preEnrolledKeys ? 1 : 0}`
      : `${form.storage}:1,format=${form.format},version=${form.tpmVersion}`,
  });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="dialogTitle" width="450px" :loading="dialogLoading">
      <div class="q-pa-md u-dense">
        <template v-if="kind === 'efi'">
          <div class="u-border q-pa-md">
            <SelectTable
              v-model="form.storage"
              row-key="storage"
              field-style="standard"
              width="500px"
              class="q-field--with-bottom"
              :rows="imageStorageRows"
              :columns="storageColumns"
              :display-value="form.storage"
              :loading="storageLoading"
              :get-row-value="(row) => textValue(row.storage)"
              :can-select="canSelectStorage"
              :error="!form.storage"
              :error-message="gettext('This field is required')"
              :label="storageLabel"
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
            <q-checkbox
              v-model="form.preEnrolledKeys"
              dense
              right-label
              color="primary"
              :label="gettext('Pre-Enroll keys')"
            />
          </div>
          <div v-if="!usesEfiBios" class="efi-warning q-mt-sm">
            {{ gettext("Warning: The VM currently does not use 'OVMF (UEFI)' as BIOS.") }}
          </div>
        </template>
        <template v-else>
          <div class="u-border q-pa-md">
            <SelectTable
              v-model="form.storage"
              row-key="storage"
              field-style="standard"
              width="500px"
              class="q-field--with-bottom"
              :rows="imageStorageRows"
              :columns="storageColumns"
              :display-value="form.storage"
              :loading="storageLoading"
              :get-row-value="(row) => textValue(row.storage)"
              :can-select="canSelectStorage"
              :error="!form.storage"
              :error-message="gettext('This field is required')"
              :label="storageLabel"
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
            <q-select
              v-model="form.tpmVersion"
              dense
              options-dense
              emit-value
              map-options
              :options="['v1.2', 'v2.0']"
              :label="gettext('Version')"
            />
          </div>
        </template>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canAdd"
          :label="gettext('Add')"
          @click="addFirmware"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.efi-warning {
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
</style>
