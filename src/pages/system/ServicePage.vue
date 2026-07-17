<template>
  <q-card class="q-ma-md q-mt-sm no-border-radius no-shadow service-page-card">
    <q-card-section>
      <q-table
        v-model:selected="selectedServices"
        flat
        selection="single"
        hide-selected-banner
        row-key="name"
        table-header-class="u-table-header"
        :rows="serviceRows"
        :columns="serviceColumns"
        :visible-columns="serviceVisibleColumns"
        :rows-per-page-options="[0]"
        :loading="loading"
        :no-data-label="gettext('no record can be found')"
        @row-click="rowClick"
      >
        <template #body-cell-state="props">
          <q-td :props="props">
            <q-badge
              :color="props.row.state === 'running' ? 'green' : 'red'"
              :label="serviceStatusText(props.row.state)"
            />
          </q-td>
        </template>

        <template #top>
          <q-btn
            size="12px"
            no-caps
            outline
            class="bg-white u-button q-mr-sm"
            :disable="!canStart"
            :color="canStart ? 'primary' : 'grey'"
            :label="gettext('Start')"
            :loading="buttonRunning"
            @click="startService"
          />
          <q-btn
            size="12px"
            no-caps
            outline
            class="bg-white u-button q-mr-sm"
            :disable="!canStop"
            :color="canStop ? 'red' : 'grey'"
            :label="gettext('Stop')"
            :loading="buttonRunning"
            @click="stopService"
          />
          <q-btn
            size="12px"
            no-caps
            outline
            class="bg-white u-button q-mr-sm"
            :disable="!canRestart"
            :color="canRestart ? 'primary' : 'grey'"
            :label="gettext('Restart')"
            :loading="buttonRunning"
            @click="restartService"
          />
          <q-btn
            size="12px"
            no-caps
            outline
            class="bg-white u-button q-mr-sm"
            :disable="!selectedService"
            :color="selectedService ? 'primary' : 'grey'"
            :label="gettext('sysLog')"
            :loading="buttonRunning"
            @click="openLogs"
          />
          <q-space />
          <NodeSelectTable
            v-model="selectedNode"
            disable-offline
            @update:model-value="loadServices(true)"
          />
        </template>

        <template #no-data="{ message }">
          <div class="full-width row flex-center text-accent q-gutter-sm">
            <span class="text-grey-6">{{ message }}</span>
          </div>
        </template>
      </q-table>
    </q-card-section>

    <q-dialog
      v-model="taskDialogVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="u-window-card task-dialog-card">
        <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
          <q-spinner-bars size="14px" color="white" />
          <div class="text-weight-bold q-mx-sm text-overflow">{{ taskTitle }}</div>
          <q-space />
          <q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense />
        </q-card-section>
        <q-card-section class="q-pa-md u-hidden-error">
          <div class="text-grey-8 q-mb-xs">{{ gettext('Task started') }}</div>
          <div class="u-border q-pa-sm u-size-12 task-upid">{{ taskUpid || '--' }}</div>
        </q-card-section>
        <q-card-actions align="right" class="bg-grey-2 overflow-hidden">
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Close')"
            @click="loadServices(false)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog
      v-model="logsDialogVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="u-window-card service-log-dialog">
        <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
          <q-spinner-bars size="14px" color="white" />
          <div class="text-weight-bold q-mx-sm text-overflow">
            {{ gettext('System Logs') }}: {{ logServiceName }}
          </div>
          <q-space />
          <q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense />
        </q-card-section>
        <q-card-section class="q-pa-none u-hidden-error">
          <div class="column q-ma-sm">
            <div class="col q-mb-sm">
              <div class="row q-gutter-sm">
                <q-input
                  v-model="logRange"
                  dense
                  square
                  outlined
                  readonly
                  class="u-dense service-log-range"
                  :placeholder="gettext('Time Range')"
                >
                  <template #append>
                    <q-icon name="event" class="cursor-pointer">
                      <q-popup-proxy transition-show="scale" transition-hide="scale">
                        <q-date
                          v-model="logDateRange"
                          range
                          minimal
                          mask="YYYY-MM-DD"
                          @update:model-value="selectLogDateRange"
                        />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
                <q-btn
                  no-caps
                  size="12px"
                  class="u-button u-dense"
                  color="primary"
                  :label="gettext('Update')"
                  :loading="logsLoading"
                  @click="loadLogs"
                />
              </div>
            </div>
            <div class="col">
              <div class="u-border q-pa-sm u-size-12 service-log-output">
                {{ logOutput || gettext('no record can be found') }}
              </div>
              <q-inner-loading :showing="logsLoading" />
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<script setup lang="ts">
import { Dialog } from 'quasar';
import type { QTableColumn } from 'quasar';
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import {
  getNodeJournal,
  getNodeServices,
  restartNodeService,
  startNodeService,
  stopNodeService,
  type PveService,
} from '@/api/host';
import { gettext } from '@/locale';

type DateRangeValue = string | { from?: string; to?: string } | null;

const refreshInterval = 3000;
const logLimit = 10000;
const serviceVisibleColumns = ['name', 'state', 'description'];
const serviceColumns: QTableColumn<PveService>[] = [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
  { name: 'state', label: gettext('Status'), field: 'state', align: 'left' },
  { name: 'description', label: gettext('Description'), field: 'desc', align: 'left' },
];

