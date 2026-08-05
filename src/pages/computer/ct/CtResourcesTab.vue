<script setup lang="ts">
import { Dialog } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { getVmConfig, getVmPendingConfig, revertVmConfig, updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { getNodeStorage, getVmResources } from '@/api/storageContent';
import { moveCtVolume, reassignCtVolume, resizeCtVolume } from '@/api/vm';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const selectedKey = shallowRef('memory');
const mountExtras = shallowRef<Record<string, string>>({});
const cpuAdvanced = shallowRef(false);
const mountAdvanced = shallowRef(false);
const addVisible = shallowRef(false);
const addKind = shallowRef<'mount' | 'device'>('mount');
const moveVisible = shallowRef(false);
const resizeVisible = shallowRef(false);
const reassignVisible = shallowRef(false);
const addAdvanced = shallowRef(false);
const storages = shallowRef<string[]>([]);
const ctTargets = shallowRef<PveRecord[]>([]);
const targetCtConfig = shallowRef<PveRecord>({});
const pendingRows = shallowRef<PveRecord[]>([]);
const addForm = reactive({ mpid: 0, storage: '', size: 8, mountPath: '', backup: true, quota: false, readOnly: false, mountOptions: [] as string[], acl: '__default__', skipReplication: false, keepAttrs: false, deviceId: 0, devicePath: '', uid: '', gid: '', mode: '', denyWrite: false });
const moveForm = reactive({ storage: '', deleteSource: false });
const resizeSize = shallowRef('');
const reassignForm = reactive({ targetVmid: '', targetType: 'mp', targetId: 0 });
const form = reactive({
  memory: 512,
  swap: 512,
  cores: 0,
  cpulimit: 0,
  cpuunits: 100,
  volume: '',
  mountPath: '',
  backup: true,
  quota: false,
  readOnly: false,
  mountOptions: [] as string[],
  acl: '__default__',
  skipReplication: false,
  keepAttrs: false,
  devicePath: '',
  uid: '',
  gid: '',
  mode: '',
  denyWrite: false,
});

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const rows = computed(() => {
  const config = props.config;
  const cpuLimit = numberValue(config.cpulimit, 0);
  const cpuUnits = numberValue(config.cpuunits, 0);
  const cores = numberValue(config.cores, 0);
  const cpuDetails = [String(cores || gettext('unlimited'))];
  if (cpuLimit) cpuDetails.push(`[cpulimit=${cpuLimit}]`);
  if (cpuUnits) cpuDetails.push(`[cpuunits=${cpuUnits}]`);
  const mountPoints = Object.keys(config)
    .filter((key) => /^(mp|unused)\d+$/.test(key))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((key) => ({
      key,
      icon: 'storage',
      name: key.startsWith('mp')
        ? `${gettext('Mount Point')} (${key})`
        : `${gettext('Unused Disk')} ${key.replace('unused', '')}`,
      value: textValue(config[key]) || '-',
    }));
  const devices = Object.keys(config)
    .filter((key) => /^dev\d+$/.test(key))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((key) => ({
      key,
      icon: 'settings_input_component',
      name: `${gettext('Device')} (${key})`,
      value: textValue(config[key]) || '-',
    }));

  return [
    { key: 'memory', icon: 'memory', name: gettext('Memory'), value: `${numberValue(config.memory, 512)} MiB` },
    { key: 'swap', icon: 'swap_horiz', name: gettext('Swap'), value: `${numberValue(config.swap, 512)} MiB` },
    { key: 'cores', icon: 'developer_board', name: gettext('Cores'), value: cpuDetails.join(' ') },
    { key: 'rootfs', icon: 'storage', name: gettext('Root Disk'), value: textValue(config.rootfs) || gettext('None') },
    ...mountPoints,
    ...devices,
  ];
});
const selectedRow = computed(() => rows.value.find((row) => row.key === selectedKey.value));
const isMemoryEditor = computed(() => ['memory', 'swap'].includes(selectedKey.value));
const isCpuEditor = computed(() => selectedKey.value === 'cores');
const isMountEditor = computed(() => selectedKey.value === 'rootfs' || /^mp\d+$/.test(selectedKey.value));
const isDeviceEditor = computed(() => /^dev\d+$/.test(selectedKey.value));
const isDisk = computed(() => selectedKey.value === 'rootfs' || /^(mp|unused)\d+$/.test(selectedKey.value));
const isUsedVolume = computed(() => selectedKey.value === 'rootfs' || /^mp\d+$/.test(selectedKey.value));
const canDetach = computed(() => canEditDisk.value && /^mp\d+$/.test(selectedKey.value) && !hasPendingChange(selectedKey.value));
const canRevert = computed(() => Boolean(selectedKey.value && hasPendingChange(selectedKey.value)));
const pendingByKey = computed<Record<string, PveRecord>>(() => Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row])));
const canEditMemory = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Memory']),
);
const canEditCpu = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.CPU']),
);
const canEditDisk = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Disk']),
);
const canEditDevice = computed(() => session.userid === 'root@pam');

