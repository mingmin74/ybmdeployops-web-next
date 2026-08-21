<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { destroyCephPool, getCephPoolDefaults, getCephPools } from '@/api/ceph';
import type { PveRecord } from '@/api/resources';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { formatBytes, textValue } from '@/utils/pveFormat';
import CephPoolEditDialog from './CephPoolEditDialog.vue';

const { node = 'localhost' } = defineProps<{ node?: string }>();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const editVisible = shallowRef(false);
const destroyVisible = shallowRef(false);
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskNode = shallowRef('');
const taskTitle = shallowRef('');
const defaultSize = shallowRef(3);
const defaultMinSize = shallowRef(2);
const editPool = shallowRef<PveRecord>();
const destroyName = shallowRef('');
const destroyConfirmation = shallowRef('');

const selectedPool = computed(() => selected.value[0]);
const totalUsed = computed(() =>
  rows.value.reduce((total, row) => total + Number(row.bytes_used || 0), 0)
);
const destroyConfirmed = computed(() => destroyConfirmation.value === destroyName.value);
const columns: QTableColumn<PveRecord>[] = [
  { name: 'pool', label: gettext('Pool #'), align: 'right', field: 'pool', sortable: true },
  {
    name: 'pool_name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.pool_name || row.name || '-',
    sortable: true,
  },
  { name: 'type', label: gettext('Type'), align: 'left', field: 'type', sortable: true },
  {
    name: 'application',
    label: gettext('Application'),
    align: 'left',
    field: (row) => Object.keys(row.application_metadata || {}).toString(),
    sortable: true,
  },
  {
    name: 'size_min',
    label: `${gettext('Size')}/min`,
    align: 'right',
    field: (row) => `${textValue(row.size, '-')}/${textValue(row.min_size, '-')}`,
    sortable: true,
  },
  {
    name: 'pg_num',
    label: '# of Placement Groups',
    align: 'right',
    field: 'pg_num',
    sortable: true,
  },
  {
    name: 'pg_num_final',
    label: gettext('Optimal # of PGs'),
    align: 'right',
    field: (row) => row.pg_num_final ?? 'n/a',
    sortable: true,
  },
  {
    name: 'pg_num_min',
    label: gettext('Min. # of PGs'),
    align: 'right',
    field: 'pg_num_min',
    sortable: true,
  },
  {
    name: 'target_size_ratio',
    label: gettext('Target Ratio'),
    align: 'right',
    field: (row) => Number(row.target_size_ratio || 0).toFixed(4),
    sortable: true,
  },
  {
    name: 'target_size',
    label: gettext('Target Size'),
    align: 'right',
    field: (row) => formatBytes(row.target_size as number),
    sortable: true,
  },
  {
    name: 'pg_autoscale_mode',
    label: gettext('Autoscaler Mode'),
    align: 'right',
    field: 'pg_autoscale_mode',
    sortable: true,
  },
  {
    name: 'crush_rule_name',
    label: 'CRUSH Rule (ID)',
    align: 'right',
    field: (row) => `${textValue(row.crush_rule_name, '-')} (${textValue(row.crush_rule, '-')})`,
    sortable: true,
  },
  {
    name: 'used',
    label: `${gettext('Used')} (%)`,
    align: 'right',
    field: (row) =>
      `${formatBytes(row.bytes_used as number)} (${(Number(row.percent_used || 0) * 100).toFixed(2)}%)`,
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getCephPools(node);
    rows.value = response.data || [];
  } finally {
    loading.value = false;
  }
}
function openTask(upid: string, fallbackNode: string, title: string) {
  taskUpid.value = upid;
  taskNode.value = upid.split(':')[1] || fallbackNode;
  taskTitle.value = title;
  taskVisible.value = Boolean(upid);
}
async function openCreate() {
  actionLoading.value = true;
  try {
    const response = await getCephPoolDefaults(node);
    const global = (response.data?.global || {}) as PveRecord;
    defaultSize.value = Number(global['osd-pool-default-size']) || 3;
    defaultMinSize.value = Number(global['osd-pool-default-min-size']) || 2;
    editPool.value = undefined;
    editVisible.value = true;
  } finally {
    actionLoading.value = false;
  }
}
function openEdit(pool = selectedPool.value) {
  if (!pool) return;
  editPool.value = pool;
  defaultSize.value = Number(pool.size) || 3;
  defaultMinSize.value = Number(pool.min_size) || 2;
  editVisible.value = true;
}
function openDestroy() {
  const pool = selectedPool.value;
  if (!pool) return;
  destroyName.value = textValue(pool.pool_name || pool.name);
  destroyConfirmation.value = '';
  destroyVisible.value = true;
}
async function destroyPool() {
  if (!destroyConfirmed.value) return;
  actionLoading.value = true;
  try {
    const response = await destroyCephPool(node, destroyName.value, true);
    destroyVisible.value = false;
    selected.value = [];
    openTask(textValue(response.data), node, `${gettext('Destroy')}: ${gettext('Ceph Pool')}`);
  } finally {
    actionLoading.value = false;
  }
}
function submitted(upid: string, title: string) {
  openTask(upid, node, title);
}
watch(
  () => node,
  () => {
    selected.value = [];
    void refreshData();
  },
  { immediate: true }
);
</script>

