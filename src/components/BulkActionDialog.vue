<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { runNodeBulkAction } from '@/api/host';
import { getNodes, type PveNode } from '@/api/resources';
import { getVmResources, type VmResource } from '@/api/vm';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

export type NodeBulkAction = 'startall' | 'stopall' | 'suspendall' | 'migrateall';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ node: string; action: NodeBulkAction }>();
const emit = defineEmits<{ completed: [] }>();

const loading = shallowRef(false);
const submitting = shallowRef(false);
const resources = shallowRef<VmResource[]>([]);
const nodes = shallowRef<PveNode[]>([]);
const selected = shallowRef<VmResource[]>([]);
const nameFilter = shallowRef('');
const statusFilter = shallowRef('');
const typeFilter = shallowRef('');
const poolFilter = shallowRef<string[]>([]);
const haStatusFilter = shallowRef<string[]>([]);
const includeTagFilter = shallowRef<string[]>([]);
const excludeTagFilter = shallowRef<string[]>([]);
const target = shallowRef('');
const maxWorkers = shallowRef('');
const forceStop = shallowRef(true);
const localDiskMigration = shallowRef(true);
const timeout = shallowRef(180);
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');

const actionLabels: Record<NodeBulkAction, string> = {
  startall: gettext('Bulk Start'),
  stopall: gettext('Bulk Shutdown'),
  suspendall: gettext('Bulk Suspend'),
  migrateall: gettext('Bulk Migrate'),
};
const actionButtonLabels: Record<NodeBulkAction, string> = {
  startall: gettext('Start'),
  stopall: gettext('Shutdown'),
  suspendall: gettext('Suspend'),
  migrateall: gettext('Migrate'),
};
const defaultStatus = computed(() => (props.action === 'startall' ? 'stopped' : props.action === 'migrateall' ? '' : 'running'));
const isMigrate = computed(() => props.action === 'migrateall');
const title = computed(() => actionLabels[props.action]);
const filteredResources = computed(() => {
  const query = nameFilter.value.trim().toLowerCase();
  return resources.value.filter((resource) => {
    if (resource.node !== props.node || resource.template || !resource.vmid) return false;
    if (query && !`${resource.name || ''} ${resource.vmid}`.toLowerCase().includes(query)) return false;
    if (statusFilter.value && resource.status !== statusFilter.value) return false;
    if (typeFilter.value && resource.type !== typeFilter.value) return false;
    if (poolFilter.value.length && !poolFilter.value.includes(String(resource.pool || ''))) return false;
    if (haStatusFilter.value.length && !haStatusFilter.value.includes(String(resource.hastate || ''))) return false;
    const tags = String(resource.tags || '').split(/[,; ]/).filter(Boolean);
    if (includeTagFilter.value.length && !tags.some((tag) => includeTagFilter.value.includes(tag))) return false;
    return !excludeTagFilter.value.length || tags.every((tag) => !excludeTagFilter.value.includes(tag));
  });
});
const selectedVmids = computed(() => selected.value.map((resource) => resource.vmid));
const targetOptions = computed(() =>
  nodes.value.filter((item) => item.status === 'online' && item.node !== props.node).map((item) => item.node)
);
const maxWorkersValid = computed(() => maxWorkers.value === '' || (/^\d+$/.test(maxWorkers.value) && Number(maxWorkers.value) >= 1 && Number(maxWorkers.value) <= 64));
const canSubmit = computed(() => selectedVmids.value.length > 0 && maxWorkersValid.value && (!isMigrate.value || !!target.value));
const filterCount = computed(() => [
  nameFilter.value,
  statusFilter.value,
  typeFilter.value,
  poolFilter.value.length,
  haStatusFilter.value.length,
  includeTagFilter.value.length,
  excludeTagFilter.value.length,
].filter(Boolean).length);
const filterTitle = computed(() => filterCount.value ? `${gettext('Filters')} (${filterCount.value})` : gettext('Filters'));
const selectedSummary = computed(() => `${selectedVmids.value.length} ${gettext('Selected')}`);
const filterResources = computed(() => resources.value.filter((resource) => resource.node === props.node && !resource.template && resource.vmid));
function uniqueOptions(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value }));
}
const statusOptions = computed(() => [
  { label: gettext('All'), value: '' },
  ...uniqueOptions(filterResources.value.map((resource) => resource.status)),
]);
const poolOptions = computed(() => uniqueOptions(filterResources.value.map((resource) => resource.pool)));
const haStatusOptions = computed(() => uniqueOptions(filterResources.value.map((resource) => resource.hastate)));
const tagOptions = computed(() => uniqueOptions(filterResources.value.flatMap((resource) => String(resource.tags || '').split(/[,; ]/).filter(Boolean))));
const columns: QTableColumn<VmResource>[] = [
  { name: 'vmid', label: gettext('VM ID'), field: 'vmid', align: 'left', sortable: true },
  { name: 'name', label: gettext('Name'), field: (row) => row.name || '-', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: (row) => row.type === 'lxc' ? gettext('CT') : gettext('VM'), align: 'left' },
  { name: 'status', label: gettext('Status'), field: (row) => row.status || '-', align: 'left' },
];

