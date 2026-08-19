<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { VmResource } from '@/api/vm';
import {
  cloneCt,
  convertCtToTemplate,
  deleteCt,
  getCtCloneFeature,
  getCtMigrationPreconditions,
  getNextVmId,
  migrateCt,
} from '@/api/vm';
import { getNodes, getPools } from '@/api/resources';
import { getVmSnapshots } from '@/api/overview';
import { getNodeStorage } from '@/api/storageContent';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { isDnsName } from '@/utils/pveValidation';

type Operation = 'migrate' | 'clone' | 'template' | 'delete';
const model = defineModel<boolean>({ required: true });
const props = defineProps<{ operation?: Operation; vm?: VmResource | undefined }>();
const emit = defineEmits<{
  completed: [];
  task: [payload: { node: string; upid: string; title: string }];
}>();
const loading = shallowRef(false);
const nodes = shallowRef<string[]>([]);
const target = shallowRef('');
const newid = shallowRef<number | string>('');
const hostname = shallowRef('');
const confirm = shallowRef('');
const purge = shallowRef(false);
const destroyUnreferenced = shallowRef(false);
const migrationHasLocalDisks = shallowRef(false);
const targetStorage = shallowRef('');
const targetStorages = shallowRef<string[]>([]);
const cloneMode = shallowRef<'copy' | 'clone'>('copy');
const cloneStorage = shallowRef('');
const clonePool = shallowRef('');
const pools = shallowRef<string[]>([]);
const allowedCloneNodes = shallowRef<string[]>([]);
const cloneNodesRestricted = shallowRef(false);
const cloneFeatureAllowed = shallowRef(true);
const cloneFeatureMessage = shallowRef('');
const snapshots = shallowRef<string[]>([]);
const cloneSnapshot = shallowRef('current');
const vmidAvailable = shallowRef(false);
const migrationPossible = shallowRef(true);
const migrationMessage = shallowRef('');
const label = computed(
  () =>
    ({
      migrate: gettext('Migrate'),
      clone: gettext('Clone'),
      template: gettext('Convert to template'),
      delete: gettext('Remove'),
    })[props.operation || 'delete']
);
const canSubmit = computed(() => {
  const vm = props.vm;
  if (!vm?.node || vm.vmid === undefined) return false;
  if (props.operation === 'delete') return confirm.value === String(vm.vmid);
  if (props.operation === 'template') return true;
  if (props.operation === 'migrate') return Boolean(target.value && migrationPossible.value);
  return Boolean(
    /^[0-9]+$/.test(String(newid.value)) &&
    vmidAvailable.value &&
    (!hostname.value || isDnsName(hostname.value)) &&
    cloneFeatureAllowed.value &&
    Boolean(target.value) &&
    (!cloneNodesRestricted.value || allowedCloneNodes.value.includes(target.value))
  );
});
async function initialize() {
  if (!model.value || !props.operation || !props.vm) return;
  loading.value = true;
  try {
    const [response, poolsResponse] = await Promise.all([getNodes(), getPools()]);
    nodes.value = (response.data || [])
      .filter(
        (node) =>
          node.status === 'online' && (props.operation === 'clone' || node.node !== props.vm?.node)
      )
      .map((node) => node.node);
    pools.value = (poolsResponse.data || []).map((pool) => pool.poolid).filter(Boolean);
    target.value = props.operation === 'clone' ? props.vm.node || '' : nodes.value[0] || '';
    hostname.value = props.vm.name ? `${props.vm.name}-clone` : '';
    confirm.value = '';
    purge.value = false;
    destroyUnreferenced.value = false;
    migrationHasLocalDisks.value = false;
    targetStorage.value = '';
    cloneStorage.value = '';
    clonePool.value = '';
    cloneMode.value = props.operation === 'clone' && props.vm.template ? 'clone' : 'copy';
    migrationPossible.value = true;
    migrationMessage.value = '';
    if (props.operation === 'clone') {
      cloneFeatureAllowed.value = true;
      cloneFeatureMessage.value = '';
      cloneNodesRestricted.value = false;
      allowedCloneNodes.value = [];
      newid.value = (await getNextVmId()).data || '';
      snapshots.value =
        (await getVmSnapshots(props.vm.node!, props.vm.vmid, 'lxc')).data
          ?.map((item) =>
            typeof item.name === 'string' || typeof item.name === 'number' ? String(item.name) : ''
          )
          .filter(Boolean) || [];
      if (!snapshots.value.includes('current')) snapshots.value.unshift('current');
      cloneSnapshot.value = 'current';
      vmidAvailable.value = Boolean(newid.value);
      await checkCloneFeature();
    }
  } finally {
    loading.value = false;
  }
}
async function checkCloneFeature() {
  const vm = props.vm;
  if (!model.value || props.operation !== 'clone' || !vm?.node || vm.vmid === undefined) return;
  try {
    const response = await getCtCloneFeature(
      vm.node,
      vm.vmid,
      cloneMode.value,
      cloneSnapshot.value
    );
    const data = response.data || {};
    if (data.hasFeature === false) {
      // feature capability says the clone is not possible (PVE disables submit)
      cloneFeatureAllowed.value = false;
      cloneFeatureMessage.value = gettext('Clone is not supported for this container.');
      return;
    }
    cloneFeatureAllowed.value = true;
    cloneFeatureMessage.value = '';
    if (Array.isArray(data.nodes)) {
      // an explicit allow-list from the feature API restricts the target node
      allowedCloneNodes.value = data.nodes;
      cloneNodesRestricted.value = true;
      const first = data.nodes[0];
      if (data.nodes.length && first && !data.nodes.includes(target.value)) target.value = first;
    } else {
      // nodes absent: no allow-list restriction, keep the current online nodes
      cloneNodesRestricted.value = false;
      allowedCloneNodes.value = [];
    }
  } catch {
    // the global Notify already surfaced the error; keep the last known state
  }
}
async function checkMigration() {
  const vm = props.vm;
  if (
    !model.value ||
    props.operation !== 'migrate' ||
    !vm?.node ||
    vm.vmid === undefined ||
    !target.value
  )
    return;
  migrationPossible.value = false;
  try {
    const data = (await getCtMigrationPreconditions(vm.node, vm.vmid)).data || {};
    migrationHasLocalDisks.value = Array.isArray(data.local_disks) && data.local_disks.length > 0;
    const blocked = ((data['not-allowed-nodes'] || {}) as Record<string, Record<string, unknown>>)[
      target.value
    ]?.['blocking-ha-resources'] as Array<{ sid?: string }> | undefined;
    migrationMessage.value = (blocked || [])
      .map(
        (item) =>
          `${gettext('Cannot migrate container, because blocking HA resource')} ${item.sid || ''}.`
      )
      .join('\n');
    migrationPossible.value = data.possible !== false && !(blocked || []).length;
  } catch {
    migrationMessage.value = gettext('Migration precondition check failed.');
  }
}
async function submit() {
  const vm = props.vm;
  if (!vm?.node || vm.vmid === undefined || !props.operation || !canSubmit.value) return;
  loading.value = true;
  try {
    let response;
    if (props.operation === 'migrate')
      response = await migrateCt(vm.node, vm.vmid, {
        target: target.value,
        ...(vm.status === 'running' ? { restart: 1 } : {}),
        ...(migrationHasLocalDisks.value ? { 'with-local-disks': 1 } : {}),
        ...(migrationHasLocalDisks.value && vm.status === 'running' && targetStorage.value
          ? { targetstorage: targetStorage.value }
          : {}),
      });
    else if (props.operation === 'clone')
      response = await cloneCt(vm.node, vm.vmid, {
        newid: newid.value,
        hostname: hostname.value,
        ...(target.value && target.value !== vm.node ? { target: target.value } : {}),
        full: cloneMode.value === 'copy' ? 1 : 0,
        ...(cloneMode.value === 'copy' && cloneStorage.value
          ? { storage: cloneStorage.value }
          : {}),
        ...(clonePool.value ? { pool: clonePool.value } : {}),
        ...(cloneSnapshot.value !== 'current' ? { snapname: cloneSnapshot.value } : {}),
      });
    else if (props.operation === 'template') response = await convertCtToTemplate(vm.node, vm.vmid);
    else
      response = await deleteCt(vm.node, vm.vmid, {
        ...(purge.value ? { purge: 1 } : {}),
        ...(destroyUnreferenced.value ? { 'destroy-unreferenced-disks': 1 } : {}),
      });
    model.value = false;
    emit('completed');
    if (response.data)
      emit('task', {
        node: '',
        upid: response.data,
        title: `${label.value}: ${vm.name || vm.vmid}`,
      });
  } finally {
    loading.value = false;
  }
}
watch(
  () => [model.value, props.operation, props.vm?.node, props.vm?.vmid],
  () => void initialize()
);
watch(target, () => void checkMigration());
watch(cloneMode, () => void checkCloneFeature());
watch(cloneSnapshot, () => void checkCloneFeature());
watch(newid, async (value) => {
  if (!model.value || props.operation !== 'clone' || !value) {
    vmidAvailable.value = false;
    return;
  }
  const response = await getNextVmId(value).catch(() => null);
  vmidAvailable.value = String(response?.data) === String(value);
});
watch(target, async (node) => {
  targetStorage.value = '';
  targetStorages.value = node
    ? ((await getNodeStorage(node, 'rootdir')).data || [])
        .map((item) =>
          typeof item.storage === 'string' || typeof item.storage === 'number'
            ? String(item.storage)
            : ''
        )
        .filter(Boolean)
    : [];
});
</script>
<template>
  <q-dialog
    v-model="model"
    persistent
  >
    <UWindow
      :title="label"
      width="520px"
      :loading="loading"
    >
      <div class="q-pa-md q-gutter-md">
        <template v-if="operation === 'delete' || operation === 'template'">
          <div>
            {{
              operation === 'delete'
                ? gettext('Please enter the VMID to confirm removal.')
                : gettext('Are you sure you want to convert this container to a template?')
            }}
          </div>
          <template v-if="operation === 'delete'">
            <q-input
              v-model="confirm"
              dense
              outlined
              :label="gettext('VMID')"
            />
            <q-checkbox
              v-model="purge"
              dense
              :label="gettext('Purge from job configurations')"
            />
            <q-checkbox
              v-model="destroyUnreferenced"
              dense
              :label="gettext('Destroy unreferenced disks owned by guest')"
            />
          </template>
        </template>
        <template v-else>
          <q-select
            v-model="target"
            dense
            outlined
            emit-value
            map-options
            :options="nodes.map((node) => ({ label: node, value: node }))"
            :label="gettext('Target Node')"
          />
          <template v-if="operation === 'clone'">
            <q-input
              v-model="newid"
              dense
              outlined
              :label="gettext('New VM ID')"
            />
            <q-input
              v-model="hostname"
              dense
              outlined
              :label="gettext('Hostname')"
            />
            <q-select
              v-if="snapshots.length > 1"
              v-model="cloneSnapshot"
              dense
              outlined
              :options="snapshots"
              :label="gettext('Snapshot')"
            />
            <q-select
              v-if="vm?.template"
              v-model="cloneMode"
              dense
              outlined
              emit-value
              map-options
              :options="[
                { label: gettext('Full Clone'), value: 'copy' },
                { label: gettext('Linked Clone'), value: 'clone' },
              ]"
              :label="gettext('Mode')"
            />
            <q-select
              v-if="cloneMode === 'copy'"
              v-model="cloneStorage"
              dense
              outlined
              clearable
              :options="targetStorages"
              :label="gettext('Target Storage')"
            />
            <q-select
              v-model="clonePool"
              dense
              outlined
              clearable
              :options="pools"
              :label="gettext('Resource Pool')"
            />
            <div
              v-if="!cloneFeatureAllowed && cloneFeatureMessage"
              class="text-negative text-caption"
            >
              {{ cloneFeatureMessage }}
            </div>
          </template>
          <q-select
            v-if="operation === 'migrate' && vm?.status === 'running' && migrationHasLocalDisks"
            v-model="targetStorage"
            dense
            outlined
            clearable
            :options="targetStorages"
            :label="gettext('Target Storage')"
          />
          <div
            v-if="operation === 'migrate' && migrationMessage"
            class="text-negative text-caption"
            style="white-space: pre-line"
          >
            {{ migrationMessage }}
          </div>
        </template>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          flat
          :label="gettext('Cancel')"
        />
        <q-btn
          color="primary"
          :disable="!canSubmit"
          :loading="loading"
          :label="label"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
