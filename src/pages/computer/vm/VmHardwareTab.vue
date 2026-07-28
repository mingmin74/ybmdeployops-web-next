<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { getVmPendingConfig, revertVmConfig, updateVmConfig } from '@/api/overview';
import { moveVmDisk, resizeVmDisk } from '@/api/vm';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { getPciMappings, getUsbMappings } from '@/api/deviceMapping';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

type HardwareRow = { key: string; name: string; value: string; editable: boolean };
type DeviceKind = 'disk' | 'net' | 'cdrom' | 'usb' | 'pci' | 'serial' | 'audio';
type DiskBus = 'scsi' | 'virtio' | 'sata' | 'ide';
function defaultDeviceKind(): DeviceKind { return 'disk'; }
function defaultDiskBus(): DiskBus { return 'scsi'; }

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const editVisible = shallowRef(false);
const addVisible = shallowRef(false);
const resizeVisible = shallowRef(false);
const moveVisible = shallowRef(false);
const reattachVisible = shallowRef(false);
const firmwareVisible = shallowRef(false);
const cloudInitDriveVisible = shallowRef(false);
const rngVisible = shallowRef(false);
const virtiofsVisible = shallowRef(false);
const importDiskVisible = shallowRef(false);
const mappedDeviceVisible = shallowRef(false);
const mappedDeviceKind = shallowRef<'usb' | 'pci'>('usb');
const editing = shallowRef<HardwareRow>();
const selected = shallowRef<HardwareRow[]>([]);
const form = reactive({
  cores: 1,
  sockets: 1,
  cpu: '',
  vcpus: '',
  cpulimit: '',
  cpuunits: '',
  affinity: '',
  numa: false,
  memory: 512,
  ballooning: true,
  balloon: 512,
  shares: '',
  allowKsm: true,
  bios: 'seabios',
  machine: 'i440fx',
  scsihw: 'virtio-scsi-pci',
  deviceValue: '',
});
const addForm = reactive({
  kind: defaultDeviceKind(),
  storage: '',
  size: 32,
  diskBus: defaultDiskBus(),
  diskFormat: '__default__',
  diskCache: '__default__',
  diskBackup: true,
  diskReplicate: true,
  diskDiscard: false,
  diskIothread: false,
  diskSsd: false,
  diskReadOnly: false,
  bridge: 'vmbr0',
  model: 'virtio',
  vlanTag: '',
  firewall: false,
  macaddr: '',
  rate: '',
  queues: '',
  mtu: '',
  linkDown: false,
  cdrom: '',
  usbMode: 'spice',
  usbValue: '',
  usbMapping: '',
  usb3: false,
  pciMode: 'raw',
  pciAddress: '',
  pciMapping: '',
  pcie: false,
  pciAllFunctions: false,
  pciPrimaryGpu: false,
  pciRomBar: true,
  audioDevice: 'ich9-intel-hda',
  audioDriver: 'spice',
});
const resizeSize = shallowRef('');
const moveForm = reactive({ storage: '', format: '', deleteSource: false });
const reattachForm = reactive({ bus: 'scsi', slot: 0 });
const firmwareForm = reactive({
  type: 'efi',
  storage: '',
  preEnrolledKeys: true,
  tpmVersion: 'v2.0',
});
const cloudInitDriveStorage = shallowRef('');
const rngForm = reactive({ source: '/dev/urandom', maxBytes: '1024', period: '' });
const virtiofsForm = reactive({
  directoryId: '',
  cache: '__default__',
  xattr: false,
  acl: false,
  directIo: false,
});
const moveStorages = shallowRef<string[]>([]);
const importSourceStorages = shallowRef<string[]>([]);
const importTargetStorages = shallowRef<string[]>([]);
const importFiles = shallowRef<PveRecord[]>([]);
const mappedDevices = shallowRef<PveRecord[]>([]);
const mappedDevice = shallowRef('');
const mappedDevicePcie = shallowRef(false);
const confidentialVisible = shallowRef(false);
const confidentialForm = reactive({
  sevType: '__default__',
  sevDebug: true,
  sevKeySharing: true,
  sevSmt: true,
  sevKernelHashes: false,
  tdxType: '__default__',
  tdxAttestation: true,
  tdxCid: '2',
  tdxPort: '4050',
});
const importForm = reactive({ sourceStorage: '', sourceVolume: '', targetStorage: '' });
const pendingRows = shallowRef<PveRecord[]>([]);
function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
const pendingByKey = computed<Record<string, PveRecord>>(() =>
  Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row])),
);

const rows = computed<HardwareRow[]>(() => {
  const config = props.config;
  const base: HardwareRow[] = [
    {
      key: 'cpu',
      name: gettext('CPU'),
      value: `${numberValue(config.sockets, 1)} × ${numberValue(config.cores, 1)}`,
      editable: true,
    },
    {
      key: 'memory',
      name: gettext('Memory'),
      value: `${numberValue(config.memory, 512)} MiB`,
      editable: true,
    },
    {
      key: 'system',
      name: gettext('System'),
      value: `${textValue(config.bios) || 'seabios'} / ${textValue(config.machine) || 'i440fx'} / ${textValue(config.scsihw) || 'virtio-scsi-pci'}`,
      editable: true,
    },
    {
      key: 'vga',
      name: gettext('Display'),
      value: textValue(config.vga) || gettext('Default'),
      editable: true,
    },
    {
      key: 'keyboard',
      name: gettext('Keyboard Layout'),
      value: textValue(config.keyboard) || gettext('Default'),
      editable: true,
    },
    {
      key: 'audio0',
      name: gettext('Audio Device'),
      value: textValue(config.audio0) || gettext('None'),
      editable: true,
    },
    {
      key: 'efidisk0',
      name: gettext('EFI Disk'),
      value: textValue(config.efidisk0) || gettext('None'),
      editable: false,
    },
    {
      key: 'tpmstate0',
      name: gettext('TPM State'),
      value: textValue(config.tpmstate0) || gettext('None'),
      editable: false,
    },
    {
      key: 'rng0',
      name: gettext('VirtIO RNG'),
      value: textValue(config.rng0) || gettext('None'),
      editable: true,
    },
  ];
  const devices = Object.entries(config)
    .filter(([key]) =>
      /^(scsi|virtio|sata|ide|unused|net|usb|hostpci|serial|virtiofs)\d+$/.test(key),
    )
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([key, value]) => ({
      key,
      name: key,
      value: textValue(value) || '-',
      editable: /^(scsi|virtio|sata|ide|net|usb|hostpci|serial|virtiofs)\d+$/.test(key),
    }));
  return [...base, ...devices];
});

