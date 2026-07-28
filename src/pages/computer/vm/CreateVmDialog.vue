<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { createVm, getNextVmId } from '@/api/vm';
import { getNodes, getPools, type PveNode, type PvePool } from '@/api/resources';
import { getNodeStorage } from '@/api/storageContent';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type DiskBus = 'scsi' | 'virtio' | 'sata' | 'ide';
type DiskSettings = {
  cache: string;
  discard: boolean;
  iothread: boolean;
  ssd: boolean;
  readOnly: boolean;
  backup: boolean;
  skipReplication: boolean;
  aio: string;
  mbpsRead: string;
  mbpsWrite: string;
  iopsRead: string;
  iopsWrite: string;
  mbpsReadMax: string;
  mbpsWriteMax: string;
  iopsReadMax: string;
  iopsWriteMax: string;
};
type ExtraDisk = DiskSettings & {
  id: number;
  bus: DiskBus;
  slot: number;
  storage: string;
  size: number;
};

function defaultDiskSettings(): DiskSettings {
  return {
    cache: '__default__',
    discard: false,
    iothread: false,
    ssd: false,
    readOnly: false,
    backup: true,
    skipReplication: false,
    aio: '__default__',
    mbpsRead: '',
    mbpsWrite: '',
    iopsRead: '',
    iopsWrite: '',
    mbpsReadMax: '',
    mbpsWriteMax: '',
    iopsReadMax: '',
    iopsWriteMax: '',
  };
}

const model = defineModel<boolean>({ required: true });
const emit = defineEmits<{
  completed: [];
  task: [payload: { node: string; upid: string; title: string }];
}>();

const loading = shallowRef(false);
const step = shallowRef('general');
const nodes = shallowRef<PveNode[]>([]);
const pools = shallowRef<PvePool[]>([]);
const storageNames = shallowRef<string[]>([]);
const nextExtraDiskId = shallowRef(1);
const extraDisks = reactive<ExtraDisk[]>([]);
const form = reactive({
  node: '',
  vmid: '',
  name: '',
  pool: '',
  haManaged: false,
  onboot: false,
  start: false,
  startupOrder: '',
  startupUp: '',
  startupDown: '',
  tags: '',
  arch: '__default__',
  ostype: 'l26',
  cdrom: '',
  virtioDriversCdrom: '',
  agent: false,
  bios: 'seabios',
  machine: 'i440fx',
  scsihw: 'virtio-scsi-pci',
  storage: '',
  diskSize: 32,
  ...defaultDiskSettings(),
  cores: 1,
  sockets: 1,
  cpu: '',
  vcpus: '',
  cpulimit: '',
  cpuunits: '',
  numa: false,
  memory: 2048,
  ballooning: true,
  balloon: 2048,
  noNetwork: false,
  bridge: 'vmbr0',
  model: 'virtio',
  vlanTag: '',
  firewall: true,
  macaddr: '',
  disconnect: false,
  rate: '',
  queues: '',
  mtu: '',
});