function parsePropertyString(value: unknown, defaultKey: string) {
  const result: Record<string, string> = {};
  textValue(value)
    .split(',')
    .filter(Boolean)
    .forEach((part) => {
      const [key, optionValue] = part.split('=', 2);
      if (!key) return;
      if (optionValue === undefined) result[defaultKey] = key;
      else result[key] = optionValue;
    });
  return result;
}

function printPropertyString(values: Record<string, string | boolean>, defaultKey: string) {
  const parts = values[defaultKey] ? [String(values[defaultKey])] : [];
  Object.entries(values).forEach(([key, value]) => {
    if (key === defaultKey || value === '' || value === false || value === '__default__') return;
    parts.push(`${key}=${value === true ? 1 : value}`);
  });
  return parts.join(',');
}

function nextFreeKey(prefix: 'mp' | 'dev') {
  let index = 0;
  while (props.config[`${prefix}${index}`] !== undefined) index += 1;
  return index;
}

function hasPendingChange(key: string) {
  const pending = pendingByKey.value[key];
  if (!pending) return false;
  if (pending.delete) return true;
  const value = textValue(pending.pending);
  return value !== '' && value !== textValue(props.config[key]);
}

async function loadPending() {
  const response = await getVmPendingConfig(props.node, props.vmid, 'lxc');
  pendingRows.value = response.data || [];
}

async function loadRootdirStorages() {
  const response = await getNodeStorage(props.node, 'rootdir');
  storages.value = (response.data || []).map((item) => textValue(item.storage)).filter(Boolean);
  addForm.storage = storages.value[0] || '';
  moveForm.storage = storages.value[0] || '';
}

function openAdd(kind: 'mount' | 'device') {
  addKind.value = kind;
  addAdvanced.value = false;
  addForm.mpid = nextFreeKey('mp');
  addForm.deviceId = nextFreeKey('dev');
  addForm.size = 8;
  addForm.mountPath = '';
  addForm.devicePath = '';
  addForm.quota = false;
  addForm.readOnly = false;
  addForm.mountOptions = [];
  addForm.acl = '__default__';
  addForm.skipReplication = false;
  addForm.keepAttrs = false;
  addForm.uid = '';
  addForm.gid = '';
  addForm.mode = '';
  addForm.denyWrite = false;
  if (kind === 'mount') void loadRootdirStorages();
  addVisible.value = true;
}

async function createResource() {
  if (addKind.value === 'mount') {
    if (!canEditDisk.value || !addForm.storage || !addForm.mountPath || addForm.size <= 0) return;
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      [`mp${addForm.mpid}`]: printPropertyString({ volume: `${addForm.storage}:${addForm.size}`, mp: addForm.mountPath, backup: addForm.backup ? '1' : '0', quota: addForm.quota ? '1' : '0', ro: addForm.readOnly ? '1' : '0', mountoptions: addForm.mountOptions.join(';'), acl: addForm.acl, replicate: addForm.skipReplication ? '0' : '', keepattrs: addForm.keepAttrs }, 'volume'),
    }, 'lxc');
  } else {
    if (!canEditDevice.value || !addForm.devicePath) return;
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      [`dev${addForm.deviceId}`]: printPropertyString({ path: addForm.devicePath, uid: addForm.uid, gid: addForm.gid, mode: addForm.mode, 'deny-write': addForm.denyWrite }, 'path'),
    }, 'lxc');
  }
  addVisible.value = false;
  emit('updated');
}

function detachSelected() {
  if (!canDetach.value) return;
  const key = selectedKey.value;
  Dialog.create({ title: gettext('Detach'), message: gettext('Are you sure you want to detach entry {0}').replace('{0}', selectedRow.value?.name || key), cancel: true, persistent: true })
    .onOk(() => {
      loading.value = true;
      void updateVmConfig(props.node, props.vmid, { digest: props.config.digest, delete: key }, 'lxc')
        .then(() => emit('updated'))
        .finally(() => { loading.value = false; });
    });
}