const columns = computed<QTableColumn<HardwareRow>[]>(() => [
  { name: 'name', label: gettext('Hardware'), field: 'name', align: 'left' },
  { name: 'value', label: gettext('Value'), field: 'value', align: 'left' },
  {
    name: 'pending',
    label: gettext('Pending Changes'),
    field: (row) =>
      pendingByKey.value[row.key]?.delete
        ? gettext('Deleted')
        : textValue(pendingByKey.value[row.key]?.pending ?? pendingByKey.value[row.key]?.value),
    align: 'left',
  },
  { name: 'action', label: gettext('Action'), field: 'key', align: 'right' },
]);
const editTitle = computed(() => `${gettext('Edit')}: ${editing.value?.name || ''}`);
const selectedDevice = computed(() => selected.value[0]);
const selectedPending = computed(() =>
  Boolean(selectedDevice.value && pendingByKey.value[selectedDevice.value.key]),
);
const isDisk = computed(() =>
  Boolean(selectedDevice.value && /^(scsi|virtio|sata|ide)\d+$/.test(selectedDevice.value.key)),
);
const isUnusedDisk = computed(() =>
  Boolean(selectedDevice.value && /^unused\d+$/.test(selectedDevice.value.key)),
);
const hasCloudInitDrive = computed(() =>
  Object.entries(props.config).some(
    ([key, value]) => /^(ide|scsi|sata)\d+$/.test(key) && textValue(value).includes('cloudinit'),
  ),
);
const reattachTarget = computed(
  () => `${reattachForm.bus}${Math.max(0, Number(reattachForm.slot) || 0)}`,
);
const canUseDeviceMapping = computed(() => {
  const caps = session.caps as unknown as {
    mapping?: Record<string, unknown>;
    nodes?: Record<string, unknown>;
  };
  return Boolean(caps.mapping?.['Mapping.Use'] || caps.nodes?.['Sys.Console']);
});

function hasVmCapability(capability: string) {
  return Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.[capability]);
}

async function loadPending() {
  const response = await getVmPendingConfig(props.node, props.vmid);
  pendingRows.value = response.data || [];
}

async function revertSelected() {
  const row = selectedDevice.value;
  if (!row || !pendingByKey.value[row.key]) return;
  const grouped: Record<string, string[]> = {
    cpu: ['cpu', 'cores', 'sockets', 'numa', 'vcpus', 'cpulimit', 'cpuunits', 'affinity'],
    memory: ['memory', 'balloon', 'shares', 'allow-ksm'],
    system: ['bios', 'machine', 'scsihw'],
  };
  loading.value = true;
  try {
    await revertVmConfig(props.node, props.vmid, grouped[row.key] || [row.key]);
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

function canEditRow(row: HardwareRow) {
  if (row.key === 'cpu')
    return hasVmCapability('VM.Config.CPU') || hasVmCapability('VM.Config.HWType');
  if (row.key === 'memory') return hasVmCapability('VM.Config.Memory');
  if (row.key === 'system')
    return hasVmCapability('VM.Config.Options') || hasVmCapability('VM.Config.HWType');
  if (row.key.startsWith('virtiofs')) return hasVmCapability('VM.Config.Options');
  if (['vga', 'keyboard', 'audio0', 'rng0'].includes(row.key))
    return hasVmCapability('VM.Config.HWType');
  if (row.key.startsWith('net')) return hasVmCapability('VM.Config.Network');
  if (row.key.startsWith('ide') && textValue(props.config[row.key]).includes('media=cdrom'))
    return hasVmCapability('VM.Config.CDROM');
  return hasVmCapability('VM.Config.Disk');
}

function openEditor(row: HardwareRow) {
  if (!row.editable) return;
  editing.value = row;
  form.cores = Number(props.config.cores || 1);
  form.sockets = Number(props.config.sockets || 1);
  form.cpu = textValue(props.config.cpu);
  form.vcpus = textValue(props.config.vcpus);
  form.cpulimit = textValue(props.config.cpulimit);
  form.cpuunits = textValue(props.config.cpuunits);
  form.affinity = textValue(props.config.affinity);
  form.numa = Number(props.config.numa || 0) === 1;
  form.memory = Number(props.config.memory || 512);
  form.ballooning = Number(props.config.balloon ?? props.config.memory ?? 512) !== 0;
  form.balloon = Number(props.config.balloon || props.config.memory || 512);
  form.shares = textValue(props.config.shares);
  form.allowKsm = Number(props.config['allow-ksm'] ?? 1) === 1;
  form.bios = textValue(props.config.bios) || 'seabios';
  form.machine = textValue(props.config.machine) || 'i440fx';
  form.scsihw = textValue(props.config.scsihw) || 'virtio-scsi-pci';
  form.deviceValue = textValue(props.config[row.key]);
  editVisible.value = true;
}

async function save() {
  if (!editing.value) return;
  if (!canEditRow(editing.value)) return;
  const data: PveRecord = { digest: props.config.digest };
  if (editing.value.key === 'cpu') {
    Object.assign(data, { cores: form.cores, sockets: form.sockets, numa: form.numa ? 1 : 0 });
    const deletedKeys: string[] = [];
    if (form.cpu.trim()) data.cpu = form.cpu.trim();
    else if (props.config.cpu) deletedKeys.push('cpu');
    (['vcpus', 'cpulimit', 'cpuunits', 'affinity'] as const).forEach((key) => {
      const value = form[key].trim();
      if (value) data[key] = value;
      else if (props.config[key] !== undefined) deletedKeys.push(key);
    });
    if (deletedKeys.length) data.delete = deletedKeys.join(',');
  }
  if (editing.value.key === 'memory') {
    data.memory = form.memory;
    data['allow-ksm'] = form.allowKsm ? 1 : 0;
    const deletedKeys: string[] = [];
    if (!form.ballooning) {
      data.balloon = 0;
      if (props.config.shares !== undefined) deletedKeys.push('shares');
    } else if (form.balloon === form.memory) {
      if (props.config.balloon !== undefined) deletedKeys.push('balloon');
      if (props.config.shares !== undefined) deletedKeys.push('shares');
    } else {
      data.balloon = form.balloon;
      if (form.shares.trim()) data.shares = form.shares.trim();
      else if (props.config.shares !== undefined) deletedKeys.push('shares');
    }
    if (deletedKeys.length) data.delete = deletedKeys.join(',');
  }
  if (editing.value.key === 'system')
    Object.assign(data, { bios: form.bios, machine: form.machine, scsihw: form.scsihw });
  if (editing.value.key === 'vga') {
    if (form.deviceValue.trim()) data.vga = form.deviceValue;
    else data.delete = textValue(data.delete) ? `${textValue(data.delete)},vga` : 'vga';
  } else if (
    /^(scsi|virtio|sata|ide|net|usb|hostpci|serial|virtiofs)\d+$/.test(editing.value.key) ||
    ['keyboard', 'audio0', 'rng0'].includes(editing.value.key)
  )
    data[editing.value.key] = form.deviceValue;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data);
    editVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function removeDevice() {
  const device = selectedDevice.value;
  if (!device || !canEditRow(device)) return;
  if (
    !device ||
    (!/^(scsi|virtio|sata|ide|net|usb|hostpci|serial|virtiofs)\d+$/.test(device.key) &&
      !['audio0', 'efidisk0', 'tpmstate0', 'rng0'].includes(device.key))
  )
    return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', device.name),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void updateVmConfig(props.node, props.vmid, { digest: props.config.digest, delete: device.key })
      .then(() => emit('updated'))
      .finally(() => {
        loading.value = false;
      });
  });
}

