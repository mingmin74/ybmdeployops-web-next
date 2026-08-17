<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import {
  cloneVm,
  convertVmToTemplate,
  deleteVm,
  getNextVmId,
  getVmCloneFeature,
  getVmMigrationCapabilities,
  getVmMigrationPreconditions,
  migrateVm,
  type VmResource,
} from '@/api/vm';
import { getNodes, type PveNode } from '@/api/resources';
import { getNodeStorage } from '@/api/storageContent';
import { getVmSnapshots } from '@/api/overview';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

type Operation = 'migrate' | 'clone' | 'delete' | 'template';

const model = defineModel<boolean>({ required: true });
const props = defineProps<{
  operation?: Operation | undefined;
  vm?: VmResource | undefined;
}>();
const emit = defineEmits<{
  completed: [];
  task: [payload: { node: string; upid: string; title: string }];
}>();

const loading = shallowRef(false);
const checking = shallowRef(false);
const session = useSessionStore();
const nodes = shallowRef<PveNode[]>([]);
const target = shallowRef('');
const nextId = shallowRef<number | string>('');
const cloneIdAvailable = shallowRef(false);
const cloneName = shallowRef('');
const cloneMode = shallowRef<'copy' | 'clone'>('copy');
const migrateLocalDisks = shallowRef(false);
const forceMigration = shallowRef(false);
const migrateConntrackState = shallowRef(true);
const targetStorage = shallowRef('');
const cloneStorage = shallowRef('');
const cloneFormat = shallowRef('');
const cloneSnapshot = shallowRef('current');
const clonePool = shallowRef('');
const storageOptions = shallowRef<string[]>([]);
const storageFormats = shallowRef<string[]>([]);
const storageFormatOptions = shallowRef<Record<string, string[]>>({});
const snapshots = shallowRef<string[]>(['current']);
const allowedCloneNodes = shallowRef<string[]>([]);
const cloneFeatureReady = shallowRef(false);
const migrationPossible = shallowRef(true);
const migrationMessage = shallowRef('');
const migrationLocalResources = shallowRef(false);
const bothHaveDbusVmstate = shallowRef(false);
const deleteConfirmation = shallowRef('');
const purge = shallowRef(false);
const destroyUnreferencedDisks = shallowRef(false);

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

const sourceName = computed(() => textValue(props.vm?.name) || textValue(props.vm?.vmid));
const title = computed(() => `${operationLabel.value}: ${sourceName.value}`);
const operationLabel = computed(() => {
  if (props.operation === 'migrate') return gettext('Migrate');
  if (props.operation === 'clone') return gettext('Clone');
  if (props.operation === 'template') return gettext('Convert to template');
  return gettext('Delete');
});
const onlineNodes = computed(() => nodes.value.filter((node) => node.status === 'online'));
const targetNodes = computed(() =>
  (props.operation === 'migrate'
    ? onlineNodes.value.filter((node) => node.node !== props.vm?.node)
    : onlineNodes.value
  ).filter((node) =>
    props.operation !== 'clone' || (cloneFeatureReady.value && allowedCloneNodes.value.includes(node.node)),
  ),
);
const canCreateLinkedClone = computed(() => Boolean(props.vm?.template));
const canSubmit = computed(() => {
  if (props.operation === 'template')
    return Boolean(props.vm?.node && props.vm?.vmid);
  if (props.operation === 'delete')
    return Boolean(props.vm?.node && props.vm?.vmid && deleteConfirmation.value === String(props.vm.vmid));
  if (props.operation === 'migrate')
    return Boolean(props.vm?.node && props.vm?.vmid && target.value && migrationPossible.value && !checking.value);
  return Boolean(props.vm?.node && props.vm?.vmid && target.value && nextId.value && cloneIdAvailable.value && !checking.value);
});
const cloneSnapshotVisible = computed(
  () => !props.vm?.template && snapshots.value.some((snapshot) => snapshot !== 'current'),
);
const showForceMigration = computed(
  () => props.vm?.status !== 'running' && migrationLocalResources.value && session.userid === 'root@pam',
);
const showConntrackState = computed(
  () => props.vm?.status === 'running' && bothHaveDbusVmstate.value,
);
const deleteMessage = computed(() =>
  props.operation === 'template'
    ? `${gettext('Are you sure you want to convert')} ${sourceName.value} ${gettext('to template')}?`
    : `${gettext('Are you sure you want to destroy')}: ${sourceName.value} ?`,
);

function defaultCloneName() {
  return props.vm?.name ? `${props.vm.name}-clone` : '';
}