function openMove() {
  if (!isUsedVolume.value || !canEditDisk.value) return;
  void loadRootdirStorages();
  moveForm.deleteSource = false;
  moveVisible.value = true;
}

async function moveVolume() {
  if (!isUsedVolume.value || !moveForm.storage) return;
  loading.value = true;
  try {
    await moveCtVolume(props.node, props.vmid, { volume: selectedKey.value, storage: moveForm.storage, delete: moveForm.deleteSource ? 1 : 0 });
    moveVisible.value = false;
    emit('updated');
  } finally { loading.value = false; }
}

function openResize() {
  if (!isUsedVolume.value || !canEditDisk.value) return;
  resizeSize.value = '';
  resizeVisible.value = true;
}

async function resizeVolume() {
  if (!isUsedVolume.value || !resizeSize.value || Number(resizeSize.value) <= 0) return;
  loading.value = true;
  try {
    await resizeCtVolume(props.node, props.vmid, selectedKey.value, `+${resizeSize.value}G`);
    resizeVisible.value = false;
    emit('updated');
  } finally { loading.value = false; }
}

async function openReassign() {
  if (!isDisk.value || selectedKey.value === 'rootfs' || !canEditDisk.value) return;
  const response = await getVmResources();
  ctTargets.value = (response.data || []).filter((item) => textValue(item.type) === 'lxc' && textValue(item.node) === props.node && textValue(item.vmid) !== props.vmid && !item.template);
  reassignForm.targetVmid = textValue(ctTargets.value[0]?.vmid);
  reassignForm.targetType = /^unused\d+$/.test(selectedKey.value) ? 'unused' : 'mp';
  reassignForm.targetId = 0;
  reassignVisible.value = true;
}

async function reassignVolume() {
  if (!reassignForm.targetVmid) return;
  loading.value = true;
  try {
    await reassignCtVolume(props.node, props.vmid, { volume: selectedKey.value, 'target-vmid': reassignForm.targetVmid, 'target-volume': `${reassignForm.targetType}${reassignForm.targetId}` });
    reassignVisible.value = false;
    emit('updated');
  } finally { loading.value = false; }
}

async function revertSelected() {
  if (!canRevert.value) return;
  loading.value = true;
  try {
    await revertVmConfig(props.node, props.vmid, [selectedKey.value], 'lxc');
    await loadPending();
    emit('updated');
  } finally { loading.value = false; }
}

watch(
  () => [props.config.memory, props.config.swap],
  () => {
    form.memory = numberValue(props.config.memory, 512);
    form.swap = numberValue(props.config.swap, form.memory);
  },
  { immediate: true },
);

watch(() => [props.node, props.vmid, textValue(props.config.digest)], () => { void loadPending(); }, { immediate: true });

watch(
  () => [reassignForm.targetVmid, reassignForm.targetType] as const,
  async ([targetVmid, targetType]) => {
    if (!targetVmid) { targetCtConfig.value = {}; return; }
    const response = await getVmConfig(props.node, targetVmid, 'lxc');
    targetCtConfig.value = response.data || {};
    let index = 0;
    while (targetCtConfig.value[`${targetType}${index}`] !== undefined) index += 1;
    reassignForm.targetId = index;
  },
);

watch(
  selectedRow,
  (row) => {
    if (!row) return;
    form.cores = numberValue(props.config.cores, 0);
    form.cpulimit = numberValue(props.config.cpulimit, 0);
    form.cpuunits = numberValue(props.config.cpuunits, 100);
    if (row.key === 'rootfs' || /^mp\d+$/.test(row.key)) {
      const mount = parsePropertyString(props.config[row.key], 'volume');
      form.volume = mount.volume || '';
      form.mountPath = mount.mp || '';
      form.backup = mount.backup !== '0';
      form.quota = mount.quota === '1';
      form.readOnly = mount.ro === '1';
      form.mountOptions = mount.mountoptions ? mount.mountoptions.split(';').filter(Boolean) : [];
      form.acl = mount.acl || '__default__';
      form.skipReplication = mount.replicate === '0';
      form.keepAttrs = mount.keepattrs === '1';
      mountExtras.value = Object.fromEntries(
        Object.entries(mount).filter(
          ([key]) => !['volume', 'mp', 'backup', 'quota', 'ro', 'mountoptions', 'acl', 'replicate', 'keepattrs'].includes(key),
        ),
      );
    }
    if (/^dev\d+$/.test(row.key)) {
      const device = parsePropertyString(props.config[row.key], 'path');
      form.devicePath = device.path || '';
      form.uid = device.uid || '';
      form.gid = device.gid || '';
      form.mode = device.mode || '';
      form.denyWrite = device['deny-write'] === '1';
    }
  },
  { immediate: true },
);