const steps = computed(() => [
  { name: 'general', title: gettext('General') },
  { name: 'os', title: gettext('OS') },
  { name: 'system', title: gettext('System') },
  { name: 'disks', title: gettext('Disks') },
  { name: 'cpu', title: gettext('CPU') },
  { name: 'memory', title: gettext('Memory') },
  { name: 'network', title: gettext('Network') },
  { name: 'confirm', title: gettext('Confirm') },
]);
const onlineNodes = computed(() => nodes.value.filter((node) => node.status === 'online'));
const osTypeOptions = computed(() =>
  form.arch === 'aarch64'
    ? [
        { label: gettext('Linux'), value: 'l26' },
        { label: gettext('Other'), value: 'other' },
      ]
    : [
        { label: gettext('Linux'), value: 'l26' },
        { label: gettext('Windows'), value: 'win11' },
        { label: gettext('Other'), value: 'other' },
      ],
);
const cdromDevice = computed(() => (form.arch === 'aarch64' ? 'scsi2' : 'ide2'));
const diskBusOptions = computed(() => [
  { label: 'SCSI', value: 'scsi' },
  { label: 'VirtIO', value: 'virtio' },
  { label: 'SATA', value: 'sata' },
  ...(form.arch === 'aarch64' ? [] : [{ label: 'IDE', value: 'ide' }]),
]);
const extraDisksValid = computed(() => {
  const keys = new Set(['scsi0']);
  return extraDisks.every((disk) => {
    const key = `${disk.bus}${disk.slot}`;
    if (!disk.storage.trim() || disk.size <= 0 || disk.slot < 0 || keys.has(key)) return false;
    keys.add(key);
    return true;
  });
});
function diskValue(storage: string, size: number, settings: DiskSettings, bus: DiskBus = 'scsi') {
  const parts = [`${storage.trim()}:${size}`];
  if (settings.cache !== '__default__') parts.push(`cache=${settings.cache}`);
  if (settings.discard) parts.push('discard=on');
  if (settings.iothread && (bus === 'scsi' || bus === 'virtio')) parts.push('iothread=on');
  if (settings.ssd && bus !== 'virtio') parts.push('ssd=on');
  if (settings.readOnly && (bus === 'scsi' || bus === 'virtio')) parts.push('ro=on');
  if (!settings.backup) parts.push('backup=0');
  if (settings.skipReplication) parts.push('replicate=no');
  if (settings.aio !== '__default__') parts.push(`aio=${settings.aio}`);
  const limits: Array<[string, string]> = [
    ['mbps_rd', settings.mbpsRead],
    ['mbps_wr', settings.mbpsWrite],
    ['iops_rd', settings.iopsRead],
    ['iops_wr', settings.iopsWrite],
    ['mbps_rd_max', settings.mbpsReadMax],
    ['mbps_wr_max', settings.mbpsWriteMax],
    ['iops_rd_max', settings.iopsReadMax],
    ['iops_wr_max', settings.iopsWriteMax],
  ];
  limits.forEach(([key, value]) => {
    if (value.trim()) parts.push(`${key}=${value.trim()}`);
  });
  return parts.join(',');
}
const extraDiskPayload = computed(() =>
  Object.fromEntries(
    extraDisks.map((disk) => [
      `${disk.bus}${disk.slot}`,
      diskValue(disk.storage, disk.size, disk, disk.bus),
    ]),
  ),
);
const canCreate = computed(() =>
  Boolean(
    form.node &&
    form.vmid &&
    form.storage &&
    form.diskSize > 0 &&
    extraDisksValid.value &&
    (form.noNetwork || form.bridge.trim()),
  ),
);
const startup = computed(() => {
  const values = [
    form.startupOrder.trim() ? `order=${form.startupOrder.trim()}` : '',
    form.startupUp.trim() ? `up=${form.startupUp.trim()}` : '',
    form.startupDown.trim() ? `down=${form.startupDown.trim()}` : '',
  ].filter(Boolean);
  return values.join(',');
});
const bootOrder = computed(() => {
  const devices = [
    form.cdrom.trim() ? cdromDevice.value : '',
    'scsi0',
    !form.noNetwork && form.bridge.trim() ? 'net0' : '',
  ].filter(Boolean);
  return `order=${devices.join(';')}`;
});
const networkValue = computed(() => {
  if (form.noNetwork) return '';
  const values = [form.model, `bridge=${form.bridge.trim()}`];
  if (form.vlanTag.trim()) values.push(`tag=${form.vlanTag.trim()}`);
  if (form.firewall) values.push('firewall=1');
  if (form.macaddr.trim()) values.push(`macaddr=${form.macaddr.trim()}`);
  if (form.disconnect) values.push('link_down=1');
  if (form.rate.trim()) values.push(`rate=${form.rate.trim()}`);
  if (form.queues.trim()) values.push(`queues=${form.queues.trim()}`);
  if (form.mtu.trim()) values.push(`mtu=${form.mtu.trim()}`);
  return values.join(',');
});
const summaryRows = computed(() => [
  [gettext('Node'), form.node],
  [gettext('VMID'), form.vmid],
  [gettext('Name'), form.name],
  [gettext('Pool'), form.pool || '-'],
  [gettext('Tags'), form.tags || '-'],
  [gettext('OS'), form.ostype],
  [gettext('CD-ROM Drive'), form.cdrom || '-'],
  ...(form.virtioDriversCdrom.trim()
    ? [[gettext('VirtIO Drivers CD'), form.virtioDriversCdrom]]
    : []),
  [gettext('System'), `${form.bios} / ${form.machine}`],
  [gettext('Disk'), `${form.storage}: ${form.diskSize} GiB`],
  ...(extraDisks.length
    ? [
        [
          gettext('Additional Disks'),
          extraDisks
            .map((disk) => `${disk.bus}${disk.slot}: ${disk.storage} ${disk.size} GiB`)
            .join(', '),
        ],
      ]
    : []),
  [gettext('CPU'), `${form.sockets} × ${form.cores}`],
  [
    gettext('Memory'),
    form.ballooning ? `${form.balloon} / ${form.memory} MiB` : `${form.memory} MiB`,
  ],
  [gettext('Network'), form.noNetwork ? gettext('None') : networkValue.value],
]);

