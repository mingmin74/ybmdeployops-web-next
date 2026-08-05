<script setup lang="ts">
import { Dialog } from 'quasar';
import { computed, provide, reactive, shallowRef, watch } from 'vue';
import { getVmPendingConfig, revertVmConfig, updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import { vmHardwareKey } from './hardware/context/vmHardwareContext';
import { useVmHardware } from './hardware/composables/useVmHardware';
import type { HardwareRow } from './hardware/types';
import HardwareList from './hardware/components/HardwareList.vue';
import HardwareToolbar from './hardware/components/HardwareToolbar.vue';
import HardwareEditorHost from './hardware/components/HardwareEditorHost.vue';
import HardwareAddDialog from './hardware/dialogs/HardwareAddDialog.vue';
import HardwareResizeDiskDialog from './hardware/dialogs/HardwareResizeDiskDialog.vue';
import HardwareMoveDiskDialog from './hardware/dialogs/HardwareMoveDiskDialog.vue';
import HardwareImportDiskDialog from './hardware/dialogs/HardwareImportDiskDialog.vue';
import HardwareFirmwareDialog from './hardware/dialogs/HardwareFirmwareDialog.vue';
import HardwareCloudInitDriveDialog from './hardware/dialogs/HardwareCloudInitDriveDialog.vue';
import HardwareRngDialog from './hardware/dialogs/HardwareRngDialog.vue';
import HardwareVirtiofsDialog from './hardware/dialogs/HardwareVirtiofsDialog.vue';

const props = withDefaults(
  defineProps<{ node: string; vmid: string; config: PveRecord; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' },
);
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const addVisible = shallowRef(false);
const resizeVisible = shallowRef(false);
const moveVisible = shallowRef(false);
const importDiskVisible = shallowRef(false);
const firmwareVisible = shallowRef(false);
const cloudInitVisible = shallowRef(false);
const rngVisible = shallowRef(false);
const virtiofsVisible = shallowRef(false);
const selectedKey = shallowRef('');
const addInitialKind = shallowRef<'disk' | 'cdrom' | 'net' | 'usb' | 'pci' | 'serial' | 'audio'>(
  'disk',
);
const firmwareKind = shallowRef<'efi' | 'tpm'>('efi');
const form = reactive({
  deviceValue: '',
  advanced: false,
});
const pendingRows = shallowRef<PveRecord[]>([]);
function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function parsePropertyString(value: unknown, defaultKey: string) {
  const result: Record<string, string> = {};
  textValue(value)
    .split(',')
    .filter(Boolean)
    .forEach((part) => {
      const segments = part.split('=', 2);
      const key = segments[0] || '';
      const optionValue = segments[1];
      if (!key) return;
      if (optionValue === undefined) result[defaultKey] = key;
      else result[key] = optionValue;
    });
  return result;
}
function renderDisplay(value: unknown) {
  const vga = parsePropertyString(value, 'type');
  const labels: Record<string, string> = {
    __default__: gettext('Default'),
    std: gettext('Standard VGA'),
    cirrus: 'Cirrus Logic GD5446',
    vmware: 'VMware compatible',
    qxl: 'SPICE',
    qxl2: 'SPICE dual monitor',
    qxl3: 'SPICE three monitors',
    qxl4: 'SPICE four monitors',
    serial0: 'Serial terminal 0',
    serial1: 'Serial terminal 1',
    serial2: 'Serial terminal 2',
    serial3: 'Serial terminal 3',
    virtio: 'VirtIO-GPU',
    'virtio-gl': 'VirtIO-GPU (VirGL)',
    none: gettext('None'),
  };
  const type = vga.type || '__default__';
  const parts = [labels[type] || type];
  if (vga.memory) parts.push(`${gettext('Memory')}: ${vga.memory} MiB`);
  if (vga.clipboard) parts.push(`${gettext('Clipboard')}: ${vga.clipboard}`);
  return parts.join(', ');
}
function renderMachine(value: unknown) {
  const machine = parsePropertyString(value, 'type');
  const type = machine.type || '__default__';
  const displayType =
    type === 'pc' || type === '__default__' ? `${gettext('Default')} (i440fx)` : type;
  return machine.viommu ? `${displayType}, vIOMMU: ${machine.viommu}` : displayType;
}
function deviceRow(key: string, config: PveRecord): HardwareRow | undefined {
  if (config[key] === undefined) return undefined;
  const value = textValue(config[key]) || '-';
  if (/^(ide|scsi|sata|virtio)\d+$/.test(key) && value.includes('cloudinit')) {
    return {
      key,
      type: 'cloudinit',
      name: `${gettext('CloudInit Drive')} (${key})`,
      value,
      editable: true,
    };
  }
  if (/^(ide|scsi|sata|virtio)\d+$/.test(key) && value.includes('media=cdrom')) {
    return {
      key,
      type: 'cdrom',
      name: `${gettext('CD/DVD Drive')} (${key})`,
      value,
      editable: true,
    };
  }
  if (/^(ide|scsi|sata|virtio)\d+$/.test(key) && !value.includes('cloudinit')) {
    return { key, type: 'disk', name: `${gettext('Hard Disk')} (${key})`, value, editable: true };
  }
  if (/^net\d+$/.test(key)) {
    return {
      key,
      type: 'network',
      name: `${gettext('Network Device')} (${key})`,
      value,
      editable: true,
    };
  }
  if (key === 'efidisk0') {
    return { key, type: 'efi', name: gettext('EFI Disk'), value, editable: true };
  }
  if (key === 'tpmstate0') {
    return { key, type: 'tpm', name: gettext('TPM State'), value, editable: true };
  }
  if (/^usb\d+$/.test(key)) {
    return { key, type: 'usb', name: `${gettext('USB Device')} (${key})`, value, editable: true };
  }
  if (/^hostpci\d+$/.test(key)) {
    return { key, type: 'pci', name: `${gettext('PCI Device')} (${key})`, value, editable: true };
  }
  if (/^serial\d+$/.test(key)) {
    return {
      key,
      type: 'serial',
      name: `${gettext('Serial Port')} (${key})`,
      value,
      editable: true,
    };
  }
  if (key === 'audio0') {
    return { key, type: 'audio', name: gettext('Audio Device'), value, editable: true };
  }
  if (key === 'rng0') {
    return { key, type: 'rng', name: gettext('VirtIO RNG'), value, editable: true };
  }
  if (/^virtiofs\d+$/.test(key)) {
    return {
      key,
      type: 'virtiofs',
      name: `${gettext('Virtiofs')} (${key})`,
      value,
      editable: true,
    };
  }
  return undefined;
}
const pendingByKey = computed<Record<string, PveRecord>>(() =>
  Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row])),
);

