<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import {
  getNodeJournal,
  getNodeServices,
  reloadNodeService,
  restartNodeService,
  startNodeService,
  stopNodeService,
  type PveService,
} from '@/api/host';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { getTaskStatus } from '@/api/maintenance';
import { useSessionStore } from '@/stores/session';

const { node } = defineProps<{ node: string }>();
const session = useSessionStore();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const rows = shallowRef<PveService[]>([]);
const selected = shallowRef<PveService[]>([]);
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const logVisible = shallowRef(false);
const logLoading = shallowRef(false);
const logService = shallowRef('');
const logLines = shallowRef<string[]>([]);
const filter = shallowRef('');
const selectedService = computed(() => selected.value[0]);
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {}
);
const canModifyServices = computed(() => Boolean(nodeCaps.value['Sys.Modify']));
const filteredRows = computed(() => {
  const search = filter.value.trim().toLocaleLowerCase();
  if (!search) return rows.value;

  return rows.value.filter((service) =>
    [service.service, service.name, service.desc]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(search))
  );
});
const columns: QTableColumn<PveService>[] = [
  { name: 'name', label: gettext('Name'), align: 'left', field: (row) => row.service || row.name },
  { name: 'state', label: gettext('Status'), align: 'left', field: 'state' },
  { name: 'desc', label: gettext('Description'), align: 'left', field: 'desc' },
];

function serviceId(service?: PveService) {
  return service?.service || service?.name || '';
}

function statusLabel(state?: string) {
  const normalized = state || 'unknown';
  const labels: Record<string, string> = {
    active: gettext('Running'),
    running: gettext('Running'),
    inactive: gettext('Stopped'),
    stopped: gettext('Stopped'),
    dead: gettext('Stopped'),
    failed: gettext('Failed'),
    enabled: gettext('Enabled'),
    disabled: gettext('Disabled'),
    static: gettext('Static'),
    masked: gettext('Masked'),
    'not-found': gettext('Not installed'),
    unknown: gettext('Unknown'),
  };

  return labels[normalized] || gettext('Unknown');
}

function statusColor(state?: string) {
  if (state === 'active' || state === 'running' || state === 'enabled') return 'green';
  if (state === 'inactive' || state === 'stopped' || state === 'dead' || state === 'disabled')
    return 'red';
  if (state === 'failed') return 'negative';
  return 'grey';
}

function displayedServiceState(service: PveService) {
  const unitState = service['unit-state'];
  if (unitState === 'masked' || unitState === 'not-found') return unitState;
  return service.state || service['active-state'] || 'unknown';
}

function serviceStatusLabel(service: PveService) {
  const state = displayedServiceState(service);
  const unitState = service['unit-state'];
  if (!unitState || unitState === 'unknown' || unitState === state) return statusLabel(state);
  if (unitState === 'masked' || unitState === 'not-found') return statusLabel(state);
  return `${statusLabel(state)} (${statusLabel(unitState)})`;
}

let taskRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let trackedTaskUpid = '';
let trackedTaskNode = '';

function stopTaskTracking() {
  if (taskRefreshTimer) clearTimeout(taskRefreshTimer);
  taskRefreshTimer = undefined;
  trackedTaskUpid = '';
  trackedTaskNode = '';
}

function scheduleTaskRefresh(upid: string, taskNode: string) {
  if (trackedTaskUpid !== upid || trackedTaskNode !== taskNode) return;
  taskRefreshTimer = setTimeout(() => void refreshTaskState(upid, taskNode), 1000);
}

async function refreshTaskState(upid: string, taskNode: string) {
  if (trackedTaskUpid !== upid || trackedTaskNode !== taskNode) return;
  try {
    const response = await getTaskStatus(taskNode, upid);
    if (response.data?.status !== 'running') {
      stopTaskTracking();
      await loadServices();
      return;
    }
  } catch {
    // Keep tracking: a transient task-status request failure must not prevent a later refresh.
  }
  scheduleTaskRefresh(upid, taskNode);
}

function trackServiceTask(upid: string, taskNode: string) {
  stopTaskTracking();
  trackedTaskUpid = upid;
  trackedTaskNode = taskNode;
  void refreshTaskState(upid, taskNode);
}

async function loadServices() {
  if (!node) return;
  loading.value = true;
  try {
    const response = await getNodeServices(node);
    rows.value = response.data || [];
    const name = serviceId(selectedService.value);
    selected.value = name ? rows.value.filter((row) => serviceId(row) === name) : [];
  } finally {
    loading.value = false;
  }
}