function openResize() {
  resizeSize.value = '';
  resizeVisible.value = true;
}
async function resizeDisk() {
  const disk = selectedDevice.value?.key;
  if (!hasVmCapability('VM.Config.Disk') || !disk || !resizeSize.value) return;
  loading.value = true;
  try {
    await resizeVmDisk(props.node, props.vmid, disk, `+${resizeSize.value}G`);
    resizeVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}
async function openMove() {
  const disk = selectedDevice.value?.key;
  if (!hasVmCapability('VM.Config.Disk') || !disk) return;
  loading.value = true;
  try {
    const response = await getNodeStorage(props.node, 'images');
    moveStorages.value = (response.data || [])
      .map((item) => textValue(item.storage))
      .filter(Boolean);
    moveForm.storage = moveStorages.value[0] || '';
    moveForm.format = '';
    moveForm.deleteSource = false;
    moveVisible.value = true;
  } finally {
    loading.value = false;
  }
}
async function moveDisk() {
  const disk = selectedDevice.value?.key;
  if (!hasVmCapability('VM.Config.Disk') || !disk || !moveForm.storage) return;
  loading.value = true;
  try {
    await moveVmDisk(props.node, props.vmid, {
      disk,
      storage: moveForm.storage,
      ...(moveForm.format ? { format: moveForm.format } : {}),
      delete: moveForm.deleteSource ? 1 : 0,
    });
    moveVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

async function loadImportFiles() {
  importForm.sourceVolume = '';
  importFiles.value = [];
  if (!importForm.sourceStorage) return;
  const response = await getStorageContent(props.node, importForm.sourceStorage, 'import');
  importFiles.value = (response.data || []).filter((item) =>
    ['qcow2', 'vmdk', 'raw'].includes(textValue(item.format).toLowerCase()),
  );
}

async function openImportDisk() {
  if (!hasVmCapability('VM.Config.Disk')) return;
  loading.value = true;
  try {
    const [sourceResponse, targetResponse] = await Promise.all([
      getNodeStorage(props.node, 'import'),
      getNodeStorage(props.node, 'images'),
    ]);
    importSourceStorages.value = (sourceResponse.data || [])
      .map((item) => textValue(item.storage))
      .filter(Boolean);
    importTargetStorages.value = (targetResponse.data || [])
      .map((item) => textValue(item.storage))
      .filter(Boolean);
    importForm.sourceStorage = importSourceStorages.value[0] || '';
    importForm.targetStorage = importTargetStorages.value[0] || '';
    await loadImportFiles();
    importDiskVisible.value = true;
  } finally {
    loading.value = false;
  }
}

function openAddHardware() {
  addVisible.value = true;
}

async function importDisk() {
  if (!hasVmCapability('VM.Config.Disk') || !importForm.sourceVolume || !importForm.targetStorage)
    return;
  const key = nextDeviceKey('scsi');
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      [key]: `${importForm.targetStorage}:0,import-from=${importForm.sourceVolume}`,
    });
    importDiskVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

async function openMappedDevice(kind: 'usb' | 'pci') {
  if (!canUseDeviceMapping.value) return;
  loading.value = true;
  try {
    const response =
      kind === 'usb' ? await getUsbMappings(props.node) : await getPciMappings(props.node);
    mappedDeviceKind.value = kind;
    mappedDevices.value = response.data || [];
    mappedDevice.value = '';
    mappedDevicePcie.value = false;
    mappedDeviceVisible.value = true;
  } finally {
    loading.value = false;
  }
}

async function addMappedDevice() {
  if (!canUseDeviceMapping.value || !mappedDevice.value) return;
  const key = mappedDeviceKind.value === 'usb' ? nextDeviceKey('usb') : nextDeviceKey('hostpci');
  const value = `mapping=${mappedDevice.value}${mappedDeviceKind.value === 'pci' && mappedDevicePcie.value ? ',pcie=1' : ''}`;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, { digest: props.config.digest, [key]: value });
    mappedDeviceVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function parsePropertyString(value: unknown) {
  return Object.fromEntries(
    textValue(value)
      .split(',')
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split('=');
        return [key, rest.join('=') || '1'];
      }),
  );
}

function openConfidentialComputing() {
  if (!hasVmCapability('VM.Config.HWType')) return;
  const sev = parsePropertyString(props.config['amd-sev']);
  const tdx = parsePropertyString(props.config['intel-tdx']);
  confidentialForm.sevType = ['std', 'es', 'snp'].includes(String(sev.type || ''))
    ? String(sev.type)
    : '__default__';
  confidentialForm.sevDebug = String(sev['no-debug'] || '0') !== '1';
  confidentialForm.sevKeySharing = String(sev['no-key-sharing'] || '0') !== '1';
  confidentialForm.sevSmt = String(sev['allow-smt'] || '1') !== '0';
  confidentialForm.sevKernelHashes = String(sev['kernel-hashes'] || '0') === '1';
  confidentialForm.tdxType = String(tdx.type || '') === 'tdx' ? 'tdx' : '__default__';
  confidentialForm.tdxAttestation = String(tdx.attestation || '1') !== '0';
  confidentialForm.tdxCid = String(tdx['vsock-cid'] || '2');
  confidentialForm.tdxPort = String(tdx['vsock-port'] || '4050');
  confidentialVisible.value = true;
}