async function loadStorage() {
  if (!form.node) {
    storageNames.value = [];
    form.storage = '';
    return;
  }
  const response = await getNodeStorage(form.node, 'images');
  storageNames.value = (response.data || [])
    .map((item) => textValue(item.storage))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  if (!storageNames.value.includes(form.storage)) form.storage = storageNames.value[0] || '';
}

async function initialize() {
  if (!model.value) return;
  loading.value = true;
  try {
    const [nodeResponse, poolResponse, nextIdResponse] = await Promise.all([
      getNodes(),
      getPools(),
      getNextVmId(),
    ]);
    nodes.value = (nodeResponse.data || []).sort((left, right) =>
      left.node.localeCompare(right.node),
    );
    pools.value = (poolResponse.data || []).sort((left, right) =>
      left.poolid.localeCompare(right.poolid),
    );
    form.node = onlineNodes.value[0]?.node || nodes.value[0]?.node || '';
    form.vmid = String(nextIdResponse.data || '');
    form.name = '';
    form.pool = '';
    form.haManaged = false;
    form.onboot = false;
    form.start = false;
    form.startupOrder = '';
    form.startupUp = '';
    form.startupDown = '';
    form.tags = '';
    form.arch = '__default__';
    form.ostype = 'l26';
    form.cdrom = '';
    form.virtioDriversCdrom = '';
    form.agent = false;
    form.bios = 'seabios';
    form.machine = 'i440fx';
    form.scsihw = 'virtio-scsi-pci';
    form.diskSize = 32;
    Object.assign(form, defaultDiskSettings());
    form.cores = 1;
    form.sockets = 1;
    form.cpu = '';
    form.vcpus = '';
    form.cpulimit = '';
    form.cpuunits = '';
    form.numa = false;
    form.memory = 2048;
    form.ballooning = true;
    form.balloon = 2048;
    form.noNetwork = false;
    form.bridge = 'vmbr0';
    form.model = 'virtio';
    form.vlanTag = '';
    form.firewall = true;
    form.macaddr = '';
    form.disconnect = false;
    form.rate = '';
    form.queues = '';
    form.mtu = '';
    extraDisks.splice(0, extraDisks.length);
    nextExtraDiskId.value = 1;
    applyOsDefaults();
    step.value = 'general';
    await loadStorage();
  } finally {
    loading.value = false;
  }
}

function applyOsDefaults() {
  const isArm = form.arch === 'aarch64';
  if (isArm && form.ostype.startsWith('win')) form.ostype = 'l26';
  const isWindows11 = form.ostype === 'win11';
  if (form.ostype === 'l26') {
    form.model = 'virtio';
    form.scsihw = 'virtio-scsi-single';
  } else {
    form.model = 'e1000';
    form.scsihw = 'virtio-scsi-single';
  }
  if (isWindows11 || isArm) {
    form.bios = 'ovmf';
    form.machine = isWindows11 ? 'q35' : 'virt';
  } else {
    form.bios = 'seabios';
    form.machine = 'i440fx';
  }
  if (isArm) form.cpu = 'neoverse-n2';
  else if (form.cpu === 'neoverse-n2') form.cpu = '';
}