async function initialize() {
  if (!model.value || !props.operation || !props.vm) return;

  loading.value = true;
  try {
    if (props.operation === 'delete' || props.operation === 'template') return;

    const nodesResponse = await getNodes();
    const nextIdResponse = props.operation === 'clone' ? await getNextVmId() : undefined;
    nodes.value = (nodesResponse.data || []).sort((left, right) =>
      left.node.localeCompare(right.node),
    );
    target.value =
      (props.operation === 'clone' && onlineNodes.value.some((node) => node.node === props.vm?.node)
        ? props.vm.node
        : targetNodes.value[0]?.node) || '';
    if (nextIdResponse) {
      nextId.value = nextIdResponse.data || '';
      cloneIdAvailable.value = Boolean(nextId.value);
    }
    cloneName.value = defaultCloneName();
    cloneMode.value = canCreateLinkedClone.value ? 'clone' : 'copy';
    migrateLocalDisks.value = false;
    forceMigration.value = false;
    migrateConntrackState.value = true;
    targetStorage.value = '';
    cloneStorage.value = '';
    cloneFormat.value = '';
    cloneSnapshot.value = 'current';
    clonePool.value = '';
    cloneFeatureReady.value = false;
    purge.value = false;
    destroyUnreferencedDisks.value = false;
    deleteConfirmation.value = '';
    const targetNode = target.value;
    if (targetNode) await refreshTarget(targetNode);
    if (props.operation === 'clone') {
      const snapshotsResponse = await getVmSnapshots(props.vm.node!, props.vm.vmid);
      snapshots.value = (snapshotsResponse.data || [])
        .map((item) => textValue(item.name))
        .filter(Boolean);
      if (!snapshots.value.includes('current')) snapshots.value.unshift('current');
      await verifyCloneFeature();
    }
  } finally {
    loading.value = false;
  }
}

async function refreshTarget(targetNode = target.value) {
  targetStorage.value = '';
  cloneStorage.value = '';
  cloneFormat.value = '';
  storageOptions.value = [];
  storageFormats.value = [];
  storageFormatOptions.value = {};
  if (!targetNode) return;
  const storageResponse = await getNodeStorage(targetNode, 'images');
  const entries = storageResponse.data || [];
  storageOptions.value = entries.map((item) => textValue(item.storage)).filter(Boolean);
  storageFormatOptions.value = Object.fromEntries(entries.map((item) => {
    const formats = (item as Record<string, unknown>).format;
    const values = Array.isArray(formats) ? formats.map(textValue).filter(Boolean) : textValue(formats).split(',').filter(Boolean);
    return [textValue((item as Record<string, unknown>).storage), values];
  }));
  storageFormats.value = storageFormatOptions.value[cloneStorage.value] || [];
  if (props.operation === 'migrate') await checkMigratePreconditions();
}

async function verifyCloneFeature() {
  const vm = props.vm;
  if (props.operation !== 'clone' || !vm?.node || !vm.vmid) return;
  checking.value = true;
  try {
    const response = await getVmCloneFeature(vm.node, vm.vmid, {
      feature: cloneMode.value,
      ...(cloneSnapshot.value !== 'current' ? { snapname: cloneSnapshot.value } : {}),
    });
    allowedCloneNodes.value = response.data?.nodes || [];
    cloneFeatureReady.value = true;
    if (!allowedCloneNodes.value.includes(target.value)) target.value = targetNodes.value[0]?.node || '';
  } catch {
    allowedCloneNodes.value = [];
    cloneFeatureReady.value = false;
    target.value = '';
  } finally {
    checking.value = false;
  }
}

