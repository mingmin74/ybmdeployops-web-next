<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import type { QTableColumn } from 'quasar';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { getVmConfig, updateVmConfig } from '@/api/overview';
import { getNodes } from '@/api/resources';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import { allowedDiskBusses, nextFreeDiskSlot, nextFreeDiskSlotForBus, sortedDiskBusses, storageFormats, validDiskBandwidth, validDiskDeviceId, type DiskBus } from '../utils/diskController';

type ImportDiskForm = {
  sourceStorage: string;
  sourceVolume: string;
  targetStorage: string;
  existingVolume: string;
  diskBus: DiskBus;
  diskDeviceId: number;
  diskFormat: string;
  diskCache: string;
  diskBackup: boolean;
  diskSkipReplication: boolean;
  diskDiscard: boolean;
  diskIothread: boolean;
  diskSsd: boolean;
  diskReadOnly: boolean;
  diskAio: string;
  mbps_rd: string;
  mbps_wr: string;
  iops_rd: string;
  iops_wr: string;
  mbps_rd_max: string;
  mbps_wr_max: string;
  iops_rd_max: string;
  iops_wr_max: string;
};

const visible = defineModel<boolean>({ default: false });
const sourceStorages = shallowRef<PveRecord[]>([]);
const targetStorages = shallowRef<PveRecord[]>([]);
const files = shallowRef<PveRecord[]>([]);
const existingVolumes = shallowRef<PveRecord[]>([]);
const openedConfig = shallowRef<PveRecord | null>(null);
const openedDigest = shallowRef('');
const hostArch = shallowRef('x86_64');
const sourceLoaded = shallowRef(false);
const targetLoaded = shallowRef(false);
const activeTab = shallowRef<'disk' | 'bandwidth'>('disk');
const advanced = shallowRef(false);
const form = reactive<ImportDiskForm>({
  sourceStorage: '',
  sourceVolume: '',
  targetStorage: '',
  existingVolume: '',
  diskBus: 'scsi',
  diskDeviceId: 0,
  diskFormat: 'raw',
  diskCache: '__default__',
  diskBackup: true,
  diskSkipReplication: false,
  diskDiscard: false,
  diskIothread: false,
  diskSsd: false,
  diskReadOnly: false,
  diskAio: '__default__',
  mbps_rd: '',
  mbps_wr: '',
  iops_rd: '',
  iops_wr: '',
  mbps_rd_max: '',
  mbps_wr_max: '',
  iops_rd_max: '',
  iops_wr_max: '',
});
const { config, hasVmCapability, loading, node, vmid, notifyTask, notifyUpdated } = useVmHardwareContext();