async function saveConfidentialComputing() {
  if (!hasVmCapability('VM.Config.HWType')) return;
  const data: PveRecord = { digest: props.config.digest };
  const deleted: string[] = [];
  if (confidentialForm.sevType === '__default__') deleted.push('amd-sev');
  else {
    const values = [`type=${confidentialForm.sevType}`];
    if (!confidentialForm.sevDebug) values.push('no-debug=1');
    if (confidentialForm.sevType === 'snp' && !confidentialForm.sevSmt) values.push('allow-smt=0');
    if (confidentialForm.sevType !== 'snp' && !confidentialForm.sevKeySharing)
      values.push('no-key-sharing=1');
    if (confidentialForm.sevKernelHashes) values.push('kernel-hashes=1');
    data['amd-sev'] = values.join(',');
  }
  if (confidentialForm.tdxType === '__default__') deleted.push('intel-tdx');
  else
    data['intel-tdx'] = [
      `type=tdx`,
      `attestation=${confidentialForm.tdxAttestation ? 1 : 0}`,
      ...(confidentialForm.tdxAttestation
        ? [
            `vsock-cid=${confidentialForm.tdxCid || '2'}`,
            `vsock-port=${confidentialForm.tdxPort || '4050'}`,
          ]
        : []),
    ].join(',');
  if (deleted.length) data.delete = deleted.join(',');
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data);
    confidentialVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function firstFreeDeviceSlot(bus: string, limit = 32) {
  for (let slot = 0; slot < limit; slot += 1) {
    if (!props.config[`${bus}${slot}`]) return slot;
  }
  return 0;
}

function openReattach() {
  reattachForm.bus = 'scsi';
  reattachForm.slot = firstFreeDeviceSlot(reattachForm.bus);
  reattachVisible.value = true;
}

async function reattachDisk() {
  const disk = selectedDevice.value;
  const target = reattachTarget.value;
  if (
    !hasVmCapability('VM.Config.Disk') ||
    !disk ||
    !/^unused\d+$/.test(disk.key) ||
    props.config[target]
  )
    return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      [target]: textValue(props.config[disk.key]),
    });
    reattachVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function openFirmware(type: 'efi' | 'tpm') {
  firmwareForm.type = type;
  firmwareForm.storage = '';
  firmwareForm.preEnrolledKeys = true;
  firmwareForm.tpmVersion = 'v2.0';
  firmwareVisible.value = true;
}

async function addFirmware() {
  const key = firmwareForm.type === 'efi' ? 'efidisk0' : 'tpmstate0';
  if (!hasVmCapability('VM.Config.Disk') || !firmwareForm.storage || props.config[key]) return;
  const value =
    firmwareForm.type === 'efi'
      ? `${firmwareForm.storage}:1,efitype=4m,pre-enrolled-keys=${firmwareForm.preEnrolledKeys ? 1 : 0}`
      : `${firmwareForm.storage}:1,version=${firmwareForm.tpmVersion}`;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, { digest: props.config.digest, [key]: value });
    firmwareVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function openCloudInitDrive() {
  if (
    !hasVmCapability('VM.Config.CDROM') ||
    !hasVmCapability('VM.Config.Cloudinit') ||
    hasCloudInitDrive.value
  )
    return;
  cloudInitDriveStorage.value = '';
  cloudInitDriveVisible.value = true;
}

async function addCloudInitDrive() {
  if (
    !hasVmCapability('VM.Config.CDROM') ||
    !hasVmCapability('VM.Config.Cloudinit') ||
    hasCloudInitDrive.value ||
    !cloudInitDriveStorage.value.trim()
  )
    return;
  const key = nextDeviceKey('ide', 4);
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      [key]: `${cloudInitDriveStorage.value.trim()}:cloudinit,media=cdrom`,
    });
    cloudInitDriveVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function openRng() {
  rngForm.source = '/dev/urandom';
  rngForm.maxBytes = '1024';
  rngForm.period = '';
  rngVisible.value = true;
}

function openVirtiofs() {
  if (!hasVmCapability('VM.Config.Options')) return;
  virtiofsForm.directoryId = '';
  virtiofsForm.cache = '__default__';
  virtiofsForm.xattr = false;
  virtiofsForm.acl = false;
  virtiofsForm.directIo = false;
  virtiofsVisible.value = true;
}

async function addVirtiofs() {
  const key = nextDeviceKey('virtiofs');
  if (!hasVmCapability('VM.Config.Options') || !virtiofsForm.directoryId.trim()) return;
  const values = [`dirid=${virtiofsForm.directoryId.trim()}`];
  if (virtiofsForm.cache !== '__default__') values.push(`cache=${virtiofsForm.cache}`);
  if (virtiofsForm.xattr || virtiofsForm.acl) values.push('expose-xattr=1');
  if (virtiofsForm.acl) values.push('expose-acl=1');
  if (virtiofsForm.directIo) values.push('direct-io=1');
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      [key]: values.join(','),
    });
    virtiofsVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