async function saveMemory() {
  if (!canEditMemory.value) return;
  loading.value = true;
  try {
    await updateVmConfig(
      props.node,
      props.vmid,
      { digest: props.config.digest, memory: form.memory, swap: form.swap },
      'lxc',
    );
    emit('updated');
  } finally {
    loading.value = false;
  }
}

async function saveCpu() {
  if (!canEditCpu.value) return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      cores: form.cores || '',
      cpulimit: form.cpulimit || '',
      cpuunits: form.cpuunits || '',
    }, 'lxc');
    emit('updated');
  } finally {
    loading.value = false;
  }
}

async function saveMount() {
  const key = selectedKey.value;
  if (!canEditDisk.value || !isMountEditor.value) return;
  const data = printPropertyString({
    ...mountExtras.value,
    volume: form.volume,
    ...(key === 'rootfs' ? {} : { mp: form.mountPath, backup: form.backup ? '1' : '0' }),
    quota: form.quota ? '1' : '0',
    ro: form.readOnly ? '1' : '0',
    mountoptions: form.mountOptions.join(';'),
    acl: form.acl,
    replicate: form.skipReplication ? '0' : '',
    keepattrs: form.keepAttrs,
  }, 'volume');
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, { digest: props.config.digest, [key]: data }, 'lxc');
    emit('updated');
  } finally {
    loading.value = false;
  }
}