const storageColumns: QTableColumn<PveRecord>[] = [
  { name: 'storage', label: gettext('Storage'), field: 'storage', align: 'left' },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
];
const imageColumns: QTableColumn<PveRecord>[] = [
  { name: 'volid', label: gettext('Disk image'), field: 'volid', align: 'left' },
  { name: 'format', label: gettext('Disk Format'), field: 'format', align: 'left' },
  {
    name: 'size',
    label: gettext('Size'),
    field: 'size',
    align: 'right',
    format: (value) => {
      const size = Number(value);
      return Number.isFinite(size) && size > 0 ? `${Math.ceil(size / 1024 / 1024 / 1024)} GiB` : '';
    },
  },
];
const diskConfig = computed(() => openedConfig.value || config.value);
const targetStorageRecord = computed(() => targetStorages.value.find((item) => textValue(item.storage) === form.targetStorage));
const diskFormatOptions = computed(() => storageFormats(targetStorageRecord.value).values);
const selectExisting = computed(() => Boolean(targetStorageRecord.value?.select_existing));
const busOptions = computed(() => allowedDiskBusses(diskConfig.value, hostArch.value).map((value) => ({ label: value === 'virtio' ? 'VirtIO Block' : value.toUpperCase(), value })));
const isScsiSingle = computed(() => textValue(diskConfig.value.scsihw) === 'virtio-scsi-single');
const supportsDiskIoThread = computed(() => form.diskBus === 'scsi' || form.diskBus === 'virtio');
const diskKey = computed(() => `${form.diskBus}${form.diskDeviceId}`);
const diskKeyAvailable = computed(() => validDiskDeviceId(diskConfig.value, form.diskBus, form.diskDeviceId));
const scsiControllerOptions = [
  { label: `${gettext('Default')} (LSI 53C895A)`, value: '__default__' },
  { label: 'LSI 53C895A', value: 'lsi' },
  { label: 'LSI 53C810', value: 'lsi53c810' },
  { label: 'MegaRAID SAS 8708EM2', value: 'megasas' },
  { label: 'VirtIO SCSI', value: 'virtio-scsi-pci' },
  { label: 'VirtIO SCSI single', value: 'virtio-scsi-single' },
  { label: 'VMware PVSCSI', value: 'pvscsi' },
];
const scsiControllerLabel = computed(() => {
  const value = textValue(config.value.scsihw) || '__default__';
  return scsiControllerOptions.find((option) => option.value === value)?.label || value;
});
const canImport = computed(() =>
  Boolean(
    hasVmCapability('VM.Config.Disk') &&
    sourceLoaded.value && targetLoaded.value &&
    sourceStorages.value.some((item) => textValue(item.storage) === form.sourceStorage) &&
    files.value.some((item) => textValue(item.volid || item.text) === form.sourceVolume) &&
    targetStorageRecord.value && diskFormatOptions.value.includes(form.diskFormat) && diskKeyAvailable.value && validDiskBandwidth(form) &&
    (!selectExisting.value || existingVolumes.value.some((item) => textValue(item.volid || item.text) === form.existingVolume)),
  ),
);

function resetForm() {
  const slot = nextFreeDiskSlot(diskConfig.value, sortedDiskBusses(diskConfig.value, hostArch.value));
  Object.assign(form, {
    sourceStorage: '',
    sourceVolume: '',
    targetStorage: '',
    existingVolume: '',
    diskBus: slot.bus,
    diskDeviceId: slot.id,
    diskFormat: 'raw',
    diskCache: '__default__',
    diskBackup: true,
    diskSkipReplication: false,
    diskDiscard: false,
    diskIothread: slot.bus === 'virtio' || (slot.bus === 'scsi' && isScsiSingle.value),
    diskSsd: false,
    diskReadOnly: false,
    diskAio: '__default__',
    mbps_rd: '',
    mbps_wr: '',
    iops_rd: '',
    iops_wr: '',
    mbps_rd_max: '',
    mbps_wr_max: '',
    iops_rd_max: '',
    iops_wr_max: '',
  });
  activeTab.value = 'disk';
  advanced.value = false;
}

async function loadFiles() {
  form.sourceVolume = '';
  files.value = [];
  if (!form.sourceStorage) return;
  const response = await getStorageContent(node.value, form.sourceStorage, 'import');
  files.value = (response.data || []).filter((item) =>
    ['qcow2', 'vmdk', 'raw'].includes(textValue(item.format).toLowerCase()),
  );
}

async function initialize() {
  if (!hasVmCapability('VM.Config.Disk')) return;
  sourceStorages.value = [];
  targetStorages.value = [];
  files.value = [];
  existingVolumes.value = [];
  sourceLoaded.value = false;
  targetLoaded.value = false;
  openedConfig.value = null;
  openedDigest.value = '';
  resetForm();
  loading.value = true;
  try {
    const [sourceResponse, targetResponse, configResponse, nodesResponse] = await Promise.all([
      getNodeStorage(node.value, 'import'),
      getNodeStorage(node.value, 'images'),
      getVmConfig(node.value, vmid.value),
      getNodes(),
    ]);
    sourceStorages.value = sourceResponse.data || [];
    targetStorages.value = targetResponse.data || [];
    sourceLoaded.value = true;
    targetLoaded.value = true;
    openedConfig.value = configResponse.data || null;
    openedDigest.value = textValue(configResponse.data?.digest);
    hostArch.value = textValue(nodesResponse.data?.find((item) => item.node === node.value)?.['host-arch']) || 'x86_64';
    resetForm();
  } finally {
    loading.value = false;
  }
}