const rows = computed<HardwareRow[]>(() => {
  const config = props.config;
  if (props.guestType === 'lxc') {
    const cpuLimit = numberValue(config.cpulimit, 0);
    const cpuUnits = numberValue(config.cpuunits, 0);
    const cpuValue = numberValue(config.cores, 0) || gettext('unlimited');
    const cpuDetails = [
      String(cpuValue),
      ...(cpuLimit ? [`[cpulimit=${cpuLimit}]`] : []),
      ...(cpuUnits ? [`[cpuunits=${cpuUnits}]`] : []),
    ];
    const mountPoints = Object.keys(config)
      .filter((key) => /^(mp|unused)\d+$/.test(key))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((key) => ({
        key,
        type: 'disk' as const,
        name: key.startsWith('mp')
          ? `${gettext('Mount Point')} (${key})`
          : `${gettext('Unused Disk')} ${key.replace('unused', '')}`,
        value: textValue(config[key]) || '-',
        editable: true,
      }));
    const devices = Object.keys(config)
      .filter((key) => /^dev\d+$/.test(key))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((key) => ({
        key,
        type: 'pci' as const,
        name: `${gettext('Device')} (${key})`,
        value: textValue(config[key]) || '-',
        editable: true,
      }));
    return [
      {
        key: 'memory',
        type: 'memory',
        name: gettext('Memory'),
        value: `${numberValue(config.memory, 512)} MiB`,
        editable: true,
      },
      {
        key: 'swap',
        type: 'memory',
        name: gettext('Swap'),
        value: `${numberValue(config.swap, 512)} MiB`,
        editable: true,
      },
      {
        key: 'cores',
        type: 'cpu',
        name: gettext('Cores'),
        value: cpuDetails.join(' '),
        editable: true,
      },
      {
        key: 'rootfs',
        type: 'disk',
        name: gettext('Root Disk'),
        value: textValue(config.rootfs) || gettext('None'),
        editable: true,
      },
      ...mountPoints,
      ...devices,
    ];
  }
  const base: HardwareRow[] = [
    {
      key: 'cpu',
      type: 'cpu',
      name: gettext('Processors'),
      value: `${numberValue(config.sockets, 1)} × ${numberValue(config.cores, 1)}`,
      editable: true,
    },
    {
      key: 'memory',
      type: 'memory',
      name: gettext('Memory'),
      value: `${numberValue(config.memory, 512)} MiB`,
      editable: true,
    },
    {
      key: 'bios',
      type: 'bios',
      name: gettext('BIOS'),
      value: textValue(config.bios) || `${gettext('Default')} (SeaBIOS)`,
      editable: true,
    },
    {
      key: 'vga',
      type: 'display',
      name: gettext('Display'),
      value: renderDisplay(config.vga),
      editable: true,
    },
    {
      key: 'machine',
      type: 'machine',
      name: gettext('Machine'),
      value: renderMachine(config.machine),
      editable: true,
    },
    {
      key: 'scsihw',
      type: 'scsi-controller',
      name: gettext('SCSI Controller'),
      value: textValue(config.scsihw) || gettext('Default'),
      editable: true,
    },
  ];
  const devices = Object.keys(config)
    .filter(
      (key) =>
        /^(ide|scsi|sata|virtio|net|usb|hostpci|serial|virtiofs)\d+$/.test(key) ||
        ['efidisk0', 'tpmstate0', 'audio0', 'rng0'].includes(key),
    )
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((key) => deviceRow(key, config))
    .filter((row): row is HardwareRow => Boolean(row));
  return [...base, ...devices];
});