async function submit() {
  if (!canCreate.value) return;
  loading.value = true;
  try {
    const response = await createVm(form.node, {
      vmid: form.vmid,
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
      ...(form.pool ? { pool: form.pool } : {}),
      ...(form.haManaged ? { 'ha-managed': 1 } : {}),
      ...(form.onboot ? { onboot: 1 } : {}),
      start: form.start ? 1 : 0,
      ...(startup.value ? { startup: startup.value } : {}),
      ...(form.tags.trim() ? { tags: form.tags.trim() } : {}),
      ...(form.arch !== '__default__' ? { arch: form.arch } : {}),
      ostype: form.ostype,
      ...(form.cdrom.trim()
        ? {
            [cdromDevice.value]: `${form.cdrom.trim()}${form.cdrom.includes('media=cdrom') ? '' : ',media=cdrom'}`,
          }
        : {}),
      ...(form.ostype.startsWith('win') && form.virtioDriversCdrom.trim()
        ? {
            ide0: `${form.virtioDriversCdrom.trim()}${form.virtioDriversCdrom.includes('media=cdrom') ? '' : ',media=cdrom'}`,
          }
        : {}),
      ...(form.agent ? { agent: 'enabled=1' } : {}),
      bios: form.bios,
      machine: form.machine,
      scsihw: form.scsihw,
      scsi0: diskValue(form.storage, form.diskSize, form),
      ...extraDiskPayload.value,
      boot: bootOrder.value,
      sockets: form.sockets,
      cores: form.cores,
      ...(form.cpu.trim() ? { cpu: form.cpu.trim() } : {}),
      ...(form.vcpus.trim() ? { vcpus: form.vcpus.trim() } : {}),
      ...(form.cpulimit.trim() ? { cpulimit: form.cpulimit.trim() } : {}),
      ...(form.cpuunits.trim() ? { cpuunits: form.cpuunits.trim() } : {}),
      ...(form.numa ? { numa: 1 } : {}),
      memory: form.memory,
      balloon: form.ballooning ? Math.min(form.memory, Math.max(1, form.balloon)) : 0,
      ...(networkValue.value ? { net0: networkValue.value } : {}),
    });
    model.value = false;
    emit('completed');
    if (response.data)
      emit('task', {
        node: form.node,
        upid: response.data,
        title: `${form.name}: ${gettext('Create')}`,
      });
  } finally {
    loading.value = false;
  }
}

function addExtraDisk() {
  const used = new Set(['scsi0', ...extraDisks.map((disk) => `${disk.bus}${disk.slot}`)]);
  let slot = 0;
  while (used.has(`scsi${slot}`)) slot += 1;
  extraDisks.push({
    id: nextExtraDiskId.value,
    bus: 'scsi',
    slot,
    storage: form.storage,
    size: 32,
    ...defaultDiskSettings(),
  });
  nextExtraDiskId.value += 1;
}

function removeExtraDisk(id: number) {
  const index = extraDisks.findIndex((disk) => disk.id === id);
  if (index >= 0) extraDisks.splice(index, 1);
}

function moveStep(offset: number) {
  const index = steps.value.findIndex((item) => item.name === step.value);
  step.value = steps.value[index + offset]?.name || step.value;
}

watch(model, (visible) => {
  if (visible) void initialize();
});
watch(
  () => form.node,
  () => {
    if (model.value) void loadStorage();
  },
);
watch([() => form.ostype, () => form.arch], applyOsDefaults);
watch(
  () => form.arch,
  (arch) => {
    if (arch === 'aarch64')
      extraDisks.forEach((disk) => {
        if (disk.bus === 'ide') disk.bus = 'scsi';
      });
  },
);
</script>