async function checkMigratePreconditions() {
  const vm = props.vm;
  if (props.operation !== 'migrate' || !vm?.node || !vm.vmid || !target.value) return;
  checking.value = true;
  migrationPossible.value = false;
  migrationMessage.value = '';
  try {
    const [preconditions, capabilities] = await Promise.all([
      getVmMigrationPreconditions(vm.node, vm.vmid),
      getVmMigrationCapabilities(target.value),
    ]);
    const info = preconditions.data || {};
    const allowed = (info.allowed_nodes || info['allowed-nodes'] || info.nodes) as string[] | undefined;
    const diagnostics = (info.errors || info.preconditions || []) as Array<{ text?: string; severity?: string }>;
    const disallowed = ((info.not_allowed_nodes || info['not-allowed-nodes'] || {}) as Record<string, Record<string, unknown>>)[target.value] || {};
    const localResources = (info.local_resources || []) as string[];
    const localDisks = (info.local_disks || []) as Array<{ cdrom?: number; volid?: string; size?: number }>;
    const mappedResources = (info['mapped-resource-info'] || {}) as Record<string, Record<string, unknown>>;
    const unavailable = (disallowed['unavailable-resources'] || []) as string[];
    const blockingHa = (disallowed['blocking-ha-resources'] || []) as Array<{ sid?: string; cause?: string }>;
    migrationLocalResources.value = localResources.some((resource) => !mappedResources[resource]);
    if (unavailable.length) diagnostics.push({ severity: 'error', text: `${gettext('Mapped Resources')} (${unavailable.join(', ')}) ${gettext('not available on selected target.')}` });
    if (migrationLocalResources.value && vm.status !== 'running') diagnostics.push({ severity: 'error', text: `${gettext('Cannot migrate VM with local resources')}: ${localResources.join(', ')}` });
    if (vm.status === 'running') {
      const notLive = Object.entries(mappedResources).filter(([, resource]) => !resource['live-migration']).map(([name]) => name);
      if (notLive.length) diagnostics.push({ severity: 'error', text: `${gettext('Cannot migrate running VM with mapped resources')}: ${notLive.join(', ')}` });
    }
    for (const disk of localDisks) {
      if (disk.cdrom === 1 && !String(disk.volid || '').includes(`vm-${vm.vmid}-cloudinit`)) {
        diagnostics.push({ severity: 'error', text: gettext('Cannot migrate VM with local CD/DVD') });
      }
    }
    for (const resource of blockingHa) diagnostics.push({ severity: 'error', text: `${gettext('Cannot migrate VM, because blocking HA resource')} ${resource.sid || ''} ${gettext('is on selected target node.')}` });
    const sourceDbus = Boolean(info['has-dbus-vmstate']);
    bothHaveDbusVmstate.value = sourceDbus && Boolean(capabilities.data?.['has-dbus-vmstate']);
    migrationPossible.value = info.possible !== false && (!allowed || allowed.includes(target.value)) && !diagnostics.some((item) => item.severity === 'error');
    migrationMessage.value = diagnostics.map((item) => item.text).filter(Boolean).join('\n') || '';
  } catch {
    migrationMessage.value = gettext('Migration precondition check failed.');
  } finally {
    checking.value = false;
  }
}

async function submit() {
  const vm = props.vm;
  if (!vm?.node || !vm.vmid || !props.operation || !canSubmit.value) return;

  loading.value = true;
  try {
    let response;
    if (props.operation === 'migrate') {
      response = await migrateVm(vm.node, vm.vmid, {
        target: target.value,
        ...(vm.status === 'running' ? { online: 1 } : {}),
        ...(migrateLocalDisks.value ? { 'with-local-disks': 1 } : {}),
        ...(migrateLocalDisks.value && vm.status === 'running' && targetStorage.value
          ? { targetstorage: targetStorage.value }
          : {}),
        ...(showForceMigration.value && forceMigration.value ? { force: 1 } : {}),
        ...(showConntrackState.value && migrateConntrackState.value
          ? { 'with-conntrack-state': 1 }
          : {}),
      });
    } else if (props.operation === 'clone') {
      response = await cloneVm(vm.node, vm.vmid, {
        newid: nextId.value,
        ...(cloneName.value.trim() ? { name: cloneName.value.trim() } : {}),
        target: target.value,
        full: cloneMode.value === 'copy' ? 1 : 0,
        ...(cloneMode.value === 'copy' && cloneStorage.value ? { storage: cloneStorage.value } : {}),
        ...(cloneMode.value === 'copy' && cloneFormat.value ? { format: cloneFormat.value } : {}),
        ...(cloneSnapshot.value !== 'current' ? { snapname: cloneSnapshot.value } : {}),
        ...(clonePool.value.trim() ? { pool: clonePool.value.trim() } : {}),
      });
    } else if (props.operation === 'template') {
      response = await convertVmToTemplate(vm.node, vm.vmid);
    } else {
      response = await deleteVm(vm.node, vm.vmid, {
        ...(purge.value ? { purge: 1 } : {}),
        ...(destroyUnreferencedDisks.value ? { 'destroy-unreferenced-disks': 1 } : {}),
      });
    }

    model.value = false;
    emit('completed');
    if (response.data)
      emit('task', {
        node: props.operation === 'clone' ? target.value : vm.node,
        upid: response.data,
        title: title.value,
      });
  } finally {
    loading.value = false;
  }
}