async function saveDevice() {
  const key = selectedKey.value;
  if (!canEditDevice.value || !isDeviceEditor.value) return;
  const data = printPropertyString({
    path: form.devicePath,
    uid: form.uid,
    gid: form.gid,
    mode: form.mode,
    'deny-write': form.denyWrite,
  }, 'path');
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, { digest: props.config.digest, [key]: data }, 'lxc');
    emit('updated');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="ct-resources-tab vm-config-legacy">
    <div class="resource-toolbar row q-gutter-sm q-py-sm">
      <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')">
          <q-list>
            <q-item v-close-popup clickable :disable="!canEditDisk" @click="openAdd('mount')"><q-item-section avatar><q-icon name="storage" /></q-item-section><q-item-section>{{ gettext('Mount Point') }}</q-item-section></q-item>
            <q-item v-close-popup clickable :disable="!canEditDevice" @click="openAdd('device')"><q-item-section avatar><q-icon name="settings_input_component" /></q-item-section><q-item-section>{{ gettext('Device Passthrough') }}</q-item-section></q-item>
          </q-list>
      </q-btn-dropdown>
      <q-btn no-caps outline size="12px" color="negative" class="u-button" :disable="!canDetach" :label="gettext('Detach')" @click="detachSelected" />
      <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :disable="!isDisk || !canEditDisk" :label="gettext('Volume Action')">
          <q-list>
            <q-item v-close-popup clickable :disable="!isUsedVolume" @click="openMove"><q-item-section>{{ gettext('Move Storage') }}</q-item-section></q-item>
            <q-item v-close-popup clickable :disable="selectedKey === 'rootfs'" @click="openReassign"><q-item-section>{{ gettext('Reassign Owner') }}</q-item-section></q-item>
            <q-item v-close-popup clickable :disable="!isUsedVolume" @click="openResize"><q-item-section>{{ gettext('Resize') }}</q-item-section></q-item>
          </q-list>
      </q-btn-dropdown>
      <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!canRevert" :loading="loading" :label="gettext('Revert')" @click="revertSelected" />
    </div>
    <div class="row items-stretch">
      <div class="col-7 resource-list-column">
        <div class="u-border q-pa-sm resource-list-panel">
        <div class="resource-list">
          <div
            v-for="row in rows"
            :key="row.key"
            class="cursor-pointer q-px-sm row resource-list-row"
            :class="{ 'bg-blue-2': selectedKey === row.key }"
            @click="selectedKey = row.key"
          >
            <div class="col-4 text-grey-10 resource-list-label"><q-icon :name="row.icon" size="16px" class="q-mr-xs resource-list__icon" />{{ row.name }}:</div>
            <div class="col-8 text-grey-8 resource-list-value">{{ row.value }}</div>
          </div>
        </div>
        </div>
      </div>
      <div class="col-5 resource-editor-column">
        <div class="u-border resource-editor">
          <template v-if="selectedRow">
            <div class="q-pa-sm resource-editor__content">
            <div class="row items-center no-wrap editor-titlebar"><div class="editor-title text-grey-10">{{ selectedRow.name }}</div></div>
            <div v-if="isMemoryEditor" class="resource-editor__body">
              <q-input v-model.number="form.memory" dense type="number" min="16" step="32" :label="gettext('Memory (MiB)')" />
              <q-input v-model.number="form.swap" dense type="number" min="0" step="32" :label="gettext('Swap (MiB)')" />
            </div>
            <div v-else-if="isCpuEditor" class="resource-editor__body">
              <q-input v-model.number="form.cores" dense type="number" min="1" max="8192" :label="gettext('Cores')" :placeholder="gettext('unlimited')" />
              <template v-if="cpuAdvanced">
                <q-input v-model.number="form.cpulimit" dense type="number" min="0" step="1" :label="gettext('CPU limit')" :placeholder="gettext('unlimited')" />
                <q-input v-model.number="form.cpuunits" dense type="number" min="8" max="10000" :label="gettext('CPU units')" :placeholder="gettext('Default') + ' (100)'" />
              </template>
            </div>
            <div v-else-if="isMountEditor" class="resource-editor__body">
              <q-input v-model="form.volume" dense :label="gettext('Disk image')" />
              <q-input v-if="selectedKey !== 'rootfs'" v-model="form.mountPath" dense :label="gettext('Path')" placeholder="/some/path" />
              <q-checkbox v-if="selectedKey !== 'rootfs'" v-model="form.backup" dense color="primary" :label="gettext('Backup')" />
              <template v-if="mountAdvanced">
                <q-checkbox v-model="form.quota" dense color="primary" :label="gettext('Enable quota')" />
                <q-checkbox v-if="selectedKey !== 'rootfs'" v-model="form.readOnly" dense color="primary" :label="gettext('Read-only')" />
                <q-select v-model="form.mountOptions" dense multiple use-chips option-dense :label="gettext('Mount options')" :options="selectedKey === 'rootfs' ? ['discard', 'lazytime', 'noatime', 'nosuid'] : ['discard', 'lazytime', 'noatime', 'nodev', 'noexec', 'nosuid']" />
                <q-select v-model="form.acl" dense option-dense emit-value map-options :label="gettext('ACLs')" :options="[{ label: gettext('Default'), value: '__default__' }, { label: gettext('Enabled'), value: '1' }, { label: gettext('Disabled'), value: '0' }]" />
                <q-checkbox v-model="form.skipReplication" dense color="primary" :label="gettext('Skip replication')" />
                <q-checkbox v-if="selectedKey !== 'rootfs'" v-model="form.keepAttrs" dense color="primary" :label="gettext('Keep attributes')" />
              </template>
            </div>
            <div v-else-if="isDeviceEditor" class="resource-editor__body">
              <q-input v-model="form.devicePath" dense :label="gettext('Device Path')" placeholder="/dev/xyz" />
              <q-input v-model="form.uid" dense type="number" min="0" :label="gettext('UID') + ' ' + gettext('in CT')" />
              <q-input v-model="form.gid" dense type="number" min="0" :label="gettext('GID') + ' ' + gettext('in CT')" />
              <q-input v-model="form.mode" dense :label="gettext('Access Mode in CT')" placeholder="0660" />
              <q-checkbox v-model="form.denyWrite" dense color="primary" :label="gettext('Read only')" />
            </div>
            <div v-else class="resource-editor__body text-grey-8 wrap">{{ selectedRow.value }}</div>
            </div>
            <div v-if="isMemoryEditor || isCpuEditor || isMountEditor || isDeviceEditor" class="resource-editor__footer row items-center justify-between">
              <q-checkbox v-if="isCpuEditor" v-model="cpuAdvanced" dense color="primary" :label="gettext('Advanced')" />
              <q-checkbox v-else-if="isMountEditor" v-model="mountAdvanced" dense color="primary" :label="gettext('Advanced')" />
              <span v-else />
              <q-btn v-if="isMemoryEditor" no-caps size="12px" class="bg-primary text-grey-1 u-button" :disable="!canEditMemory" :loading="loading" :label="gettext('Save')" @click="saveMemory" />
              <q-btn v-if="isCpuEditor" no-caps size="12px" class="bg-primary text-grey-1 u-button" :disable="!canEditCpu" :loading="loading" :label="gettext('Save')" @click="saveCpu" />
              <q-btn v-if="isMountEditor" no-caps size="12px" class="bg-primary text-grey-1 u-button" :disable="!canEditDisk" :loading="loading" :label="gettext('Save')" @click="saveMount" />
              <q-btn v-if="isDeviceEditor" no-caps size="12px" class="bg-primary text-grey-1 u-button" :disable="!canEditDevice" :loading="loading" :label="gettext('Save')" @click="saveDevice" />
            </div>
          </template>
        </div>
      </div>
    </div>
    <q-dialog v-model="addVisible" persistent>
      <UWindow :title="addKind === 'mount' ? gettext('Mount Point') : gettext('Device Passthrough')" width="640px" :loading="loading">
        <div v-if="addKind === 'mount'" class="q-pa-md u-dense"><div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-6">
              <q-input v-model.number="addForm.mpid" dense type="number" min="0" class="q-field--with-bottom" :label="gettext('Mount Point') + ' ID'" />
              <q-select v-model="addForm.storage" dense options-dense class="q-field--with-bottom" :options="storages" :label="gettext('Storage')" />
              <q-input v-model.number="addForm.size" dense type="number" min="1" :label="gettext('Disk size') + ' (GiB)'" />
            </div>
            <div class="col-6">
              <q-input v-model="addForm.mountPath" dense class="q-field--with-bottom" :label="gettext('Path')" placeholder="/mnt/data" />
              <q-checkbox v-model="addForm.backup" dense right-label color="primary" :label="gettext('Backup')" />
            </div>
          </div>
          <template v-if="addAdvanced">
            <div class="row q-col-gutter-lg q-mt-xs">
              <div class="col-6"><q-checkbox v-model="addForm.quota" dense right-label color="primary" :label="gettext('Enable quota')" /><q-checkbox v-model="addForm.readOnly" dense right-label color="primary" :label="gettext('Read-only')" /><q-select v-model="addForm.mountOptions" dense multiple use-chips options-dense :options="['discard', 'lazytime', 'noatime', 'nodev', 'noexec', 'nosuid']" :label="gettext('Mount options')" /></div>
              <div class="col-6"><q-select v-model="addForm.acl" dense options-dense emit-value map-options class="q-field--with-bottom" :options="[{ label: gettext('Default'), value: '__default__' }, { label: gettext('Enabled'), value: '1' }, { label: gettext('Disabled'), value: '0' }]" label="ACLs" /><q-checkbox v-model="addForm.skipReplication" dense right-label color="primary" :label="gettext('Skip replication')" /><q-checkbox v-model="addForm.keepAttrs" dense right-label color="primary" :label="gettext('Keep Attributes')" /></div>
            </div>
          </template>
        </div></div>
        <div v-else class="q-pa-md u-dense"><div class="u-border q-pa-md">
          <q-input v-model="addForm.devicePath" dense class="q-field--with-bottom" :label="gettext('Device Path')" placeholder="/dev/xyz" />
          <template v-if="addAdvanced">
            <div class="row q-col-gutter-lg"><div class="col-6"><q-input v-model="addForm.uid" dense type="number" min="0" class="q-field--with-bottom" :label="gettext('UID') + ' ' + gettext('in CT')" /><q-input v-model="addForm.gid" dense type="number" min="0" :label="gettext('GID') + ' ' + gettext('in CT')" /></div><div class="col-6"><q-input v-model="addForm.mode" dense class="q-field--with-bottom" :label="gettext('Access Mode in CT')" placeholder="0660" /><q-checkbox v-model="addForm.denyWrite" dense right-label color="primary" :label="gettext('Read only')" /></div></div>
          </template>
        </div></div>
        <template #foot><q-checkbox v-model="addAdvanced" dense right-label color="primary" :label="gettext('Advanced')" /><q-space /><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="addKind === 'mount' ? !addForm.storage || !addForm.mountPath : !addForm.devicePath" :loading="loading" :label="gettext('Add')" @click="createResource" /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="moveVisible" persistent><UWindow :title="gettext('Move Volume')" width="440px" :loading="loading"><div class="q-pa-md u-dense"><div class="u-border q-pa-md"><q-select v-model="moveForm.storage" dense options-dense class="q-field--with-bottom" :options="storages" :label="gettext('Target Storage')" /><q-checkbox v-model="moveForm.deleteSource" dense right-label color="primary" :label="gettext('Delete source')" /></div></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!moveForm.storage" :loading="loading" :label="gettext('Move Volume')" @click="moveVolume" /></template></UWindow></q-dialog>
    <q-dialog v-model="resizeVisible" persistent><UWindow :title="gettext('Resize disk')" width="420px" :loading="loading"><div class="q-pa-md u-dense"><div class="u-border q-pa-md"><q-input v-model="resizeSize" dense type="number" min="1" :label="gettext('Size Increment') + ' (GiB)'" /></div></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!resizeSize || Number(resizeSize) <= 0" :loading="loading" :label="gettext('Resize disk')" @click="resizeVolume" /></template></UWindow></q-dialog>
    <q-dialog v-model="reassignVisible" persistent><UWindow :title="gettext('Reassign Volume')" width="440px" :loading="loading"><div class="q-pa-md u-dense"><div class="u-border q-pa-md"><q-select v-model="reassignForm.targetVmid" dense options-dense emit-value map-options class="q-field--with-bottom" :options="ctTargets.map((target) => ({ label: `${textValue(target.vmid)} (${textValue(target.name) || textValue(target.vmid)})`, value: textValue(target.vmid) }))" :label="gettext('Target Guest')" /><div class="row q-col-gutter-lg"><q-select v-model="reassignForm.targetType" class="col q-field--with-bottom" dense options-dense emit-value map-options :options="[{ label: gettext('Mount Point'), value: 'mp' }, { label: gettext('Unused Disk'), value: 'unused' }]" :label="gettext('Add as')" /><q-input v-model.number="reassignForm.targetId" class="col q-field--with-bottom" dense type="number" min="0" :label="gettext('ID')" /></div></div></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!reassignForm.targetVmid || targetCtConfig[`${reassignForm.targetType}${reassignForm.targetId}`] !== undefined" :loading="loading" :label="gettext('Reassign Volume')" @click="reassignVolume" /></template></UWindow></q-dialog>
  </div>
