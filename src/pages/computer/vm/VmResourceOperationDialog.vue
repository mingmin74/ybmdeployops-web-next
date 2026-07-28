<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import {
  cloneVm,
  convertVmToTemplate,
  deleteVm,
  getNextVmId,
  migrateVm,
  type VmResource,
} from '@/api/vm';
import { getNodes, type PveNode } from '@/api/resources';
import { getNodeStorage } from '@/api/storageContent';
import { getVmSnapshots } from '@/api/overview';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

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
const nodes = shallowRef<PveNode[]>([]);
const target = shallowRef('');
const nextId = shallowRef<number | string>('');
const cloneName = shallowRef('');
const fullClone = shallowRef(true);
const migrateLocalDisks = shallowRef(false);
const targetStorage = shallowRef('');
const cloneStorage = shallowRef('');
const cloneFormat = shallowRef('');
const cloneSnapshot = shallowRef('current');
const clonePool = shallowRef('');
const storageOptions = shallowRef<string[]>([]);
const snapshots = shallowRef<string[]>(['current']);

const sourceName = computed(() => props.vm?.name || String(props.vm?.vmid || ''));
const title = computed(() => `${operationLabel.value}: ${sourceName.value}`);
const operationLabel = computed(() => {
  if (props.operation === 'migrate') return gettext('Migrate');
  if (props.operation === 'clone') return gettext('Clone');
  if (props.operation === 'template') return gettext('Convert to template');
  return gettext('Delete');
});
const onlineNodes = computed(() => nodes.value.filter((node) => node.status === 'online'));
const targetNodes = computed(() =>
  props.operation === 'migrate'
    ? onlineNodes.value.filter((node) => node.node !== props.vm?.node)
    : onlineNodes.value,
);
const canSubmit = computed(() => {
  if (props.operation === 'delete' || props.operation === 'template') return Boolean(props.vm?.node && props.vm?.vmid);
  if (props.operation === 'migrate') return Boolean(props.vm?.node && props.vm?.vmid && target.value);
  return Boolean(props.vm?.node && props.vm?.vmid && target.value && nextId.value && cloneName.value.trim());
});
const deleteMessage = computed(() =>
  props.operation === 'template' ? `${gettext('Are you sure you want to convert')} ${sourceName.value} ${gettext('to template')}?` : `${gettext('Are you sure you want to destroy')}: ${sourceName.value} ?`,
);

function defaultCloneName() {
  return props.vm?.name ? `${props.vm.name}-clone` : '';
}

async function initialize() {
  if (!model.value || !props.operation || !props.vm) return;

  loading.value = true;
  try {
    if (props.operation === 'delete' || props.operation === 'template') return;

    const requests: [Promise<Awaited<ReturnType<typeof getNodes>>>, Promise<Awaited<ReturnType<typeof getNextVmId>>>?] =
      props.operation === 'clone' ? [getNodes(), getNextVmId()] : [getNodes()];
    const [nodesResponse, nextIdResponse] = await Promise.all(requests);
    nodes.value = (nodesResponse.data || []).sort((left, right) => left.node.localeCompare(right.node));
    target.value =
      (props.operation === 'clone' && onlineNodes.value.some((node) => node.node === props.vm?.node)
        ? props.vm.node
        : targetNodes.value[0]?.node) || '';
    if (nextIdResponse) nextId.value = nextIdResponse.data || '';
    cloneName.value = defaultCloneName();
    fullClone.value = true;
    migrateLocalDisks.value = false;
    targetStorage.value = '';
    cloneStorage.value = '';
    cloneFormat.value = '';
    cloneSnapshot.value = 'current';
    clonePool.value = '';
    const targetNode = target.value;
    if (targetNode) {
      const storageResponse = await getNodeStorage(targetNode, 'images');
      storageOptions.value = (storageResponse.data || []).map((item) => String(item.storage || '')).filter(Boolean);
    }
    if (props.operation === 'clone') {
      const snapshotsResponse = await getVmSnapshots(props.vm.node!, props.vm.vmid);
      snapshots.value = (snapshotsResponse.data || []).map((item) => String(item.name || '')).filter(Boolean);
      if (!snapshots.value.includes('current')) snapshots.value.unshift('current');
    }
  } finally {
    loading.value = false;
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
        ...(migrateLocalDisks.value && targetStorage.value ? { targetstorage: targetStorage.value } : {}),
      });
    } else if (props.operation === 'clone') {
      response = await cloneVm(vm.node, vm.vmid, {
        newid: nextId.value,
        name: cloneName.value.trim(),
        target: target.value,
        full: fullClone.value ? 1 : 0,
        ...(cloneStorage.value ? { storage: cloneStorage.value } : {}),
        ...(cloneFormat.value ? { format: cloneFormat.value } : {}),
        ...(cloneSnapshot.value !== 'current' ? { snapname: cloneSnapshot.value } : {}),
        ...(clonePool.value.trim() ? { pool: clonePool.value.trim() } : {}),
      });
    } else if (props.operation === 'template') {
      response = await convertVmToTemplate(vm.node, vm.vmid);
    } else {
      response = await deleteVm(vm.node, vm.vmid);
    }

    model.value = false;
    emit('completed');
    if (response.data) emit('task', { node: props.operation === 'clone' ? target.value : vm.node, upid: response.data, title: title.value });
  } finally {
    loading.value = false;
  }
}

watch(
  () => [model.value, props.operation, props.vm?.node, props.vm?.vmid],
  () => { void initialize(); },
);
</script>

<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="title" width="580px" :loading="loading">
      <div class="q-pa-md u-hidden-error">
        <template v-if="operation === 'delete' || operation === 'template'">
          <div class="u-size-12">{{ deleteMessage }}</div>
        </template>
        <div v-else class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input dense outlined square readonly :model-value="vm?.node || ''" :label="gettext('Source Node')" />
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
            <div class="col-12">
              <q-checkbox v-model="fullClone" dense color="primary" :label="gettext('Full Clone')" />
            </div>
            <div class="col-12 col-sm-6"><q-select v-model="cloneSnapshot" dense outlined square :options="snapshots" :label="gettext('Snapshot')" /></div>
            <div class="col-12 col-sm-6"><q-select v-model="cloneStorage" dense outlined square clearable :options="storageOptions" :label="gettext('Target Storage')" /></div>
            <div class="col-12 col-sm-6"><q-select v-model="cloneFormat" dense outlined square clearable :options="['raw', 'qcow2', 'vmdk']" :label="gettext('Disk Format')" /></div>
            <div class="col-12 col-sm-6"><q-input v-model="clonePool" dense outlined square :label="gettext('Resource Pool')" /></div>
          </template>
          <template v-else-if="operation === 'migrate'"><div class="col-12"><q-checkbox v-model="migrateLocalDisks" dense color="primary" :label="gettext('Migrate local disks')" /></div><div v-if="migrateLocalDisks" class="col-12"><q-select v-model="targetStorage" dense outlined square :options="storageOptions" :label="gettext('Target Storage')" /></div></template>
        </div>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps flat size="12px" class="u-button q-mr-sm" :disable="loading" :label="gettext('Cancel')" />
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
