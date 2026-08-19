<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { VmResource } from '@/api/vm';
import {
  cloneCt,
  convertCtToTemplate,
  deleteCt,
  getCtMigrationPreconditions,
  getNextVmId,
  migrateCt,
} from '@/api/vm';
import { getNodes } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

type Operation = 'migrate' | 'clone' | 'template' | 'delete';
const model = defineModel<boolean>({ required: true });
const props = defineProps<{ operation?: Operation; vm?: VmResource }>();
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
const localDisks = shallowRef(false);
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
  return Boolean(newid.value && hostname.value);
});
async function initialize() {
  if (!model.value || !props.operation || !props.vm) return;
  loading.value = true;
  try {
    const response = await getNodes();
    nodes.value = (response.data || [])
      .filter(
        (node) =>
          node.status === 'online' && (props.operation === 'clone' || node.node !== props.vm?.node)
      )
      .map((node) => node.node);
    target.value = nodes.value[0] || '';
    hostname.value = props.vm.name ? `${props.vm.name}-clone` : '';
    confirm.value = '';
    purge.value = false;
    destroyUnreferenced.value = false;
    localDisks.value = false;
    migrationPossible.value = true;
    migrationMessage.value = '';
    if (props.operation === 'clone') newid.value = (await getNextVmId()).data || '';
  } finally {
    loading.value = false;
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
        ...(localDisks.value ? { 'with-local-disks': 1 } : {}),
      });
    else if (props.operation === 'clone')
      response = await cloneCt(vm.node, vm.vmid, {
        newid: newid.value,
        hostname: hostname.value,
        ...(target.value && target.value !== vm.node ? { target: target.value } : {}),
        full: 1,
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
        node: props.operation === 'clone' || props.operation === 'migrate' ? target.value : vm.node,
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
          </template>
          <q-checkbox
            v-if="operation === 'migrate'"
            v-model="localDisks"
            dense
            :label="gettext('Migrate local disks')"
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