const selectedDevice = computed(() => rows.value.find((row) => row.key === selectedKey.value));
const selectedPending = computed(() =>
  Boolean(selectedDevice.value && hasPendingChange(selectedDevice.value.key)),
);
const canRemove = computed(() => {
  const device = selectedDevice.value;
  return Boolean(
    device && device.key !== 'rootfs' && ['disk', 'cdrom', 'network', 'pci'].includes(device.type),
  );
});
const canRevert = computed(() =>
  Boolean(selectedDevice.value && selectedPending.value && canEditRow(selectedDevice.value)),
);
const selectedCanSave = computed(() =>
  Boolean(selectedDevice.value?.editable && canEditRow(selectedDevice.value)),
);
const isDisk = computed(() => selectedDevice.value?.type === 'disk');
function selectHardware(row: HardwareRow) {
  selectedKey.value = row.key;
}
function pendingValue(key: string) {
  const pending = pendingByKey.value[key];
  if (!hasPendingChange(key)) return '';
  return pending?.delete ? gettext('Deleted') : textValue(pending?.pending);
}
function hasPendingChange(key: string) {
  const pending = pendingByKey.value[key];
  if (!pending) return false;
  if (pending.delete) return true;
  const nextValue = textValue(pending.pending);
  return nextValue !== '' && nextValue !== textValue(props.config[key]);
}
function hasVmCapability(capability: string) {
  return Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.[capability]);
}

async function loadPending() {
  const response = await getVmPendingConfig(props.node, props.vmid, props.guestType);
  pendingRows.value = response.data || [];
}

async function revertSelected() {
  const row = selectedDevice.value;
  if (!row || !pendingByKey.value[row.key]) return;
  const grouped: Record<string, string[]> = {
    cpu: ['cpu', 'cores', 'sockets', 'numa', 'vcpus', 'cpulimit', 'cpuunits', 'affinity'],
    memory: ['memory', 'balloon', 'shares', 'allow-ksm'],
    bios: ['bios'],
    machine: ['machine'],
    scsihw: ['scsihw'],
  };
  loading.value = true;
  try {
    await revertVmConfig(props.node, props.vmid, grouped[row.key] || [row.key], props.guestType);
    await loadPending();
    emit('updated');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.node, props.vmid, textValue(props.config.digest)],
  () => {
    void loadPending();
  },
  { immediate: true },
);