async function changeService(action: 'start' | 'stop' | 'restart' | 'reload') {
  const service = serviceId(selectedService.value);
  if (!service || !canModifyServices.value) return;
  actionLoading.value = true;
  try {
    const actions = {
      start: startNodeService,
      stop: stopNodeService,
      restart: restartNodeService,
      reload: reloadNodeService,
    };
    const response = await actions[action](node, service);
    taskUpid.value = response.data || '';
    taskTitle.value = `${service}: ${gettext(action.charAt(0).toUpperCase() + action.slice(1))}`;
    taskVisible.value = Boolean(taskUpid.value);
    if (taskUpid.value) trackServiceTask(taskUpid.value, node);
    else await loadServices();
  } finally {
    actionLoading.value = false;
  }
}

async function loadServiceLog() {
  if (!node || !logService.value) return;
  logLoading.value = true;
  try {
    const response = await getNodeJournal(node, {
      service: logService.value,
      start: 0,
      limit: 500,
      since: '',
      until: '',
    });
    logLines.value = (response.data || []).map((record) => String(record.t || '')).filter(Boolean);
  } finally {
    logLoading.value = false;
  }
}

function openServiceLog() {
  const service = serviceId(selectedService.value);
  if (!service) return;
  logService.value = service;
  logLines.value = [];
  logVisible.value = true;
  void loadServiceLog();
}

function selectRow(_event: Event, row: PveService) {
  selected.value = serviceId(selectedService.value) === serviceId(row) ? [] : [row];
}

watch(
  () => node,
  () => {
    stopTaskTracking();
    void loadServices();
  },
  { immediate: true }
);

onBeforeUnmount(stopTaskTracking);
</script>

<template>
  <q-table
    flat
    row-key="service"
    selection="single"
    hide-selected-banner
    table-header-class="u-table-header"
    :rows="filteredRows"
    :columns="columns"
    :loading="loading"
    :selected="selected"
    :rows-per-page-options="[0]"
    :no-data-label="gettext('no record can be found')"
    @row-click="selectRow"
    @update:selected="selected = [...$event]"
  >
    <template #top>
      <div class="row q-gutter-sm">
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'primary' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Start')"
          @click="changeService('start')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'red' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Stop')"
          @click="changeService('stop')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'primary' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Restart')"
          @click="changeService('restart')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'primary' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Reload')"
          @click="changeService('reload')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService ? 'primary' : 'grey'"
          :disable="!selectedService"
          :label="gettext('Log')"
          @click="openServiceLog"
        />
        <q-space />
        <q-input
          v-model="filter"
          dense
          outlined
          clearable
          class="node-services-filter"
          :placeholder="gettext('Search')"
        >
          <template #prepend>
            <q-icon
              name="search"
              size="16px"
            />
          </template>
        </q-input>
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :loading="loading"
          :label="gettext('Refresh')"
          @click="loadServices"
        />
      </div>
    </template>
    <template #body-cell-state="props">
      <q-td :props="props">
        <q-badge
          :color="statusColor(displayedServiceState(props.row))"
          :label="serviceStatusLabel(props.row)"
        />
      </q-td>
    </template>
  </q-table>
  <TaskOutputDialog
    v-model="taskVisible"
    :node="node"
    :upid="taskUpid"
    :title="taskTitle"
    @finished="loadServices"
  />
  <q-dialog
    v-model="logVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="`${gettext('System Logs')}: ${logService}`"
      width="900px"
      :loading="logLoading"
    >
      <div class="service-log-toolbar row items-center q-gutter-sm">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :loading="logLoading"
          :label="gettext('Refresh')"
          @click="loadServiceLog"
        />
      </div>
      <q-separator />
      <q-scroll-area class="service-log-content">
        <pre
          v-if="logLines.length"
          class="service-log-lines"
          >{{ logLines.join('\n') }}</pre>
        <div
          v-else
          class="service-log-empty"
        >
          {{ gettext('no record can be found') }}
        </div>
      </q-scroll-area>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.node-services-filter {
  min-width: 220px;
}

.service-log-toolbar {
  min-height: 44px;
  padding: 8px 12px;
}

.service-log-content {
  height: 420px;
  background: #f7f9fc;
}

.service-log-lines {
  margin: 0;
  padding: 10px 14px;
  color: #4b5563;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.service-log-empty {
  padding: 18px;
  color: #666;
  font-size: 13px;
}
</style>