const loading = shallowRef(false);
const buttonRunning = shallowRef(false);
const logsLoading = shallowRef(false);
const firstLoad = shallowRef(true);
const selectedNode = shallowRef('');
const selectedServices = shallowRef<PveService[]>([]);
const serviceRows = shallowRef<PveService[]>([]);
const taskDialogVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const logsDialogVisible = shallowRef(false);
const logServiceName = shallowRef('');
const logRange = shallowRef('');
const logDateRange = shallowRef<DateRangeValue>(null);
const logs = shallowRef<string[]>([]);
let refreshHandler: ReturnType<typeof setInterval> | undefined;

const selectedService = computed(() => selectedServices.value[0]);
const canStart = computed(() =>
  Boolean(selectedService.value && selectedService.value.state !== 'running'),
);
const canStop = computed(() => selectedService.value?.state === 'running');
const canRestart = computed(() => selectedService.value?.state === 'running');
const logOutput = computed(() => logs.value.join('\n'));

function getCurrentDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function serviceStatusText(status?: string) {
  const normalized = status || 'unknown';
  const statusMap: Record<string, string> = {
    running: gettext('Running'),
    dead: gettext('Dead'),
    failed: gettext('Failed'),
    unknown: gettext('Unknown'),
  };

  return statusMap[normalized] || gettext(normalized);
}

function rowClick(_: Event, row: PveService) {
  selectedServices.value = selectedService.value === row ? [] : [row];
}

function sortByName<T extends { name?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftName = left.name || '';
    const rightName = right.name || '';
    return leftName.localeCompare(rightName);
  });
}

async function loadServices(showLoading = false) {
  if (!selectedNode.value) return;
  if (showLoading) loading.value = true;

  try {
    const response = await getNodeServices(selectedNode.value);
    serviceRows.value = sortByName(response.data || []);
    selectedServices.value = selectedService.value
      ? serviceRows.value.filter((row) => row.name === selectedService.value?.name)
      : [];
  } finally {
    loading.value = false;
  }
}

async function loadInitialData() {
  await loadServices(false);
  firstLoad.value = false;
}

function showTaskProcess(upid?: string, title?: string) {
  taskUpid.value = upid || '';
  taskTitle.value = title || selectedService.value?.name || gettext('Task');
  taskDialogVisible.value = true;
}

async function runServiceAction(action: 'start' | 'stop' | 'restart') {
  if (!selectedService.value || !selectedNode.value) return;

  const serviceName = selectedService.value.name;
  const actionMap = {
    start: startNodeService,
    stop: stopNodeService,
    restart: restartNodeService,
  };

  buttonRunning.value = true;
  loading.value = true;
  try {
    const response = await actionMap[action](selectedNode.value, serviceName);
    showTaskProcess(response.data, serviceName);
  } finally {
    buttonRunning.value = false;
    loading.value = false;
    void loadServices(false);
  }
}

function startService() {
  void runServiceAction('start');
}

function stopService() {
  if (!selectedService.value) return;

  Dialog.create({
    title: gettext('Confirm'),
    message: `${gettext('Are you sure you want to stop')}: ${selectedNode.value} ${selectedService.value.name} ?`,
    cancel: { flat: true, label: gettext('Cancel') },
    ok: { flat: true, label: gettext('Confirm'), color: 'primary' },
    persistent: true,
  }).onOk(() => {
    void runServiceAction('stop');
  });
}

function restartService() {
  void runServiceAction('restart');
}

function resetLogRange() {
  const since = getCurrentDate(-3);
  const until = getCurrentDate();
  logRange.value = `${since} ${gettext('To')} ${until}`;
  logDateRange.value = { from: since, to: until };
}

function selectLogDateRange(value: DateRangeValue) {
  if (typeof value === 'string') {
    logRange.value = `${value} ${gettext('To')} ${value}`;
    return;
  }

  if (value?.from || value?.to) {
    const from = value.from || value.to || '';
    const to = value.to || value.from || '';
    logRange.value = `${from} ${gettext('To')} ${to}`;
  }
}

function parseLogRange() {
  const [since = getCurrentDate(-3), , until = getCurrentDate()] = logRange.value.split(/\s+/);
  return { since, until };
}

async function loadLogs() {
  if (!selectedNode.value || !logServiceName.value) return;

  const { since, until } = parseLogRange();
  logsLoading.value = true;
  try {
    const response = await getNodeJournal(selectedNode.value, {
      service: logServiceName.value,
      start: 0,
      limit: logLimit,
      since,
      until: `${until} 23:59:59`,
    });
    logs.value = (response.data || []).map((record) => record.t || '').filter(Boolean);
  } finally {
    logsLoading.value = false;
  }
}

function openLogs() {
  if (!selectedService.value) return;

  logServiceName.value = selectedService.value.name;
  logs.value = [];
  resetLogRange();
  logsDialogVisible.value = true;
  void loadLogs();
}

onMounted(() => {
  void loadInitialData();
  refreshHandler = setInterval(() => {
    if (!firstLoad.value && !logsDialogVisible.value && !taskDialogVisible.value) {
      void loadServices(false);
    }
  }, refreshInterval);
});

onBeforeUnmount(() => {
  if (refreshHandler) clearInterval(refreshHandler);
});
</script>

<style scoped>
.service-page-card {
  position: relative;
}

.u-window-card {
  border-radius: 0;
}

.task-dialog-card {
  width: 520px;
  max-width: 520px;
}

.task-upid {
  word-break: break-all;
  line-height: 18px;
}

.service-log-dialog {
  width: 780px;
  max-width: 780px;
}

.service-log-range {
  width: 170px;
}

.service-log-output {
  height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  line-height: 18px;
  width: 760px;
}
</style>