function selectAllFiltered() {
  selected.value = [...filteredResources.value];
}

function clearFilters() {
  nameFilter.value = '';
  statusFilter.value = '';
  typeFilter.value = '';
  poolFilter.value = [];
  haStatusFilter.value = [];
  includeTagFilter.value = [];
  excludeTagFilter.value = [];
}

async function loadData() {
  if (!props.node) return;
  loading.value = true;
  try {
    const [resourceResponse, nodeResponse] = await Promise.all([getVmResources(), getNodes()]);
    resources.value = resourceResponse.data || [];
    nodes.value = nodeResponse.data || [];
    statusFilter.value = defaultStatus.value;
    nameFilter.value = '';
    typeFilter.value = props.action === 'suspendall' ? 'qemu' : '';
    poolFilter.value = [];
    haStatusFilter.value = [];
    includeTagFilter.value = [];
    excludeTagFilter.value = [];
    target.value = targetOptions.value[0] || '';
    maxWorkers.value = '';
    forceStop.value = true;
    localDiskMigration.value = true;
    timeout.value = 180;
    selectAllFiltered();
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value || !props.node) return;
  submitting.value = true;
  try {
    const data: Record<string, unknown> = {
      vms: selectedVmids.value.join(','),
      ...(maxWorkers.value !== '' ? { [isMigrate.value ? 'maxworkers' : 'max-workers']: Number(maxWorkers.value) } : {}),
    };
    if (props.action === 'startall') data.force = 1;
    if (props.action === 'stopall') Object.assign(data, { 'force-stop': forceStop.value ? 1 : 0, timeout: timeout.value });
    if (isMigrate.value) {
      Object.assign(data, { target: target.value, 'with-local-disks': localDiskMigration.value ? 1 : 0 });
    }
    const response = await runNodeBulkAction(props.node, props.action, data);
    visible.value = false;
    taskUpid.value = response.data || '';
    taskVisible.value = Boolean(taskUpid.value);
    if (!taskUpid.value) emit('completed');
  } finally {
    submitting.value = false;
  }
}