watch(
  () => [model.value, props.operation, props.vm?.node, props.vm?.vmid],
  () => {
    void initialize();
  },
);
watch(target, (value) => { if (model.value) void refreshTarget(value); });
watch([cloneMode, cloneSnapshot], () => { if (model.value && props.operation === 'clone') void verifyCloneFeature(); });
watch(cloneStorage, (storage) => {
  cloneFormat.value = '';
  storageFormats.value = storageFormatOptions.value[storage] || [];
});
watch(nextId, async (vmid) => {
  if (!model.value || props.operation !== 'clone' || !vmid) {
    cloneIdAvailable.value = false;
    return;
  }
  cloneIdAvailable.value = false;
  try {
    const response = await getNextVmId(vmid);
    cloneIdAvailable.value = String(response.data) === String(vmid);
  } catch { cloneIdAvailable.value = false; }
});
</script>

<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="title" width="580px" :loading="loading">
      <div class="q-pa-md u-hidden-error">
        <template v-if="operation === 'delete' || operation === 'template'">
          <div class="u-size-12">{{ deleteMessage }}</div>
          <div v-if="operation === 'delete'" class="q-mt-md column q-gutter-sm">
            <q-input
              v-model="deleteConfirmation"
              dense
              outlined
              square
              :label="gettext('Please enter the VMID to confirm')"
              :hint="String(vm?.vmid || '')"
            />
            <q-checkbox
              v-model="purge"
              dense
              color="primary"
              :label="gettext('Purge from job configurations')"
            />
            <q-checkbox
              v-model="destroyUnreferencedDisks"
              dense
              color="primary"
              :label="gettext('Destroy unreferenced disks owned by guest')"
            />
            <div class="text-caption text-grey-7">
              {{ gettext('Referenced disks will always be destroyed.') }}
            </div>
          </div>
        </template>
        <div v-else class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input
              dense
              outlined
              square
              readonly
              :model-value="vm?.node || ''"
              :label="gettext('Source Node')"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-select
              v-model="target"
              dense
              outlined
              square
              options-dense
              emit-value
              map-options
              :options="targetNodes.map((node) => ({ label: node.node, value: node.node }))"
              :label="gettext('Target Node')"
            />
          </div>
          <template v-if="operation === 'clone'">
            <div class="col-12 col-sm-6">
              <q-input v-model="nextId" dense outlined square :label="gettext('New VM ID')" />
            </div>
            <div class="col-12 col-sm-6">
              <q-input v-model="cloneName" dense outlined square :label="gettext('Name')" />
            </div>
            <div v-if="canCreateLinkedClone" class="col-12">
              <q-select
                v-model="cloneMode"
                dense
                outlined
                square
                emit-value
                map-options
                :label="gettext('Mode')"
                :options="[
                  { label: gettext('Full Clone'), value: 'copy' },
                  { label: gettext('Linked Clone'), value: 'clone' },
                ]"
              />
            </div>
            <div v-if="cloneSnapshotVisible" class="col-12 col-sm-6">
              <q-select
                v-model="cloneSnapshot"
                dense
                outlined
                square
                :options="snapshots"
                :label="gettext('Snapshot')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="cloneStorage"
                dense
                outlined
                square
                clearable
                :options="storageOptions"
                :label="gettext('Target Storage')"
                :disable="cloneMode === 'clone'"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="cloneFormat"
                dense
                outlined
                square
                clearable
                :options="storageFormats"
                :label="gettext('Disk Format')"
                :disable="cloneMode === 'clone' || !cloneStorage"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="clonePool"
                dense
                outlined
                square
                :label="gettext('Resource Pool')"
              />
            </div>
          </template>
          <template v-else-if="operation === 'migrate'"
            ><div v-if="checking" class="col-12 text-caption text-grey-7">{{ gettext('Checking migration preconditions...') }}</div>
            <div v-if="migrationMessage" class="col-12 text-negative text-caption" style="white-space: pre-line">{{ migrationMessage }}</div>
            <div class="col-12">
              <q-checkbox
                v-model="migrateLocalDisks"
                dense
                color="primary"
                :label="gettext('Migrate local disks')"
              />
            </div>
            <div v-if="migrateLocalDisks && vm?.status === 'running'" class="col-12">
              <q-select
                v-model="targetStorage"
                dense
                outlined
                square
                :options="storageOptions"
                :label="gettext('Target Storage')"
              />
            </div>
            <div class="col-12">
              <q-checkbox
                v-if="showForceMigration"
                v-model="forceMigration"
                dense
                color="primary"
                :label="gettext('Force')"
              /><q-checkbox
                v-if="showConntrackState"
                v-model="migrateConntrackState"
                dense
                color="primary"
                class="q-ml-md"
                :label="gettext('Conntrack state')"
              /></div
          ></template>
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button q-mr-sm"
          :disable="loading"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canSubmit"
          :loading="loading"
          :label="operation === 'delete' ? gettext('Delete') : operationLabel"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
