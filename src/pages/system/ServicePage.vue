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
        :rows="visibleServiceRows"
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
              :color="serviceStatusColor(props.row)"
              :label="serviceStatusText(props.row)"
            />
            <!-- <div
              class="service-state-details"
              :title="serviceStateDetails(props.row)"
            >
              {{ serviceStateDetails(props.row) }}
            </div> -->
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
          <q-checkbox
            v-model="showInstalledOnly"
            dense
            :label="gettext('Show only installed services')"
          />
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
          <q-spinner-bars
            size="14px"
            color="white"
          />
          <div class="text-weight-bold q-mx-sm text-overflow">{{ taskTitle }}</div>
          <q-space />
          <q-btn
            v-close-popup
            class="bg-negative"
            icon="close"
            size="sm"
            flat
            dense
          />
        </q-card-section>
        <q-card-section class="q-pa-md u-hidden-error">
          <div class="text-grey-8 q-mb-xs">{{ gettext('Task started') }}</div>
          <div class="u-border q-pa-sm u-size-12 task-upid">{{ taskUpid || '--' }}</div>
        </q-card-section>
        <q-card-actions
          align="right"
          class="bg-grey-2 overflow-hidden"
        >
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
          <q-spinner-bars
            size="14px"
            color="white"
          />
          <div class="text-weight-bold q-mx-sm text-overflow">
            {{ gettext('System Logs') }}: {{ logServiceName }}
          </div>
          <q-space />
          <q-btn
            v-close-popup
            class="bg-negative"
            icon="close"
            size="sm"
            flat
            dense
          />
        </q-card-section>
        <q-card-section class="q-pa-none u-hidden-error">
          <div class="column q-ma-sm">
            <div class="col q-mb-sm">
              <div class="row q-gutter-sm">
                <q-input
                  v-model="since"
                  square
                  outlined
                  dense
                  class="u-dense date-input"
                  :placeholder="gettext('Since')"
                  @click="sinceDatePopup?.show()"
                >
                  <template #append>
                    <q-icon
                      name="event"
                      size="16px"
                      class="cursor-pointer"
                    >
                      <q-popup-proxy
                        ref="sinceDatePopup"
                        transition-show="scale"
                        transition-hide="scale"
                      >
                        <q-date
                          v-model="since"
                          mask="YYYY-MM-DD"
                        />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
                <q-input
                  v-model="until"
                  square
                  outlined
                  dense
                  class="u-dense date-input"
                  :placeholder="gettext('Until')"
                  @click="untilDatePopup?.show()"
                >
                  <template #append>
                    <q-icon
                      name="event"
                      size="16px"
                      class="cursor-pointer"
                    >
                      <q-popup-proxy
                        ref="untilDatePopup"
                        transition-show="scale"
                        transition-hide="scale"
                      >
                        <q-date
                          v-model="until"
                          mask="YYYY-MM-DD"
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
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
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
const showInstalledOnly = shallowRef(true);
const selectedNode = shallowRef('');
const selectedServices = shallowRef<PveService[]>([]);
const serviceRows = shallowRef<PveService[]>([]);
const taskDialogVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const logsDialogVisible = shallowRef(false);
const logServiceName = shallowRef('');
const since = ref('');
const until = ref('');
const sinceDatePopup = useTemplateRef<{ show: () => void }>('sinceDatePopup');
const untilDatePopup = useTemplateRef<{ show: () => void }>('untilDatePopup');
const logs = shallowRef<string[]>([]);
let refreshHandler: ReturnType<typeof setInterval> | undefined;

const selectedService = computed(() => selectedServices.value[0]);
const visibleServiceRows = computed(() =>
  showInstalledOnly.value
    ? serviceRows.value.filter((service) => service['unit-state'] !== 'not-found')
    : serviceRows.value
);
const canStart = computed(() => canRunServiceAction(selectedService.value, 'start'));
const canStop = computed(() => canRunServiceAction(selectedService.value, 'stop'));
const canRestart = computed(() => canRunServiceAction(selectedService.value, 'restart'));
const logOutput = computed(() => logs.value.join('\n'));

function getCurrentDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function serviceSubState(service: PveService) {
  return service['sub-state'] || service.state || 'unknown';
}

function serviceStatusText(service: PveService) {
  const unitState = service['unit-state'];
  if (unitState === 'masked') return gettext('Disabled');
  if (unitState === 'not-found') return gettext('Not installed');

  const normalized = serviceSubState(service);
  const statusMap: Record<string, string> = {
    running: gettext('Running'),
    dead: gettext('Stopped'),
    failed: gettext('Failed'),
    enabled: gettext('Enabled'),
    disabled: gettext('Disabled'),
    static: gettext('Static'),
    masked: gettext('Masked'),
    'not-found': gettext('Not installed'),
    unknown: gettext('Unknown'),
  };

  return statusMap[normalized] || gettext(normalized);
}

function serviceStatusColor(service: PveService) {
  const unitState = service['unit-state'];
  const state = serviceSubState(service);
  if (unitState === 'masked' || unitState === 'not-found' || state === 'failed') return 'negative';
  if (state === 'running') return 'green';
  if (state === 'dead') return 'grey';
  return 'primary';
}

function serviceStateDetails(service: PveService) {
  return [
    `sub-state: ${serviceSubState(service)}`,
    `active-state: ${service['active-state'] || 'unknown'}`,
    `unit-state: ${service['unit-state'] || 'unknown'}`,
  ].join(' · ');
}

function canRunServiceAction(
  service: PveService | undefined,
  action: 'start' | 'stop' | 'restart'
) {
  if (!service) return false;

  const unitState = service['unit-state'];
  if (unitState === 'masked' || unitState === 'unknown' || unitState === 'not-found') {
    return false;
  }

  const subState = service['sub-state'] || service.state;
  const isRunning = subState ? subState === 'running' : service['active-state'] === 'active';
  if (action === 'start') return !isRunning;
  return isRunning;
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
      ? visibleServiceRows.value.filter((row) => row.name === selectedService.value?.name)
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
    message: `${gettext('Are you sure you want to stop')}: ${selectedNode.value} ${
      selectedService.value.name
    } ?`,
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
  since.value = getCurrentDate(-3);
  until.value = getCurrentDate();
}

async function loadLogs() {
  if (!selectedNode.value || !logServiceName.value) return;

  const sinceDate = since.value || getCurrentDate(-3);
  const untilDate = until.value || getCurrentDate();
  logsLoading.value = true;
  try {
    const response = await getNodeJournal(selectedNode.value, {
      service: logServiceName.value,
      start: 0,
      limit: logLimit,
      since: sinceDate,
      until: `${untilDate} 23:59:59`,
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

watch(showInstalledOnly, () => {
  if (!selectedService.value) return;
  selectedServices.value = visibleServiceRows.value.some(
    (row) => row.name === selectedService.value?.name
  )
    ? selectedServices.value
    : [];
});

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

.date-input {
  width: 140px;
}

.date-input :deep(.q-field__native),
.date-input :deep(.q-field__append) {
  align-self: center;
}

.date-input :deep(.q-field__append) {
  height: 100%;
  display: flex;
  align-items: center;
}

.service-log-output {
  height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  line-height: 18px;
  width: 760px;
}

.service-state-details {
  margin-top: 2px;
  color: #7a8494;
  font-size: 11px;
  line-height: 14px;
}
</style>
