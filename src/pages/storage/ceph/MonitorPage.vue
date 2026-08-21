<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getClusterNodes } from '@/api/resources';
import {
  changeCephService,
  createCephService,
  destroyCephService,
  getCephManagers,
  getCephMonitors,
  getCephServiceSafety,
  restartCephServices,
} from '@/api/ceph';
import { gettext } from '@/locale';
import UWindow from '@/components/UWindow.vue';
import CephServiceSyslogDialog from './CephServiceSyslogDialog.vue';
import { textValue } from '@/utils/pveFormat';

type ServiceType = 'mon' | 'mgr';
type ConfirmAction = { title: string; message: string; execute: () => Promise<void> };

const loading = ref(false);
const actionLoading = ref(false);
const mons = shallowRef<PveRecord[]>([]);
const mgrs = shallowRef<PveRecord[]>([]);
const nodes = shallowRef<PveRecord[]>([]);
const selectedMons = ref<PveRecord[]>([]);
const selectedMgrs = ref<PveRecord[]>([]);
const createVisible = ref(false);
const createType = ref<ServiceType>('mon');
const createNode = ref('localhost');
const confirmAction = ref<ConfirmAction | null>(null);
const syslogVisible = ref(false);
const syslogNode = ref('');
const syslogService = ref('');
const { node = 'localhost' } = defineProps<{ node?: string }>();

const nodeOptions = computed(() =>
  nodes.value.map((node) => textValue(node.node || node.name)).filter(Boolean),
);
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || row.id || '-',
    sortable: true,
  },
  {
    name: 'host',
    label: gettext('Host'),
    align: 'left',
    field: (row) => row.host || row.hostname || '-',
    sortable: true,
  },
  {
    name: 'status',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.state || row.status || row.health || '-',
    sortable: true,
  },
  {
    name: 'address',
    label: gettext('Address'),
    align: 'left',
    field: (row) => row.addr || row.address || '-',
    sortable: true,
  },
  {
    name: 'version',
    label: gettext('Version'),
    align: 'left',
    field: (row) => row.version || '-',
    sortable: true,
  },
];

function selectedRow(type: ServiceType) {
  return (type === 'mon' ? selectedMons.value : selectedMgrs.value)[0];
}
function serviceName(row: PveRecord) {
  return textValue(row.name || row.id);
}
function serviceHost(row: PveRecord) {
  return textValue(row.host || row.hostname);
}
function serviceState(row: PveRecord) {
  return textValue(row.state || row.status || row.health).toLowerCase();
}
function normalizeRows(value: unknown): PveRecord[] {
  if (Array.isArray(value)) return value as PveRecord[];
  if (value && typeof value === 'object') {
    const payload = value as PveRecord;
    if (Array.isArray(payload.data)) return payload.data as PveRecord[];
    if (Array.isArray(payload.results)) return payload.results as PveRecord[];
  }
  return [];
}
function canStart(type: ServiceType) {
  const row = selectedRow(type);
  return Boolean(row && ['stopped', 'unknown'].includes(serviceState(row)));
}
function canOperate(type: ServiceType) {
  const row = selectedRow(type);
  return Boolean(row && serviceState(row) !== 'stopped');
}

async function refreshData() {
  loading.value = true;
  try {
    const [monResponse, mgrResponse, nodesResponse] = await Promise.allSettled([
      getCephMonitors(node),
      getCephManagers(node),
      getClusterNodes(),
    ]);
    if (monResponse.status === 'fulfilled') mons.value = normalizeRows(monResponse.value.data);
    if (mgrResponse.status === 'fulfilled') mgrs.value = normalizeRows(mgrResponse.value.data);
    if (nodesResponse.status === 'fulfilled') nodes.value = normalizeRows(nodesResponse.value.data);
  } finally {
    loading.value = false;
  }
}

async function runAfterAction(action: () => Promise<unknown>) {
  actionLoading.value = true;
  try {
    await action();
    await refreshData();
  } finally {
    actionLoading.value = false;
  }
}

function requestServiceAction(type: ServiceType, action: 'start' | 'stop' | 'restart') {
  const row = selectedRow(type);
  if (!row) return;
  const execute = () =>
    runAfterAction(() => changeCephService(serviceHost(row), type, serviceName(row), action));
  if (action !== 'stop' || type !== 'mon') {
    void execute();
    return;
  }
  void getCephServiceSafety(serviceHost(row), type, serviceName(row), 'stop').then((response) => {
    const data = response.data || {};
    if (data.safe) void execute();
    else
      confirmAction.value = {
        title: gettext('Warning'),
        message: textValue(data.status, gettext('Stopping this MON may be unsafe.')),
        execute,
      };
  });
}

function requestDestroy(type: ServiceType) {
  const row = selectedRow(type);
  if (!row) return;
  const execute = () =>
    runAfterAction(() => destroyCephService(serviceHost(row), type, serviceName(row)));
  if (type !== 'mon') {
    confirmAction.value = {
      title: gettext('Destroy'),
      message: `${gettext('Destroy')} ${type}.${serviceName(row)}?`,
      execute,
    };
    return;
  }
  void getCephServiceSafety(serviceHost(row), type, serviceName(row), 'destroy').then(
    (response) => {
      const data = response.data || {};
      confirmAction.value = {
        title: gettext('Warning'),
        message: textValue(data.status, `${gettext('Destroy')} mon.${serviceName(row)}?`),
        execute,
      };
    },
  );
}