watch(visible, (isVisible) => {
  if (isVisible) void initialize();
});

watch(
  () => form.diskBus,
  (bus) => {
    form.diskDeviceId = nextFreeDiskSlotForBus(diskConfig.value, bus).id;
    if (bus === 'virtio') form.diskIothread = true;
    else if (bus === 'scsi') form.diskIothread = isScsiSingle.value;
    else {
      form.diskIothread = false;
      form.diskReadOnly = false;
    }
  },
);

watch(() => form.targetStorage, async () => {
  form.existingVolume = '';
  existingVolumes.value = [];
  const storage = targetStorageRecord.value;
  form.diskFormat = storageFormats(storage).selected;
  if (!selectExisting.value || !form.targetStorage) return;
  const response = await getStorageContent(node.value, form.targetStorage, 'images');
  if (form.targetStorage === textValue(storage?.storage)) existingVolumes.value = response.data || [];
});

watch(
  () => supportsDiskIoThread.value,
  (supported) => {
    if (!supported) {
      form.diskIothread = false;
      form.diskReadOnly = false;
    }
  },
);

function pushOptional(parts: string[], key: string, value: string) {
  if (value.trim()) parts.push(`${key}=${value.trim()}`);
}

function diskValue() {
  const parts = [selectExisting.value ? form.existingVolume : `${form.targetStorage}:0`, ...(selectExisting.value ? [] : [`import-from=${form.sourceVolume}`])];
  if (form.diskFormat) parts.push(`format=${form.diskFormat}`);
  if (!form.diskBackup) parts.push('backup=0');
  if (form.diskSkipReplication) parts.push('replicate=no');
  if (form.diskDiscard) parts.push('discard=on');
  if (form.diskBus !== 'virtio' && form.diskSsd) parts.push('ssd=on');
  if (supportsDiskIoThread.value && form.diskIothread) parts.push('iothread=on');
  if (supportsDiskIoThread.value && form.diskReadOnly) parts.push('ro=on');
  if (form.diskCache !== '__default__') parts.push(`cache=${form.diskCache}`);
  if (form.diskAio !== '__default__') parts.push(`aio=${form.diskAio}`);
  pushOptional(parts, 'mbps_rd', form.mbps_rd);
  pushOptional(parts, 'mbps_wr', form.mbps_wr);
  pushOptional(parts, 'iops_rd', form.iops_rd);
  pushOptional(parts, 'iops_wr', form.iops_wr);
  pushOptional(parts, 'mbps_rd_max', form.mbps_rd_max);
  pushOptional(parts, 'mbps_wr_max', form.mbps_wr_max);
  pushOptional(parts, 'iops_rd_max', form.iops_rd_max);
  pushOptional(parts, 'iops_wr_max', form.iops_wr_max);
  return parts.join(',');
}