async function addRng() {
  if (!hasVmCapability('VM.Config.HWType') || props.config.rng0) return;
  const values = [`source=${rngForm.source}`];
  if (rngForm.maxBytes.trim()) values.push(`max_bytes=${rngForm.maxBytes.trim()}`);
  if (rngForm.period.trim()) values.push(`period=${rngForm.period.trim()}`);
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      rng0: values.join(','),
    });
    rngVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
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
async function addDevice() {
  const requiredCapability: Record<DeviceKind, string> = {
    disk: 'VM.Config.Disk',
    cdrom: 'VM.Config.CDROM',
    net: 'VM.Config.Network',
    audio: 'VM.Config.HWType',
    usb: 'VM.Config.HWType',
    pci: 'VM.Config.HWType',
    serial: 'VM.Config.HWType',
  };
  if (!hasVmCapability(requiredCapability[addForm.kind])) return;
  const diskOptions = [`${addForm.storage}:${addForm.size}`];
  if (addForm.diskFormat !== '__default__') diskOptions.push(`format=${addForm.diskFormat}`);
  if (addForm.diskCache !== '__default__') diskOptions.push(`cache=${addForm.diskCache}`);
  if (!addForm.diskBackup) diskOptions.push('backup=0');
  if (!addForm.diskReplicate) diskOptions.push('replicate=0');
  if (addForm.diskDiscard) diskOptions.push('discard=on');
  if (addForm.diskIothread) diskOptions.push('iothread=on');
  if (addForm.diskSsd) diskOptions.push('ssd=on');
  if (addForm.diskReadOnly) diskOptions.push('ro=on');
  const networkOptions = [addForm.model, `bridge=${addForm.bridge}`];
  if (addForm.vlanTag.trim()) networkOptions.push(`tag=${addForm.vlanTag.trim()}`);
  if (addForm.firewall) networkOptions.push('firewall=1');
  if (addForm.macaddr.trim()) networkOptions.push(`macaddr=${addForm.macaddr.trim()}`);
  if (addForm.rate.trim()) networkOptions.push(`rate=${addForm.rate.trim()}`);
  if (addForm.queues.trim()) networkOptions.push(`queues=${addForm.queues.trim()}`);
  if (addForm.mtu.trim()) networkOptions.push(`mtu=${addForm.mtu.trim()}`);
  if (addForm.linkDown) networkOptions.push('link_down=1');
  const keys: Record<DeviceKind, string> = {
    disk: nextDeviceKey(addForm.diskBus),
    net: nextDeviceKey('net'),
    cdrom: nextDeviceKey('ide', 4),
    usb: nextDeviceKey('usb'),
    pci: nextDeviceKey('hostpci'),
    serial: nextDeviceKey('serial', 4),
    audio: 'audio0',
  };
  const values: Record<DeviceKind, string> = {
    disk: addForm.storage ? diskOptions.join(',') : '',
    net: networkOptions.join(','),
    cdrom: addForm.cdrom
      ? `${addForm.cdrom}${addForm.cdrom.includes('media=cdrom') ? '' : ',media=cdrom'}`
      : 'none,media=cdrom',
    usb: addForm.usbMode === 'spice' ? 'spice' : addForm.usbValue,
    pci: addForm.pciAddress ? `${addForm.pciAddress}${addForm.pcie ? ',pcie=1' : ''}` : '',
    serial: 'socket',
    audio: `device=${addForm.audioDevice},driver=${addForm.audioDriver}`,
  };
  const key = keys[addForm.kind];
  const value = values[addForm.kind];
  if (!value || (addForm.kind === 'audio' && props.config.audio0)) return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, { digest: props.config.digest, [key]: value });
    addVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <q-table
      v-model:selected="selected"
      selection="single"
      flat
      :rows="rows"
      :columns="columns"
      row-key="key"
      table-header-class="u-table-header"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('no record can be found')"
    >
      <template #top
        ><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Add')"
          @click="openAddHardware" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :label="gettext('Import Hard Disk')"
          @click="openImportDisk" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :disable="Boolean(props.config.efidisk0)"
          :label="gettext('Add EFI Disk')"
          @click="openFirmware('efi')" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :disable="Boolean(props.config.tpmstate0)"
          :label="gettext('Add TPM State')"
          @click="openFirmware('tpm')" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :disable="Boolean(props.config.rng0)"
          :label="gettext('Add VirtIO RNG')"
          @click="openRng" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :label="gettext('Add Virtiofs')"
          @click="openVirtiofs" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :disable="!isUnusedDisk"
          :label="gettext('Reassign')"
          @click="openReattach" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :disable="!isDisk"
          :label="gettext('Resize disk')"
          @click="openResize" /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button q-ml-sm"
          :disable="!isDisk"
          :label="gettext('Move disk')"
          @click="openMove" /><q-btn
          no-caps
          outline
          size="12px"
          color="negative"
          class="u-button q-ml-sm"
          :disable="
            !selectedDevice ||
            (!/^(scsi|virtio|sata|ide|net|usb|hostpci|serial|virtiofs)\d+$/.test(
              selectedDevice.key,
            ) &&
              !['audio0', 'efidisk0', 'tpmstate0', 'rng0'].includes(selectedDevice.key))
          "
          :label="gettext('Remove')"
          @click="removeDevice" /><q-btn
          no-caps
          outline
          size="12px"
          color="warning"
          class="u-button q-ml-sm"
          :disable="!selectedDevice || !selectedPending || !canEditRow(selectedDevice)"
          :label="gettext('Revert pending changes')"
          @click="revertSelected"
      /></template>
      <template #body-cell-action="scope"
        ><q-td :props="scope"
          ><q-btn
            v-if="scope.row.editable"
            no-caps
            flat
            dense
            size="12px"
            color="primary"
            :label="gettext('Edit')"
            @click="openEditor(scope.row)" /></q-td
      ></template>
    </q-table>
    <div class="q-mt-sm">
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :disable="hasCloudInitDrive"
        :label="gettext('Add Cloud-Init Drive')"
        @click="openCloudInitDrive"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button q-ml-sm"
        :disable="!canUseDeviceMapping"
        :label="gettext('Add Mapped USB Device')"
        @click="openMappedDevice('usb')"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button q-ml-sm"
        :disable="!canUseDeviceMapping"
        :label="gettext('Add Mapped PCI Device')"
        @click="openMappedDevice('pci')"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button q-ml-sm"
        :disable="!hasVmCapability('VM.Config.HWType')"
        :label="gettext('Confidential Computing')"
        @click="openConfidentialComputing"
      />
    </div>
    <q-dialog v-model="editVisible" persistent transition-show="scale" transition-hide="scale">
      <UWindow :title="editTitle" width="520px" :loading="loading">
        <div class="q-pa-md u-hidden-error">
          <div v-if="editing?.key === 'cpu'" class="row q-col-gutter-md">
            <div class="col-6">
              <q-input
                v-model.number="form.sockets"
                dense
                outlined
                square
                type="number"
                min="1"
                :label="gettext('Sockets')"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model.number="form.cores"
                dense
                outlined
                square
                type="number"
                min="1"
                :label="gettext('Cores')"
              />
            </div>
            <div class="col-12">
              <q-input
                v-model="form.cpu"
                dense
                outlined
                square
                :label="gettext('CPU Type / options')"
                hint="host or cputype=host,flags=..."
              />
            </div>
            <div class="col-4">
              <q-input
                v-model="form.vcpus"
                dense
                outlined
                square
                type="number"
                min="1"
                :label="gettext('VCPUs')"
              />
            </div>
            <div class="col-4">
              <q-input
                v-model="form.cpulimit"
                dense
                outlined
                square
                type="number"
                min="0"
                :label="gettext('CPU limit')"
              />
            </div>
            <div class="col-4">
              <q-input
                v-model="form.cpuunits"
                dense
                outlined
                square
                type="number"
                min="1"
                :label="gettext('CPU units')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="form.affinity"
                dense
                outlined
                square
                :label="gettext('CPU Affinity')"
                hint="0-3,6"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-checkbox
                v-model="form.numa"
                dense
                color="primary"
                :label="gettext('Enable NUMA')"
              />
            </div>
          </div>
          <div v-else-if="editing?.key === 'memory'" class="row q-col-gutter-md">
            <div class="col-12">
              <q-input
                v-model.number="form.memory"
                dense
                outlined
                square
                type="number"
                min="128"
                :label="gettext('Memory (MiB)')"
              />
            </div>
            <div class="col-12">
              <q-checkbox
                v-model="form.ballooning"
                dense
                color="primary"
                :label="gettext('Ballooning Device')"
              />
            </div>
            <template v-if="form.ballooning"
              ><div class="col-6">
                <q-input
                  v-model.number="form.balloon"
                  dense
                  outlined
                  square
                  type="number"
                  min="1"
                  :max="form.memory"
                  :label="gettext('Minimum memory')"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="form.shares"
                  dense
                  outlined
                  square
                  type="number"
                  min="0"
                  :disable="form.balloon === form.memory"
                  :label="gettext('Shares')"
                /></div
            ></template>
            <div class="col-12">
              <q-checkbox
                v-model="form.allowKsm"
                dense
                color="primary"
                :label="gettext('Allow KSM')"
              />
            </div>
          </div>
          <div v-else-if="editing?.key === 'system'" class="row q-col-gutter-md">
            <div class="col-4">
              <q-select
                v-model="form.bios"
                dense
                outlined
                square
                options-dense
                emit-value
                map-options
                :options="[
                  { label: 'SeaBIOS', value: 'seabios' },
                  { label: 'OVMF (UEFI)', value: 'ovmf' },
                ]"
                :label="gettext('BIOS')"
              />
            </div>
            <div class="col-4">
              <q-select
                v-model="form.machine"
                dense
                outlined
                square
                options-dense
                emit-value
                map-options
                :options="[
                  { label: 'i440fx', value: 'i440fx' },
                  { label: 'Q35', value: 'q35' },
                ]"
                :label="gettext('Machine')"
              />
            </div>
            <div class="col-4">
              <q-select
                v-model="form.scsihw"
                dense
                outlined
                square
                options-dense
                :options="['virtio-scsi-pci', 'virtio-scsi-single', 'lsi', 'megasas', 'pvscsi']"
                :label="gettext('SCSI Controller')"
              />
            </div>
          </div>
          <q-select
            v-else-if="editing?.key === 'vga'"
            v-model="form.deviceValue"
            dense
            outlined
            square
            clearable
            :label="gettext('Graphic card')"
            :options="[
              'std',
              'cirrus',
              'vmware',
              'qxl',
              'qxl2',
              'qxl3',
              'qxl4',
              'virtio',
              'serial0',
              'serial1',
              'serial2',
              'serial3',
              'none',
            ]"
          />
          <q-select
            v-else-if="editing?.key === 'keyboard'"
            v-model="form.deviceValue"
            dense
            outlined
            square
            clearable
            :label="gettext('Keyboard Layout')"
            :options="[
              'de',
              'de-ch',
              'da',
              'en-gb',
              'en-us',
              'es',
              'fi',
              'fr',
              'fr-be',
              'fr-ca',
              'fr-ch',
              'hu',
              'is',
              'it',
              'ja',
              'lt',
              'mk',
              'nl',
              'no',
              'pl',
              'pt',
              'pt-br',
              'sl',
              'sv',
              'tr',
            ]"
          />
          <q-input
            v-else
            v-model="form.deviceValue"
            dense
            outlined
            square
            :label="gettext('Value')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button q-mr-sm"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="loading"
            :label="gettext('Save')"
            @click="save"
        /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="addVisible" persistent
      ><UWindow :title="gettext('Add Hardware')" width="560px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="addForm.kind"
            dense
            square
            outlined
            emit-value
            map-options
            :label="gettext('Type')"
            :options="[
              { label: gettext('Disk'), value: 'disk' },
              { label: gettext('Network Device'), value: 'net' },
              { label: gettext('CD-ROM Drive'), value: 'cdrom' },
              { label: gettext('USB Device'), value: 'usb' },
              { label: gettext('PCI Device'), value: 'pci' },
              { label: gettext('Serial Port'), value: 'serial' },
              { label: gettext('Audio Device'), value: 'audio' },
            ]"
          /><template v-if="addForm.kind === 'disk'"
            ><div class="row q-col-gutter-md">
              <div class="col-4">
                <q-select
                  v-model="addForm.diskBus"
                  dense
                  square
                  outlined
                  emit-value
                  map-options
                  :label="gettext('Bus')"
                  :options="[
                    { label: 'SCSI', value: 'scsi' },
                    { label: 'VirtIO', value: 'virtio' },
                    { label: 'SATA', value: 'sata' },
                    { label: 'IDE', value: 'ide' },
                  ]"
                />
              </div>
              <div class="col-4">
                <q-input
                  v-model="addForm.storage"
                  dense
                  square
                  outlined
                  :label="gettext('Storage')"
                />
              </div>
              <div class="col-4">
                <q-input
                  v-model.number="addForm.size"
                  dense
                  square
                  outlined
                  type="number"
                  :label="gettext('Disk Size (GiB)')"
                />
              </div>
              <div class="col-6">
                <q-select
                  v-model="addForm.diskFormat"
                  dense
                  square
                  outlined
                  emit-value
                  map-options
                  :label="gettext('Disk Format')"
                  :options="[
                    { label: gettext('Default'), value: '__default__' },
                    { label: 'raw', value: 'raw' },
                    { label: 'qcow2', value: 'qcow2' },
                    { label: 'vmdk', value: 'vmdk' },
                  ]"
                />
              </div>
              <div class="col-6">
                <q-select
                  v-model="addForm.diskCache"
                  dense
                  square
                  outlined
                  emit-value
                  map-options
                  :label="gettext('Cache')"
                  :options="[
                    { label: gettext('Default'), value: '__default__' },
                    { label: 'none', value: 'none' },
                    { label: 'writethrough', value: 'writethrough' },
                    { label: 'writeback', value: 'writeback' },
                    { label: 'directsync', value: 'directsync' },
                    { label: 'unsafe', value: 'unsafe' },
                  ]"
                />
              </div>
              <div class="col-12 q-gutter-sm">
                <q-checkbox
                  v-model="addForm.diskBackup"
                  :label="gettext('Include in backup')"
                /><q-checkbox
                  v-model="addForm.diskReplicate"
                  :label="gettext('Replicate')"
                /><q-checkbox
                  v-model="addForm.diskDiscard"
                  :label="gettext('Discard')"
                /><q-checkbox v-model="addForm.diskIothread" label="IO thread" /><q-checkbox
                  v-model="addForm.diskSsd"
                  :label="gettext('SSD emulation')"
                /><q-checkbox v-model="addForm.diskReadOnly" :label="gettext('Read-only')" />
              </div></div></template
          ><template v-else-if="addForm.kind === 'net'"
            ><div class="row q-col-gutter-md">
              <div class="col-6">
                <q-select
                  v-model="addForm.model"
                  dense
                  square
                  outlined
                  :label="gettext('Model')"
                  :options="['virtio', 'e1000', 'rtl8139']"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="addForm.bridge"
                  dense
                  square
                  outlined
                  :label="gettext('Bridge')"
                />
              </div>
              <div class="col-4">
                <q-input
                  v-model="addForm.vlanTag"
                  dense
                  square
                  outlined
                  type="number"
                  :label="gettext('VLAN Tag')"
                />
              </div>
              <div class="col-4">
                <q-input
                  v-model="addForm.rate"
                  dense
                  square
                  outlined
                  type="number"
                  :label="gettext('Rate limit (MB/s)')"
                />
              </div>
              <div class="col-4">
                <q-input
                  v-model="addForm.queues"
                  dense
                  square
                  outlined
                  type="number"
                  :label="gettext('Queues')"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="addForm.macaddr"
                  dense
                  square
                  outlined
                  :label="gettext('MAC Address')"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="addForm.mtu"
                  dense
                  square
                  outlined
                  type="number"
                  :label="gettext('MTU')"
                />
              </div>
              <div class="col-12 q-gutter-sm">
                <q-checkbox v-model="addForm.firewall" :label="gettext('Firewall')" /><q-checkbox
                  v-model="addForm.linkDown"
                  :label="gettext('Disconnect')"
                />
              </div></div></template
          ><q-input
            v-else-if="addForm.kind === 'cdrom'"
            v-model="addForm.cdrom"
            dense
            square
            outlined
            :label="gettext('ISO image or volume')"
            hint="local:iso/example.iso"
          /><template v-else-if="addForm.kind === 'usb'"
            ><q-select
              v-model="addForm.usbMode"
              dense
              square
              outlined
              emit-value
              map-options
              :options="[
                { label: gettext('Spice Port'), value: 'spice' },
                { label: gettext('USB Vendor/Device ID'), value: 'host' },
              ]"
              :label="gettext('Type')" /><q-input
              v-if="addForm.usbMode === 'host'"
              v-model="addForm.usbValue"
              dense
              square
              outlined
              :label="gettext('USB device value')"
              hint="host=1234:5678" /></template
          ><template v-else-if="addForm.kind === 'pci'"
            ><q-input
              v-model="addForm.pciAddress"
              dense
              square
              outlined
              :label="gettext('PCI address')"
              hint="0000:01:00.0" /><q-checkbox
              v-model="addForm.pcie"
              :label="gettext('PCI-Express')" /></template
          ><template v-else-if="addForm.kind === 'audio'"
            ><q-select
              v-model="addForm.audioDevice"
              dense
              square
              outlined
              :label="gettext('Audio Device')"
              :options="['ich9-intel-hda', 'intel-hda', 'AC97']" /><q-select
              v-model="addForm.audioDriver"
              dense
              square
              outlined
              :label="gettext('Backend Driver')"
              :options="[
                { label: 'SPICE', value: 'spice' },
                { label: `${gettext('None')} (${gettext('Dummy Device')})`, value: 'none' },
              ]"
          /></template>
          <div v-else class="text-caption">
            {{ gettext('A socket serial port will be added.') }}
          </div>
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Add')"
            @click="addDevice" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="importDiskVisible" persistent
      ><UWindow :title="gettext('Import Hard Disk')" width="520px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="importForm.sourceStorage"
            dense
            square
            outlined
            :options="importSourceStorages"
            :label="gettext('Import Storage')"
            @update:model-value="loadImportFiles"
          /><q-select
            v-model="importForm.sourceVolume"
            dense
            square
            outlined
            emit-value
            map-options
            :options="
              importFiles.map((file) => ({
                label: String(file.volid || file.text || ''),
                value: String(file.volid || file.text || ''),
              }))
            "
            :label="gettext('Select Image')"
          /><q-select
            v-model="importForm.targetStorage"
            dense
            square
            outlined
            :options="importTargetStorages"
            :label="gettext('Target Storage')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!importForm.sourceVolume || !importForm.targetStorage"
            :label="gettext('Import')"
            @click="importDisk" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="resizeVisible" persistent
      ><UWindow :title="gettext('Resize disk')" width="420px" :loading="loading"
        ><div class="q-pa-md">
          <q-input
            v-model="resizeSize"
            dense
            square
            outlined
            type="number"
            min="1"
            :label="gettext('Increase size (GiB)')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Resize disk')"
            @click="resizeDisk" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="moveVisible" persistent
      ><UWindow :title="gettext('Move disk')" width="460px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="moveForm.storage"
            dense
            square
            outlined
            :options="moveStorages"
            :label="gettext('Target Storage')"
          /><q-select
            v-model="moveForm.format"
            dense
            square
            outlined
            clearable
            :options="['raw', 'qcow2', 'vmdk']"
            :label="gettext('Disk Format')"
          /><q-checkbox v-model="moveForm.deleteSource" :label="gettext('Delete source')" />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!moveForm.storage"
            :label="gettext('Move disk')"
            @click="moveDisk" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="reattachVisible" persistent
      ><UWindow :title="gettext('Reassign unused disk')" width="420px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="reattachForm.bus"
            dense
            square
            outlined
            emit-value
            map-options
            :options="[
              { label: 'SCSI', value: 'scsi' },
              { label: 'VirtIO', value: 'virtio' },
              { label: 'SATA', value: 'sata' },
              { label: 'IDE', value: 'ide' },
            ]"
            :label="gettext('Bus/Device')"
            @update:model-value="reattachForm.slot = firstFreeDeviceSlot(reattachForm.bus)"
          /><q-input
            v-model.number="reattachForm.slot"
            dense
            square
            outlined
            type="number"
            min="0"
            :label="gettext('Device slot')"
          />
          <div class="text-caption">{{ gettext('Target device') }}: {{ reattachTarget }}</div>
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="Boolean(props.config[reattachTarget])"
            :label="gettext('Reassign')"
            @click="reattachDisk" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="firmwareVisible" persistent
      ><UWindow
        :title="gettext(firmwareForm.type === 'efi' ? 'EFI Disk' : 'TPM State')"
        width="440px"
        :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-input
            v-model="firmwareForm.storage"
            dense
            square
            outlined
            :label="gettext(firmwareForm.type === 'efi' ? 'EFI Storage' : 'TPM Storage')"
          /><q-checkbox
            v-if="firmwareForm.type === 'efi'"
            v-model="firmwareForm.preEnrolledKeys"
            :label="gettext('Pre-Enroll keys')"
          /><q-select
            v-else
            v-model="firmwareForm.tpmVersion"
            dense
            square
            outlined
            :options="['v1.2', 'v2.0']"
            :label="gettext('Version')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!firmwareForm.storage"
            :label="gettext('Add')"
            @click="addFirmware" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="rngVisible" persistent
      ><UWindow :title="gettext('VirtIO RNG')" width="440px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="rngForm.source"
            dense
            square
            outlined
            :options="['/dev/urandom', '/dev/random', '/dev/hwrng']"
            :label="gettext('Entropy source')"
          /><q-input
            v-model="rngForm.maxBytes"
            dense
            square
            outlined
            type="number"
            min="0"
            :label="gettext('Limit (Bytes/Period)')"
          /><q-input
            v-model="rngForm.period"
            dense
            square
            outlined
            type="number"
            min="1"
            :label="`${gettext('Period')} (ms)`"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Add')"
            @click="addRng" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="virtiofsVisible" persistent
      ><UWindow :title="gettext('Virtiofs Filesystem Passthrough')" width="460px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-input
            v-model="virtiofsForm.directoryId"
            dense
            square
            outlined
            :label="gettext('Directory ID')"
            :hint="
              gettext('Directory Mappings can be managed under Datacenter -> Directory Mappings')
            "
          /><q-select
            v-model="virtiofsForm.cache"
            dense
            square
            outlined
            emit-value
            map-options
            :options="[
              { label: `${gettext('Default')} (auto)`, value: '__default__' },
              { label: 'auto', value: 'auto' },
              { label: 'always', value: 'always' },
              { label: 'metadata', value: 'metadata' },
              { label: 'never', value: 'never' },
            ]"
            :label="gettext('Cache')"
          /><q-checkbox
            v-model="virtiofsForm.xattr"
            :disable="virtiofsForm.acl"
            :label="gettext('xattr Support')"
          /><q-checkbox v-model="virtiofsForm.acl" :label="gettext('POSIX ACLs')" /><q-checkbox
            v-model="virtiofsForm.directIo"
            :label="gettext('Allow Direct IO')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!virtiofsForm.directoryId.trim()"
            :label="gettext('Add')"
            @click="addVirtiofs" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="cloudInitDriveVisible" persistent
      ><UWindow :title="gettext('Add Cloud-Init Drive')" width="440px" :loading="loading"
        ><div class="q-pa-md">
          <q-input
            v-model="cloudInitDriveStorage"
            dense
            square
            outlined
            :label="gettext('Storage')"
            hint="local-lvm"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!cloudInitDriveStorage.trim()"
            :label="gettext('Add')"
            @click="addCloudInitDrive" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="mappedDeviceVisible" persistent
      ><UWindow
        :title="
          gettext(mappedDeviceKind === 'usb' ? 'Add Mapped USB Device' : 'Add Mapped PCI Device')
        "
        width="500px"
        :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="mappedDevice"
            dense
            square
            outlined
            emit-value
            map-options
            :options="
              mappedDevices.map((item) => ({
                label: `${item.id || ''}${item.description ? ` - ${item.description}` : ''}`,
                value: String(item.id || ''),
              }))
            "
            :label="gettext('Mapped Device')"
          /><q-checkbox
            v-if="mappedDeviceKind === 'pci'"
            v-model="mappedDevicePcie"
            :label="gettext('PCI-Express')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!mappedDevice"
            :label="gettext('Add')"
            @click="addMappedDevice" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="confidentialVisible" persistent
      ><UWindow :title="gettext('Confidential Computing')" width="580px" :loading="loading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="confidentialForm.sevType"
            dense
            square
            outlined
            emit-value
            map-options
            :label="gettext('AMD SEV Type')"
            :options="[
              { label: `${gettext('Default')} (${gettext('Disabled')})`, value: '__default__' },
              { label: 'AMD SEV', value: 'std' },
              { label: 'AMD SEV-ES', value: 'es' },
              { label: 'AMD SEV-SNP', value: 'snp' },
            ]"
          />
          <div v-if="confidentialForm.sevType !== '__default__'" class="q-gutter-sm">
            <q-checkbox
              v-model="confidentialForm.sevDebug"
              :label="gettext('Allow Debugging')"
            /><q-checkbox
              v-if="confidentialForm.sevType !== 'snp'"
              v-model="confidentialForm.sevKeySharing"
              :label="gettext('Allow Key-Sharing')"
            /><q-checkbox
              v-if="confidentialForm.sevType === 'snp'"
              v-model="confidentialForm.sevSmt"
              :label="gettext('Allow SMT')"
            /><q-checkbox
              v-model="confidentialForm.sevKernelHashes"
              :label="gettext('Enable Kernel Hashes')"
            />
          </div>
          <q-separator /><q-select
            v-model="confidentialForm.tdxType"
            dense
            square
            outlined
            emit-value
            map-options
            :label="gettext('Intel TDX Type')"
            :options="[
              { label: `${gettext('Default')} (${gettext('Disabled')})`, value: '__default__' },
              { label: 'Intel TDX', value: 'tdx' },
            ]"
          /><template v-if="confidentialForm.tdxType === 'tdx'"
            ><q-checkbox
              v-model="confidentialForm.tdxAttestation"
              :label="gettext('Enable Attestation')" />
            <div class="row q-col-gutter-md">
              <q-input
                v-model="confidentialForm.tdxCid"
                class="col-6"
                dense
                square
                outlined
                type="number"
                min="2"
                :disable="!confidentialForm.tdxAttestation"
                label="CID"
              /><q-input
                v-model="confidentialForm.tdxPort"
                class="col-6"
                dense
                square
                outlined
                type="number"
                min="0"
                :disable="!confidentialForm.tdxAttestation"
                :label="gettext('Port')"
              /></div
          ></template>
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Save')"
            @click="saveConfidentialComputing" /></template></UWindow
    ></q-dialog>
  </div>
</template>