function requestBulkRestart(type: ServiceType) {
  confirmAction.value = {
    title: gettext('Confirm Cluster-wide Rolling Restart'),
    message: `${gettext('This will restart all')} ${type.toUpperCase()} ${gettext('daemons across the cluster, one by one.')}`,
    execute: () => runAfterAction(() => restartCephServices(type)),
  };
}

function openCreate(type: ServiceType) {
  createType.value = type;
  createNode.value = node;
  createVisible.value = true;
}
async function createService() {
  if (!createNode.value) return;
  await runAfterAction(() => createCephService(createNode.value, createType.value));
  createVisible.value = false;
}
function openSyslog(type: ServiceType) {
  const row = selectedRow(type);
  if (!row) return;
  syslogNode.value = serviceHost(row);
  syslogService.value = `ceph-${type}@${serviceName(row)}`;
  syslogVisible.value = true;
}
async function executeConfirmed() {
  const action = confirmAction.value;
  confirmAction.value = null;
  if (action) await action.execute();
}

watch(
  () => node,
  () => void refreshData(),
  { immediate: true },
);
</script>

<template>
  <div class="column q-gutter-md">
    <q-btn
      no-caps
      outline
      size="12px"
      color="primary"
      class="u-button self-start"
      :loading="loading"
      :label="gettext('Refresh')"
      @click="refreshData"
    />
    <q-table
      v-model:selected="selectedMons"
      flat
      row-key="name"
      selection="single"
      table-header-class="u-table-header"
      :title="gettext('Monitor')"
      :rows="mons"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 5 }"
      :rows-per-page-options="[5]"
    >
      <template #top
        ><div class="text-subtitle2">{{ gettext('Monitor') }}</div>
        <q-space />
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="play_arrow"
            :label="gettext('Start')"
            :disable="!canStart('mon')"
            @click="requestServiceAction('mon', 'start')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="stop"
            :label="gettext('Stop')"
            :disable="!canOperate('mon')"
            @click="requestServiceAction('mon', 'stop')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="refresh"
            :label="gettext('Restart')"
            :disable="!canOperate('mon')"
            @click="requestServiceAction('mon', 'restart')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="restart_alt"
            :label="gettext('Cluster-wide Bulk Restart')"
            @click="requestBulkRestart('mon')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="add"
            :label="gettext('Create')"
            @click="openCreate('mon')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="delete"
            :label="gettext('Destroy')"
            :disable="!selectedRow('mon')"
            @click="requestDestroy('mon')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="article"
            :label="gettext('Syslog')"
            :disable="!selectedRow('mon')"
            @click="openSyslog('mon')"
          /></div
      ></template>
    </q-table>
    <q-table
      v-model:selected="selectedMgrs"
      flat
      row-key="name"
      selection="single"
      table-header-class="u-table-header"
      :title="gettext('Manager')"
      :rows="mgrs"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 5 }"
      :rows-per-page-options="[5]"
    >
      <template #top
        ><div class="text-subtitle2">{{ gettext('Manager') }}</div>
        <q-space />
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="play_arrow"
            :label="gettext('Start')"
            :disable="!canStart('mgr')"
            @click="requestServiceAction('mgr', 'start')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="stop"
            :label="gettext('Stop')"
            :disable="!canOperate('mgr')"
            @click="requestServiceAction('mgr', 'stop')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="refresh"
            :label="gettext('Restart')"
            :disable="!canOperate('mgr')"
            @click="requestServiceAction('mgr', 'restart')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="restart_alt"
            :label="gettext('Cluster-wide Bulk Restart')"
            @click="requestBulkRestart('mgr')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="add"
            :label="gettext('Create')"
            @click="openCreate('mgr')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="delete"
            :label="gettext('Destroy')"
            :disable="!selectedRow('mgr')"
            @click="requestDestroy('mgr')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="article"
            :label="gettext('Syslog')"
            :disable="!selectedRow('mgr')"
            @click="openSyslog('mgr')"
          /></div
      ></template>
    </q-table>
    <q-dialog v-model="createVisible" persistent transition-show="scale" transition-hide="scale"
      ><UWindow
        width="420px"
        :title="`${gettext('Create')} ${createType === 'mon' ? gettext('Monitor') : gettext('Manager')}`"
        :loading="actionLoading"
        ><div class="q-pa-md">
          <q-select
            v-model="createNode"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :label="gettext('Host')"
            :options="nodeOptions.map((node) => ({ label: node, value: node }))"
          />
        </div>
        <template #foot
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Create')"
            @click="createService" /></template></UWindow
    ></q-dialog>
    <q-dialog
      :model-value="Boolean(confirmAction)"
      persistent
      transition-show="scale"
      transition-hide="scale"
      @update:model-value="
        (visible) => {
          if (!visible) confirmAction = null;
        }
      "
      ><UWindow
        width="420px"
        :title="confirmAction?.title || gettext('Confirm')"
        :loading="actionLoading"
        ><div class="q-pa-md">{{ confirmAction?.message }}</div>
        <template #foot
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            @click="confirmAction = null" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-negative text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Confirm')"
            @click="executeConfirmed" /></template></UWindow
    ></q-dialog>
    <CephServiceSyslogDialog
      v-model:visible="syslogVisible"
      :node="syslogNode"
      :service="syslogService"
    />
  </div>
</template>

<style scoped>
</style>