<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Create Virtual Machine')" width="780px" :loading="loading">
      <div class="q-pa-md u-hidden-error">
        <q-stepper v-model="step" flat animated color="primary" class="vm-create-stepper">
          <q-step
            v-for="item in steps"
            :key="item.name"
            :name="item.name"
            :title="item.title"
            :done="
              steps.findIndex((stepItem) => stepItem.name === step) >
              steps.findIndex((stepItem) => stepItem.name === item.name)
            "
          >
            <div v-if="item.name === 'general'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.node"
                  dense
                  outlined
                  square
                  options-dense
                  emit-value
                  map-options
                  :options="onlineNodes.map((node) => ({ label: node.node, value: node.node }))"
                  :label="gettext('Node')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="form.vmid" dense outlined square :label="gettext('VMID')" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="form.name" dense outlined square :label="gettext('Name')" />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.pool"
                  dense
                  outlined
                  square
                  clearable
                  options-dense
                  emit-value
                  map-options
                  :options="pools.map((pool) => ({ label: pool.poolid, value: pool.poolid }))"
                  :label="gettext('Pool')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-checkbox
                  v-model="form.haManaged"
                  dense
                  color="primary"
                  :label="gettext('Add to HA')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-checkbox
                  v-model="form.onboot"
                  dense
                  color="primary"
                  :label="gettext('Start at boot')"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.startupOrder"
                  dense
                  outlined
                  square
                  :label="gettext('Start/Shutdown order')"
                  hint="any"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.startupUp"
                  dense
                  outlined
                  square
                  :label="gettext('Startup delay')"
                  hint="seconds"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.startupDown"
                  dense
                  outlined
                  square
                  :label="gettext('Shutdown timeout')"
                  hint="seconds"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.tags"
                  dense
                  outlined
                  square
                  :label="gettext('Tags')"
                  hint="tag1;tag2"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.arch"
                  dense
                  outlined
                  square
                  emit-value
                  map-options
                  :options="[
                    { label: gettext('Default'), value: '__default__' },
                    { label: 'x86_64', value: 'x86_64' },
                    { label: 'aarch64', value: 'aarch64' },
                  ]"
                  :label="gettext('vCPU Architecture')"
                />
              </div>
            </div>
            <div v-else-if="item.name === 'os'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.ostype"
                  dense
                  outlined
                  square
                  options-dense
                  emit-value
                  map-options
                  :options="osTypeOptions"
                  :label="gettext('OS Type')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.cdrom"
                  dense
                  outlined
                  square
                  :label="gettext('ISO image or volume')"
                  hint="local:iso/example.iso"
                />
              </div>
              <div v-if="form.ostype.startsWith('win')" class="col-12">
                <q-input
                  v-model="form.virtioDriversCdrom"
                  dense
                  outlined
                  square
                  :label="gettext('VirtIO Drivers ISO image')"
                  hint="local:iso/virtio-win.iso"
                />
              </div>
            </div>
            <div v-else-if="item.name === 'system'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
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
              <div class="col-12 col-sm-6">
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
                    { label: 'virt', value: 'virt' },
                  ]"
                  :label="gettext('Machine')"
                />
              </div>
              <div class="col-12">
                <q-checkbox
                  v-model="form.agent"
                  dense
                  color="primary"
                  :label="gettext('QEMU Guest Agent')"
                />
              </div>
            </div>
            <div v-else-if="item.name === 'disks'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-4">
                <q-select
                  v-model="form.storage"
                  dense
                  outlined
                  square
                  options-dense
                  :options="storageNames"
                  :label="gettext('Storage')"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model.number="form.diskSize"
                  dense
                  outlined
                  square
                  type="number"
                  min="1"
                  :label="gettext('Disk Size (GiB)')"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-select
                  v-model="form.scsihw"
                  dense
                  outlined
                  square
                  options-dense
                  :options="
                    form.arch === 'aarch64'
                      ? ['virtio-scsi-pci', 'virtio-scsi-single']
                      : ['virtio-scsi-pci', 'virtio-scsi-single', 'lsi', 'megasas', 'pvscsi']
                  "
                  :label="gettext('SCSI Controller')"
                />
              </div>
              <div class="col-12">
                <q-expansion-item
                  dense
                  dense-toggle
                  expand-separator
                  :label="gettext('Advanced disk options')"
                  ><div class="row q-col-gutter-sm q-pa-sm">
                    <div class="col-6 col-sm-3">
                      <q-select
                        v-model="form.cache"
                        dense
                        outlined
                        square
                        emit-value
                        map-options
                        :label="gettext('Cache')"
                        :options="[
                          { label: gettext('Default'), value: '__default__' },
                          { label: 'No cache', value: 'none' },
                          { label: 'Write through', value: 'writethrough' },
                          { label: 'Write back', value: 'writeback' },
                          { label: 'Direct sync', value: 'directsync' },
                          { label: 'Unsafe', value: 'unsafe' },
                        ]"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-select
                        v-model="form.aio"
                        dense
                        outlined
                        square
                        emit-value
                        map-options
                        :label="gettext('Async IO')"
                        :options="[
                          { label: gettext('Default (io_uring)'), value: '__default__' },
                          { label: 'io_uring', value: 'io_uring' },
                          { label: 'native', value: 'native' },
                          { label: 'threads', value: 'threads' },
                        ]"
                      />
                    </div>
                    <div class="col-12 col-sm-6">
                      <q-checkbox
                        v-model="form.discard"
                        dense
                        :label="gettext('Discard')"
                      /><q-checkbox
                        v-model="form.iothread"
                        dense
                        class="q-ml-sm"
                        label="IO thread"
                      /><q-checkbox
                        v-model="form.ssd"
                        dense
                        class="q-ml-sm"
                        :label="gettext('SSD emulation')"
                      /><q-checkbox
                        v-model="form.readOnly"
                        dense
                        class="q-ml-sm"
                        :label="gettext('Read-only')"
                      /><q-checkbox
                        v-model="form.backup"
                        dense
                        class="q-ml-sm"
                        :label="gettext('Backup')"
                      /><q-checkbox
                        v-model="form.skipReplication"
                        dense
                        class="q-ml-sm"
                        :label="gettext('Skip replication')"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.mbpsRead"
                        dense
                        outlined
                        square
                        type="number"
                        min="1"
                        :label="`${gettext('Read limit')} (MB/s)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.mbpsWrite"
                        dense
                        outlined
                        square
                        type="number"
                        min="1"
                        :label="`${gettext('Write limit')} (MB/s)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.iopsRead"
                        dense
                        outlined
                        square
                        type="number"
                        min="10"
                        :label="`${gettext('Read limit')} (ops/s)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.iopsWrite"
                        dense
                        outlined
                        square
                        type="number"
                        min="10"
                        :label="`${gettext('Write limit')} (ops/s)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.mbpsReadMax"
                        dense
                        outlined
                        square
                        type="number"
                        min="1"
                        :label="`${gettext('Read max burst')} (MB)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.mbpsWriteMax"
                        dense
                        outlined
                        square
                        type="number"
                        min="1"
                        :label="`${gettext('Write max burst')} (MB)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.iopsReadMax"
                        dense
                        outlined
                        square
                        type="number"
                        min="10"
                        :label="`${gettext('Read max burst')} (ops)`"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model="form.iopsWriteMax"
                        dense
                        outlined
                        square
                        type="number"
                        min="10"
                        :label="`${gettext('Write max burst')} (ops)`"
                      />
                    </div></div
                ></q-expansion-item>
              </div>
              <template v-for="disk in extraDisks" :key="disk.id"
                ><div class="col-12"><q-separator /></div>
                <div class="col-12 col-sm-3">
                  <q-select
                    v-model="disk.bus"
                    dense
                    outlined
                    square
                    options-dense
                    emit-value
                    map-options
                    :options="diskBusOptions"
                    :label="gettext('Bus')"
                  />
                </div>
                <div class="col-12 col-sm-2">
                  <q-input
                    v-model.number="disk.slot"
                    dense
                    outlined
                    square
                    type="number"
                    min="0"
                    :label="gettext('Slot')"
                  />
                </div>
                <div class="col-12 col-sm-3">
                  <q-select
                    v-model="disk.storage"
                    dense
                    outlined
                    square
                    options-dense
                    :options="storageNames"
                    :label="gettext('Storage')"
                  />
                </div>
                <div class="col-12 col-sm-3">
                  <q-input
                    v-model.number="disk.size"
                    dense
                    outlined
                    square
                    type="number"
                    min="1"
                    :label="gettext('Disk Size (GiB)')"
                  />
                </div>
                <div class="col-12 col-sm-1 row items-center">
                  <q-btn
                    dense
                    flat
                    round
                    color="negative"
                    icon="delete"
                    :aria-label="gettext('Remove')"
                    @click="removeExtraDisk(disk.id)"
                  />
                </div>
                <div class="col-12">
                  <q-expansion-item dense dense-toggle :label="gettext('Advanced disk options')"
                    ><div class="row q-col-gutter-sm q-pa-sm">
                      <div class="col-6 col-sm-3">
                        <q-select
                          v-model="disk.cache"
                          dense
                          outlined
                          square
                          emit-value
                          map-options
                          :label="gettext('Cache')"
                          :options="[
                            { label: gettext('Default'), value: '__default__' },
                            { label: 'No cache', value: 'none' },
                            { label: 'Write through', value: 'writethrough' },
                            { label: 'Write back', value: 'writeback' },
                            { label: 'Direct sync', value: 'directsync' },
                            { label: 'Unsafe', value: 'unsafe' },
                          ]"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-select
                          v-model="disk.aio"
                          dense
                          outlined
                          square
                          emit-value
                          map-options
                          :label="gettext('Async IO')"
                          :options="[
                            { label: gettext('Default (io_uring)'), value: '__default__' },
                            { label: 'io_uring', value: 'io_uring' },
                            { label: 'native', value: 'native' },
                            { label: 'threads', value: 'threads' },
                          ]"
                        />
                      </div>
                      <div class="col-12 col-sm-6">
                        <q-checkbox
                          v-model="disk.discard"
                          dense
                          :label="gettext('Discard')"
                        /><q-checkbox
                          v-model="disk.iothread"
                          dense
                          class="q-ml-sm"
                          label="IO thread"
                        /><q-checkbox
                          v-model="disk.ssd"
                          dense
                          class="q-ml-sm"
                          :label="gettext('SSD emulation')"
                        /><q-checkbox
                          v-model="disk.readOnly"
                          dense
                          class="q-ml-sm"
                          :label="gettext('Read-only')"
                        /><q-checkbox
                          v-model="disk.backup"
                          dense
                          class="q-ml-sm"
                          :label="gettext('Backup')"
                        /><q-checkbox
                          v-model="disk.skipReplication"
                          dense
                          class="q-ml-sm"
                          :label="gettext('Skip replication')"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.mbpsRead"
                          dense
                          outlined
                          square
                          type="number"
                          min="1"
                          :label="`${gettext('Read limit')} (MB/s)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.mbpsWrite"
                          dense
                          outlined
                          square
                          type="number"
                          min="1"
                          :label="`${gettext('Write limit')} (MB/s)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.iopsRead"
                          dense
                          outlined
                          square
                          type="number"
                          min="10"
                          :label="`${gettext('Read limit')} (ops/s)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.iopsWrite"
                          dense
                          outlined
                          square
                          type="number"
                          min="10"
                          :label="`${gettext('Write limit')} (ops/s)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.mbpsReadMax"
                          dense
                          outlined
                          square
                          type="number"
                          min="1"
                          :label="`${gettext('Read max burst')} (MB)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.mbpsWriteMax"
                          dense
                          outlined
                          square
                          type="number"
                          min="1"
                          :label="`${gettext('Write max burst')} (MB)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.iopsReadMax"
                          dense
                          outlined
                          square
                          type="number"
                          min="10"
                          :label="`${gettext('Read max burst')} (ops)`"
                        />
                      </div>
                      <div class="col-6 col-sm-3">
                        <q-input
                          v-model="disk.iopsWriteMax"
                          dense
                          outlined
                          square
                          type="number"
                          min="10"
                          :label="`${gettext('Write max burst')} (ops)`"
                        />
                      </div></div
                  ></q-expansion-item></div
              ></template>
              <div class="col-12">
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button"
                  :label="gettext('Add Disk')"
                  @click="addExtraDisk"
                />
              </div>
            </div>
            <div v-else-if="item.name === 'cpu'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
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
              <div class="col-12 col-sm-6">
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
              <div class="col-12 col-sm-4">
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
              <div class="col-12 col-sm-4">
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
              <div class="col-12 col-sm-4">
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
              <div class="col-12">
                <q-checkbox
                  v-model="form.numa"
                  dense
                  color="primary"
                  :label="gettext('Enable NUMA')"
                />
              </div>
            </div>
            <div v-else-if="item.name === 'memory'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
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
              <div class="col-12 col-sm-6">
                <q-checkbox
                  v-model="form.ballooning"
                  dense
                  color="primary"
                  :label="gettext('Ballooning Device')"
                />
              </div>
              <div v-if="form.ballooning" class="col-12 col-sm-6">
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
            </div>
            <div v-else-if="item.name === 'network'" class="row q-col-gutter-md">
              <div class="col-12">
                <q-checkbox
                  v-model="form.noNetwork"
                  dense
                  color="primary"
                  :label="gettext('No network device')"
                />
              </div>
              <template v-if="!form.noNetwork"
                ><div class="col-12 col-sm-6">
                  <q-select
                    v-model="form.model"
                    dense
                    outlined
                    square
                    options-dense
                    :options="['virtio', 'e1000', 'rtl8139', 'vmxnet3']"
                    :label="gettext('Model')"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input v-model="form.bridge" dense outlined square :label="gettext('Bridge')" />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="form.vlanTag"
                    dense
                    outlined
                    square
                    type="number"
                    min="1"
                    max="4094"
                    :label="gettext('VLAN Tag')"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="form.macaddr"
                    dense
                    outlined
                    square
                    :label="gettext('MAC address')"
                    hint="auto"
                  />
                </div>
                <div class="col-12">
                  <q-checkbox
                    v-model="form.firewall"
                    dense
                    color="primary"
                    :label="gettext('Firewall')"
                  /><q-checkbox
                    v-model="form.disconnect"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :label="gettext('Disconnect')"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model="form.rate"
                    dense
                    outlined
                    square
                    type="number"
                    min="0"
                    :label="`${gettext('Rate limit')} (MB/s)`"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model="form.queues"
                    dense
                    outlined
                    square
                    type="number"
                    min="1"
                    max="64"
                    label="Multiqueue"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model="form.mtu"
                    dense
                    outlined
                    square
                    type="number"
                    min="1"
                    max="65520"
                    label="MTU"
                  /></div
              ></template>
            </div>
            <q-markup-table v-else flat bordered dense class="vm-create-summary"
              ><tbody>
                <tr v-for="row in summaryRows" :key="row[0]">
                  <td>{{ row[0] }}</td>
                  <td>{{ row[1] }}</td>
                </tr>
              </tbody></q-markup-table
            >
            <q-stepper-navigation
              ><q-btn
                v-if="item.name !== 'confirm'"
                no-caps
                flat
                size="12px"
                class="bg-primary text-grey-1 u-button"
                :label="gettext('Next')"
                @click="moveStep(1)" />
              <div v-else class="row items-center q-gutter-sm">
                <q-checkbox
                  v-model="form.start"
                  dense
                  color="primary"
                  :label="gettext('Start after created')"
                /><q-btn
                  no-caps
                  flat
                  size="12px"
                  class="bg-primary text-grey-1 u-button"
                  :disable="!canCreate"
                  :loading="loading"
                  :label="gettext('Create')"
                  @click="submit"
                />
              </div>
              <q-btn
                v-if="item.name !== 'general'"
                no-caps
                flat
                size="12px"
                class="u-button q-ml-sm"
                :label="gettext('Back')"
                @click="moveStep(-1)"
            /></q-stepper-navigation>
          </q-step>
        </q-stepper>
      </div>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button"
          :disable="loading"
          :label="gettext('Cancel')"
      /></template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.vm-create-stepper :deep(.q-stepper__header) {
  box-shadow: none;
  border-bottom: 1px solid #dfe1e6;
}
.vm-create-stepper :deep(.q-stepper__tab) {
  min-height: 48px;
  padding: 8px;
}
.vm-create-summary td:first-child {
  width: 180px;
  color: #666666;
}
</style>