watch(
  rows,
  (nextRows) => {
    if (selectedKey.value && nextRows.some((row) => row.key === selectedKey.value)) return;
    selectedKey.value = nextRows[0]?.key || '';
  },
  { immediate: true },
);

watch(
  () => [selectedDevice.value?.key, selectedDevice.value?.value],
  () => {
    const device = selectedDevice.value;
    form.deviceValue = device?.editable ? textValue(props.config[device.key]) : '';
    form.advanced = Boolean(device?.editable && form.deviceValue.includes(','));
  },
  { immediate: true },
);

function canEditRow(row: HardwareRow) {
  switch (row.type) {
    case 'cpu':
      return hasVmCapability('VM.Config.CPU') || hasVmCapability('VM.Config.HWType');
    case 'memory':
      return hasVmCapability('VM.Config.Memory');
    case 'bios':
      return hasVmCapability('VM.Config.Options');
    case 'machine':
    case 'scsi-controller':
      return hasVmCapability('VM.Config.HWType');
    case 'network':
      return hasVmCapability('VM.Config.Network');
    case 'cdrom':
      return hasVmCapability('VM.Config.CDROM');
    case 'cloudinit':
      return hasVmCapability('VM.Config.CDROM') && hasVmCapability('VM.Config.Cloudinit');
    case 'efi':
    case 'tpm':
      return hasVmCapability('VM.Config.Disk');
    case 'virtiofs':
      return hasVmCapability('VM.Config.Options');
    case 'display':
    case 'keyboard':
    case 'audio':
    case 'rng':
    case 'usb':
    case 'pci':
      return hasVmCapability('VM.Config.HWType');
    case 'serial':
      return hasVmCapability('VM.Config.Disk');
    default:
      return hasVmCapability('VM.Config.Disk');
  }
}

async function save() {
  const device = selectedDevice.value;
  if (!device || !canEditRow(device)) return;
  const data: PveRecord = { digest: props.config.digest };
  if (device.type === 'display') {
    if (form.deviceValue.trim()) data.vga = form.deviceValue;
    else data.delete = textValue(data.delete) ? `${textValue(data.delete)},vga` : 'vga';
  } else if (
    [
      'disk',
      'cdrom',
      'cloudinit',
      'network',
      'usb',
      'pci',
      'serial',
      'virtiofs',
      'keyboard',
      'audio',
      'rng',
      'efi',
      'tpm',
    ].includes(device.type)
  )
    data[device.key] = form.deviceValue;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data, props.guestType);
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function removeDevice() {
  const device = selectedDevice.value;
  if (!device || !canEditRow(device)) return;
  if (!device || !['disk', 'cdrom', 'network'].includes(device.type)) return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', device.name),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void updateVmConfig(
      props.node,
      props.vmid,
      { digest: props.config.digest, delete: device.key },
      props.guestType,
    )
      .then(() => emit('updated'))
      .finally(() => {
        loading.value = false;
      });
  });
}

function openResize() {
  if (!isDisk.value || !hasVmCapability('VM.Config.Disk')) return;
  resizeVisible.value = true;
}
function openMove() {
  if (isDisk.value && hasVmCapability('VM.Config.Disk') && selectedDevice.value?.key)
    moveVisible.value = true;
}

function openImportDisk() {
  if (!hasVmCapability('VM.Config.Disk')) return;
  importDiskVisible.value = true;
}

function openAddHardware(kind: 'disk' | 'cdrom' | 'net' | 'usb' | 'pci' | 'serial' | 'audio') {
  addInitialKind.value = kind;
  addVisible.value = true;
}

function openFirmware(kind: 'efi' | 'tpm') {
  firmwareKind.value = kind;
  firmwareVisible.value = true;
}