watch(visible, (isVisible) => { if (isVisible) void loadData(); });
watch(
  [nameFilter, statusFilter, typeFilter, poolFilter, haStatusFilter, includeTagFilter, excludeTagFilter],
  () => selectAllFiltered()
);
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="title" width="900px" :loading="loading || submitting">
      <div class="bulk-action-content">
        <section class="bulk-parameters" :aria-label="gettext('Settings')">
          <div class="bulk-section-label">{{ gettext('Settings') }}</div>
          <div class="row q-col-gutter-x-lg q-col-gutter-y-xs items-center">
            <q-select v-if="isMigrate" v-model="target" dense options-dense class="q-field--with-bottom bulk-parameter-field col-6" :options="targetOptions" :label="gettext('Target node')" :rules="[(value) => !!value || gettext('Required field')]" />
            <div v-if="isMigrate" class="col-6 bulk-checkbox-field">
              <q-checkbox v-model="localDiskMigration" dense right-label color="primary" :label="gettext('Allow local disk migration')" />
            </div>
            <div v-if="action === 'stopall'" class="col-6 bulk-checkbox-field">
              <q-checkbox v-model="forceStop" dense right-label color="primary" :label="gettext('Force Stop')" />
              <div class="bulk-field-hint">{{ gettext('Force stop guest if shutdown times out.') }}</div>
            </div>
            <q-input v-if="action === 'stopall'" v-model.number="timeout" dense type="number" min="0" max="7200" class="q-field--with-bottom bulk-parameter-field col-3" :label="gettext('Timeout (s)')" />
            <q-input v-model="maxWorkers" dense type="number" min="1" max="64" class="q-field--with-bottom bulk-parameter-field" :class="action === 'stopall' ? 'col-3' : isMigrate ? 'col-6' : 'col-6'" :label="gettext('Parallel jobs')" :placeholder="gettext('auto')" :error="!maxWorkersValid" :error-message="gettext('Value must be an integer between 1 and 64')" />
          </div>
        </section>
        <q-expansion-item default-opened dense icon="filter_list" :label="filterTitle" header-class="bulk-filter-header">
          <div class="bulk-filter-body row q-col-gutter-x-lg q-col-gutter-y-xs">
            <q-input v-model="nameFilter" dense class="q-field--with-bottom bulk-filter-field col-4" :label="gettext('Name')" />
            <q-select v-model="statusFilter" dense options-dense class="q-field--with-bottom bulk-filter-field col-4" emit-value map-options :options="statusOptions" :label="gettext('Status')" />
            <q-select v-model="poolFilter" dense options-dense multiple emit-value map-options class="q-field--with-bottom bulk-filter-field col-4" :options="poolOptions" :label="gettext('Pool')" />
            <q-select v-model="typeFilter" dense options-dense class="q-field--with-bottom bulk-filter-field col-4" emit-value map-options :options="[{ label: gettext('All'), value: '' }, { label: gettext('VM'), value: 'qemu' }, { label: gettext('CT'), value: 'lxc' }]" :label="gettext('Type')" />
            <q-select v-model="includeTagFilter" dense options-dense multiple emit-value map-options class="q-field--with-bottom bulk-filter-field col-4" :options="tagOptions" :label="gettext('Include Tags')" />
            <q-select v-model="excludeTagFilter" dense options-dense multiple emit-value map-options class="q-field--with-bottom bulk-filter-field col-4" :options="tagOptions" :label="gettext('Exclude Tags')" />
            <q-select v-model="haStatusFilter" dense options-dense multiple emit-value map-options class="q-field--with-bottom bulk-filter-field col-4" :options="haStatusOptions" :label="gettext('HA status')" />
            <div class="col-8 row items-end justify-end bulk-filter-actions">
              <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!filterCount" :label="gettext('Clear Filters')" @click="clearFilters" />
            </div>
          </div>
        </q-expansion-item>
        <section class="bulk-resource-section" :aria-label="gettext('Resources')">
          <div class="bulk-resource-heading">
            <span>{{ gettext('Resources') }}</span>
            <span class="bulk-selection-count">{{ selectedSummary }}</span>
          </div>
          <q-table flat dense row-key="vmid" table-header-class="u-table-header" selection="multiple" hide-bottom :rows="filteredResources" :columns="columns" :selected="selected" :rows-per-page-options="[0]" :no-data-label="gettext('no record can be found')" @update:selected="selected = [...$event]" />
        </section>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps flat size="12px" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :loading="submitting" :disable="!canSubmit" :label="actionButtonLabels[action]" @click="submit" />
      </template>
    </UWindow>
  </q-dialog>
  <TaskOutputDialog v-model="taskVisible" :node="node" :upid="taskUpid" :title="title" @finished="emit('completed')" />
</template>

<style scoped>
.bulk-action-content {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.bulk-parameters {
  padding: 8px 12px 0;
  background: #f8fbff;
  border: 1px solid #dfe1e6;
}

.bulk-section-label,
.bulk-resource-heading {
  color: #333;
  font-size: 12px;
  font-weight: 500;
}

.bulk-section-label {
  margin-bottom: 2px;
}

.bulk-checkbox-field {
  padding-bottom: 4px;
}

.bulk-field-hint {
  margin-top: 1px;
  color: #666;
  font-size: 12px;
}

:deep(.bulk-filter-header) {
  min-height: 36px;
  padding: 0 10px;
  color: #333;
  background: #f2f5fc;
  border: 1px solid #dfe1e6;
  font-size: 12px;
}

.bulk-filter-body {
  padding: 6px 12px 8px;
  border: 1px solid #dfe1e6;
  border-top: 0;
}

.bulk-filter-actions {
  padding-bottom: 4px;
}

.bulk-resource-section {
  border: 1px solid #dfe1e6;
}

.bulk-resource-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 12px;
  background: #f8fbff;
  border-bottom: 1px solid #dfe1e6;
}

.bulk-selection-count {
  color: #666;
  font-weight: 400;
}

:deep(.bulk-resource-section .q-table__middle) {
  max-height: 260px;
}

:deep(.bulk-filter-field.q-field--with-bottom) {
  padding-bottom: 4px;
}

:deep(.bulk-parameter-field.q-field--with-bottom) {
  padding-bottom: 4px;
}

@media (max-width: 700px) {
  .bulk-parameters :deep(.q-field),
  .bulk-parameters > .row > div,
  .bulk-filter-body :deep(.q-field),
  .bulk-filter-body > div {
    flex: 0 0 100%;
    max-width: 100%;
  }
}
</style>