<template>
  <q-table
    v-model:selected="selected"
    flat
    row-key="pool_name"
    selection="single"
    table-header-class="u-table-header"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    :pagination="{ page: 1, rowsPerPage: 10 }"
    :rows-per-page-options="[10]"
    :no-data-label="gettext('no record can be found')"
    @row-dblclick="(_event, row) => openEdit(row)"
  >
    <template #top>
      <div class="text-subtitle2">{{ gettext('Resource Pool') }}</div>
      <q-space />
      <div class="row q-gutter-sm">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          icon="add"
          :loading="actionLoading"
          :label="gettext('Create')"
          @click="openCreate"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          icon="edit"
          :disable="!selectedPool"
          :label="gettext('Edit')"
          @click="openEdit()"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="negative"
          class="u-button"
          icon="delete"
          :disable="!selectedPool"
          :label="gettext('Destroy')"
          @click="openDestroy"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Refresh')"
          @click="refreshData"
        />
      </div>
    </template>
    <template #body-cell-pg_num_final="props">
      <q-td :props="props">
        <template v-if="props.row.pg_num_final !== undefined && props.row.pg_num_final !== null">
          {{ props.row.pg_num_final }}
        </template>
        <span
          v-else
          class="faded"
        >
          <q-icon
            name="info"
            size="14px"
          />
          n/a
          <q-tooltip>{{ gettext('Needs pg_autoscaler module enabled.') }}</q-tooltip>
        </span>
      </q-td>
    </template>
    <template #body-cell-target_size="props">
      <q-td :props="props">
        <span :class="{ faded: Number(props.row.target_size_ratio) > 0 }">
          {{ formatBytes(props.row.target_size as number) }}
          <q-tooltip v-if="Number(props.row.target_size_ratio) > 0">
            {{ gettext('Target Size Ratio takes precedence over Target Size.') }}
          </q-tooltip>
        </span>
      </q-td>
    </template>
    <template #bottom-row>
      <q-tr class="text-right">
        <q-td :colspan="columns.length - 1" />
        <q-td>{{ formatBytes(totalUsed) }}</q-td>
      </q-tr>
    </template>
  </q-table>
  <CephPoolEditDialog
    v-model="editVisible"
    :node="node"
    :pool="editPool"
    :default-size="defaultSize"
    :default-min-size="defaultMinSize"
    @submitted="submitted"
  />
  <q-dialog
    v-model="destroyVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      width="460px"
      :title="`${gettext('Destroy')}: ${gettext('Ceph Pool')}`"
      :loading="actionLoading"
    >
      <div class="q-pa-md">
        <div class="q-mb-md">{{ gettext('This action cannot be undone.') }}</div>
        <div class="q-mb-sm">
          {{ gettext('Please enter the pool name to confirm destruction.') }}:
          <strong>{{ destroyName }}</strong>
        </div>
        <q-input
          v-model="destroyConfirmation"
          dense
          autofocus
          class="q-field--with-bottom"
          :label="gettext('Name')"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-negative text-grey-1 u-button"
          :disable="!destroyConfirmed"
          :loading="actionLoading"
          :label="gettext('Destroy')"
          @click="destroyPool"
        />
      </template>
    </UWindow>
  </q-dialog>
  <TaskOutputDialog
    v-model="taskVisible"
    :node="taskNode"
    :upid="taskUpid"
    :title="taskTitle"
    @finished="refreshData"
  />
</template>