</template>

<style scoped lang="scss">
.ct-resources-tab {
  padding: 8px;
  font-size: 13px;
}
.resource-toolbar { min-height: 30px; }
.resource-list-column { display: flex; overflow: hidden; align-self: stretch; }
.resource-list-panel { display: flex; flex: 1 1 auto; border-right: 0; background: #fff; }
.resource-list { flex: 1 1 auto; height: 100%; font-size: 13px; background: #fff; }
.resource-list__icon { vertical-align: text-bottom; }
.resource-list-row { min-height: 30px; align-items: center; border-bottom: 1px solid #eef0f3; transition: background-color 150ms ease-out; }
.resource-list-label { align-self: flex-start; padding-top: 6px; }
.resource-list-value { min-width: 0; padding-top: 6px; padding-bottom: 6px; line-height: 18px; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.resource-list-row:last-child { border-bottom: 0; }
.resource-list-row:hover { background: #f4f8fc; }
.resource-list-row.bg-blue-2 { background: #e6f1fb !important; }
.resource-list-row.bg-blue-2 :deep(.text-grey-10), .resource-list-row.bg-blue-2 :deep(.text-grey-8) { color: #1f4f78 !important; }
.resource-editor-column { display: flex; align-self: stretch; background: #fff; }
.resource-editor { display: flex; flex: 1 1 auto; min-height: 100%; flex-direction: column; border-left: 1px solid #d7dce2; background: #fff; }
.resource-editor__content { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; }
.resource-editor__body { display: flex; flex: 1 1 auto; flex-direction: column; gap: 8px; }
.resource-editor__footer { min-height: 52px; padding: 8px 12px; border-top: 1px solid #d7dce2; background: #f5f7fa; }
.editor-titlebar { min-height: 38px; margin: -4px -4px 10px; padding: 4px 8px; background: #f5f7fa; border-bottom: 1px solid #d7dce2; }
.editor-title { font-weight: 600; color: #334155; }
</style>