async function importDisk() {
  if (!canImport.value) return;
  loading.value = true;
  try {
    const result = await updateVmConfig(node.value, vmid.value, { digest: openedDigest.value, background_delay: 5, [diskKey.value]: diskValue() }, 'qemu', 'POST');
    notifyUpdated();
    const upid = textValue((result as { data?: unknown }).data);
    if (upid.startsWith('UPID:')) notifyTask(upid, gettext('Import Hard Disk'));
  } finally { loading.value = false; }
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Import Hard Disk')" width="600px" :loading="loading">
      <div class="q-pa-md u-dense import-disk-form">
        <q-tabs
          v-model="activeTab"
          dense
          align="left"
          active-color="primary"
          indicator-color="primary"
          class="hardware-nav-tabs text-grey-7"
        >
          <q-tab name="disk" :label="gettext('Hard Disk')" />
          <q-tab name="bandwidth" :label="gettext('Bandwidth')" />
        </q-tabs>
        <div v-show="activeTab === 'disk'" class="q-pa-md bg-white import-disk-editor">
          <div class="row q-gutter-lg import-disk-editor-fields">
            <div class="col">
              <SelectTable
                v-model="form.sourceStorage"
                row-key="storage"
                field-style="standard"
                width="500px"
                class="q-field--with-bottom"
                :rows="sourceStorages"
                :columns="storageColumns"
                :display-value="form.sourceStorage"
                :get-row-value="(row) => textValue(row.storage)"
                :label="gettext('Import Storage')"
                @update:model-value="loadFiles"
              />
              <SelectTable
                v-model="form.sourceVolume"
                row-key="volid"
                field-style="standard"
                fixed-layout
                width="500px"
                class="q-field--with-bottom"
                :rows="files"
                :columns="imageColumns"
                :display-value="form.sourceVolume"
                :get-row-value="(row) => textValue(row.volid || row.text)"
                :disable="!form.sourceStorage"
                :label="gettext('Select Image')"
              />
              <SelectTable
                v-model="form.targetStorage"
                row-key="storage"
                field-style="standard"
                width="500px"
                class="q-field--with-bottom"
                :rows="targetStorages"
                :columns="storageColumns"
                :display-value="form.targetStorage"
                :get-row-value="(row) => textValue(row.storage)"
                :label="gettext('Target Storage')"
              />
              <SelectTable
                v-if="selectExisting"
                v-model="form.existingVolume"
                row-key="volid"
                field-style="standard"
                fixed-layout
                width="500px"
                class="q-field--with-bottom"
                :rows="existingVolumes"
                :columns="imageColumns"
                :display-value="form.existingVolume"
                :get-row-value="(row) => textValue(row.volid || row.text)"
                :label="gettext('Disk image')"
              />
              <div class="row q-gutter-sm">
                <q-select
                  v-model="form.diskBus"
                  class="col q-field--with-bottom"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :label="gettext('Bus')"
                  :options="busOptions"
                />
                <q-input
                  v-model.number="form.diskDeviceId"
                  class="q-field--with-bottom"
                  dense
                  type="number"
                  min="0"
                  style="width: 100px"
                  :label="gettext('Device ID')"
                />
              </div>
              <q-input
                v-if="form.diskBus === 'scsi'"
                :model-value="scsiControllerLabel"
                class="q-field--with-bottom"
                dense
                readonly
                :label="gettext('SCSI Controller')"
              />
            </div>
            <div class="col">
              <q-select
                v-model="form.diskFormat"
                class="q-field--with-bottom"
                dense
                options-dense
                emit-value
                map-options
                :label="gettext('Disk Format')"
                :disable="diskFormatOptions.length <= 1"
                :options="diskFormatOptions"
              />
              <q-select
                v-model="form.diskCache"
                class="q-field--with-bottom"
                dense
                options-dense
                emit-value
                map-options
                :label="gettext('Cache')"
                :options="[
                  { label: `${gettext('Default')} (${gettext('No cache')})`, value: '__default__' },
                  { label: 'No cache', value: 'none' },
                  { label: 'Write through', value: 'writethrough' },
                  { label: 'Write back', value: 'writeback' },
                  { label: 'Direct sync', value: 'directsync' },
                  { label: 'Unsafe', value: 'unsafe' },
                ]"
              />
              <q-field borderless>
                <q-checkbox
                  v-model="form.diskDiscard"
                  class="checkboxClass"
                  dense
                  right-label
                  color="primary"
                  :label="gettext('Discard')"
                />
              </q-field>
              <q-field borderless>
                <q-checkbox
                  v-model="form.diskIothread"
                  class="q-field--with-bottom checkboxClass"
                  dense
                  right-label
                  color="primary"
                  :disable="!supportsDiskIoThread"
                  label="IO thread"
                />
              </q-field>
            </div>
          </div>
          <div v-if="advanced" class="u-border-dotted-blue q-px-md q-py-sm bg-white q-mt-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-field borderless dense>
                  <q-checkbox
                    v-model="form.diskSsd"
                    dense
                    right-label
                    color="primary"
                    :disable="form.diskBus === 'virtio'"
                    :label="gettext('SSD emulation')"
                  />
                </q-field>
              </div>
              <div class="col-6">
                <q-field borderless dense>
                  <q-checkbox
                    v-model="form.diskReadOnly"
                    dense
                    right-label
                    color="primary"
                    :disable="!supportsDiskIoThread"
                    :label="gettext('Readonly')"
                  />
                </q-field>
              </div>
              <div class="col-6">
                <q-field borderless dense>
                  <q-checkbox
                    v-model="form.diskBackup"
                    dense
                    right-label
                    color="primary"
                    :label="gettext('Backup')"
                  />
                </q-field>
              </div>
              <div class="col-6">
                <q-field borderless dense>
                  <q-checkbox
                    v-model="form.diskSkipReplication"
                    dense
                    right-label
                    color="primary"
                    :label="gettext('Skip replication')"
                  />
                </q-field>
              </div>
              <div class="col-12">
                <q-select
                  v-model="form.diskAio"
                  class="q-field--with-bottom"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :label="gettext('Async IO')"
                  :options="[
                    { label: `${gettext('Default')} (io_uring)`, value: '__default__' },
                    { label: 'io_uring', value: 'io_uring' },
                    { label: 'native', value: 'native' },
                    { label: 'threads', value: 'threads' },
                  ]"
                />
              </div>
            </div>
          </div>
        </div>
        <div v-show="activeTab === 'bandwidth'" class="q-pt-md">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                v-model="form.mbps_rd"
                class="q-field--with-bottom"
                dense
                type="number"
                min="1"
                :label="`${gettext('Read limit')} (MB/s)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.mbps_wr"
                class="q-field--with-bottom"
                dense
                type="number"
                min="1"
                :label="`${gettext('Write limit')} (MB/s)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.iops_rd"
                class="q-field--with-bottom"
                dense
                type="number"
                min="10"
                step="10"
                :label="`${gettext('Read limit')} (ops/s)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.iops_wr"
                class="q-field--with-bottom"
                dense
                type="number"
                min="10"
                step="10"
                :label="`${gettext('Write limit')} (ops/s)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.mbps_rd_max"
                class="q-field--with-bottom"
                dense
                type="number"
                min="1"
                :label="`${gettext('Read max burst')} (MB)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.mbps_wr_max"
                class="q-field--with-bottom"
                dense
                type="number"
                min="1"
                :label="`${gettext('Write max burst')} (MB)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.iops_rd_max"
                class="q-field--with-bottom"
                dense
                type="number"
                min="10"
                step="10"
                :label="`${gettext('Read max burst')} (ops)`"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.iops_wr_max"
                class="q-field--with-bottom"
                dense
                type="number"
                min="10"
                step="10"
                :label="`${gettext('Write max burst')} (ops)`"
              />
            </div>
          </div>
        </div>
      </div>
      <template #foot>
        <div class="full-width row items-center justify-between">
          <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
          <div class="row items-center q-gutter-sm">
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
              :disable="!canImport"
              :label="gettext('Import')"
              @click="importDisk"
            />
          </div>
        </div>
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.hardware-nav-tabs {
  min-height: 34px;
  /* padding: 0 6px; */
  background: #f5f7fa;
  border: 1px solid #d8e0ea;
  border-radius: 3px 3px 0 0;
}

.hardware-nav-tabs :deep(.q-tabs__content) {
  align-items: flex-end;
}

.hardware-nav-tabs :deep(.q-tab) {
  min-height: 34px;
  padding: 0 14px;
  text-transform: none;
}

.hardware-nav-tabs :deep(.q-tab__label) {
  font-size: 12px;
  line-height: 1.2;
}

.hardware-nav-tabs :deep(.q-tab--active) {
  background: #fff;
}

.hardware-nav-tabs :deep(.q-tab__indicator) {
  height: 2px;
}

.import-disk-editor {
  margin-top: 8px;
}

.import-disk-editor :deep(.q-checkbox--dense .q-checkbox__label) {
  color: #333;
}

.checkboxClass {
  color: #333 !important;
}
</style>