function nextDeviceKey(
  prefix: 'scsi' | 'virtio' | 'sata' | 'net' | 'ide' | 'usb' | 'hostpci' | 'serial' | 'virtiofs',
  limit = 32,
) {
  for (let index = 0; index < limit; index += 1) {
    const key = `${prefix}${index}`;
    if (!props.config[key]) return key;
  }
  return `${prefix}${limit - 1}`;
}
const vmHardwareContext = useVmHardware({
  node: computed(() => props.node),
  vmid: computed(() => props.vmid),
  guestType: computed(() => props.guestType),
  config: computed(() => props.config),
  loading,
  selectedDevice,
  pendingByKey,
  hasVmCapability,
  canEditRow,
  hasPendingChange,
  pendingValue,
  notifyUpdated: () => emit('updated'),
  nextDeviceKey,
});

provide(vmHardwareKey, vmHardwareContext);
</script>

<template>
  <div class="vm-config-legacy vm-hardware-tab">
    <!-- Toolbar owns its presentation; this tab retains only VM-specific actions. -->
    <HardwareToolbar
      :is-disk="isDisk"
      :can-remove="canRemove"
      :can-revert="canRevert"
      :guest-type="props.guestType"
      @add="openAddHardware"
      @add-firmware="openFirmware"
      @add-cloud-init="cloudInitVisible = true"
      @add-rng="rngVisible = true"
      @add-virtiofs="virtiofsVisible = true"
      @import-disk="openImportDisk"
      @remove="removeDevice"
      @resize="openResize"
      @move="openMove"
      @revert="revertSelected"
    />
    <div class="row items-stretch">
      <div class="col-7 hardware-list-column">
        <HardwareList :rows="rows" @select="selectHardware" />
      </div>
      <div class="col-5 hardware-edit-column">
        <div class="u-border hardware-editor">
          <div v-if="selectedDevice" class="q-pa-sm hardware-editor__content">
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">{{ selectedDevice.name }}</div>
            </div>
            <HardwareEditorHost :key="selectedDevice.key">
              <q-input
                v-if="selectedDevice.editable"
                v-model="form.deviceValue"
                dense
                :label="selectedDevice.name"
              />
              <div v-else class="text-grey-8 wrap">{{ selectedDevice.value }}</div>
            </HardwareEditorHost>
          </div>
          <div
            v-if="
              selectedDevice?.editable &&
              ![
                'cpu',
                'memory',
                'bios',
                'machine',
                'scsi-controller',
                'system',
                'display',
                'disk',
                'cdrom',
                'network',
              ].includes(selectedDevice.type)
            "
            class="hardware-editor__footer row items-center justify-between"
          >
            <q-checkbox
              v-model="form.advanced"
              dense
              color="primary"
              :label="gettext('Advanced')"
            />
            <q-btn
              no-caps
              size="12px"
              class="bg-primary text-grey-1 u-button"
              :disable="!selectedCanSave"
              :loading="loading"
              :label="gettext('Save')"
              @click="save"
            />
          </div>
        </div>
      </div>
    </div>
    <HardwareAddDialog v-model="addVisible" :initial-kind="addInitialKind" />
    <HardwareImportDiskDialog v-model="importDiskVisible" />
    <HardwareFirmwareDialog v-model="firmwareVisible" :kind="firmwareKind" />
    <HardwareCloudInitDriveDialog v-model="cloudInitVisible" />
    <HardwareRngDialog v-model="rngVisible" />
    <HardwareVirtiofsDialog v-model="virtiofsVisible" />
    <HardwareResizeDiskDialog v-model="resizeVisible" />
    <HardwareMoveDiskDialog v-model="moveVisible" />
  </div>
</template>

<style scoped lang="scss">
.vm-config-legacy {
  padding: 8px;
  font-size: 13px;
}
.hardware-list-column {
  display: flex;
  overflow: hidden;
  align-self: stretch;
}
.hardware-edit-column {
  display: flex;
  align-self: stretch;
  background: #fff;
}
.hardware-editor {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 100%;
  border-left: 1px solid #d7dce2;
  background: #fff;
}
.hardware-editor__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.hardware-editor__footer {
  flex: 0 0 auto;
  min-height: 52px;
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
.editor-titlebar {
  min-height: 38px;
  margin: -4px -4px 10px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #d7dce2;
}
.editor-title {
  font-weight: 600;
  color: #334155;
}
.hardware-editor :deep(.q-field) {
  margin-bottom: 4px;
}
.hardware-editor :deep(.q-checkbox) {
  min-height: 30px;
}
</style>
