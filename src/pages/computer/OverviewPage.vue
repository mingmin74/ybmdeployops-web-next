<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import LineMetricChart from '@/components/LineMetricChart.vue';
import SelectTable from '@/components/SelectTable.vue';
import UWindow from '@/components/UWindow.vue';
import type { PveNode, PveRecord } from '@/api/resources';
import { getClusterResources, getNodes } from '@/api/resources';
import {
  getVmConfig,
  getVmCurrent,
  getVmGuestAgentInterfaces,
  getVmRrd,
  updateVmConfig,
} from '@/api/overview';
import vmOverviewIcon from '@/assets/overview/left_icon.png';
import lxcOverviewIcon from '@/assets/overview/left4.png';
import { gettext } from '@/locale';
import { formatBytes, textValue, usedPercent } from '@/utils/pveFormat';
import { progressColor } from '@/utils/format';

type TimeOption = {
  label: string;
  value: string;
};

type NetworkInterface = {
  name: string;
  macAddress: string;
  ipInfo: string[];
};

const props = defineProps<{
  fixedNode?: string;
  fixedVmid?: string;
  hideVmSelector?: boolean;
}>();

const loading = shallowRef(false);
const isExistVM = shallowRef(true);
const selectedId = shallowRef('');
const timeType = shallowRef('hour');
const rrdConsolidation = shallowRef<'AVERAGE' | 'MAX'>('AVERAGE');
const agentWin = shallowRef(false);
const vmOptions = shallowRef<PveRecord[]>([]);
const current = shallowRef<PveRecord>({});
const rrdRows = shallowRef<PveRecord[]>([]);
const networkList = shallowRef<NetworkInterface[]>([]);
const nodes = shallowRef<PveNode[]>([]);
const remarkEditing = shallowRef(false);
const remarkSaving = shallowRef(false);
const remarkCollapsed = shallowRef(false);
const remarkText = shallowRef('');
const remarkDraft = shallowRef('');
const configDigest = shallowRef('');
const agentText = shallowRef<string[] | string>('');
const statusTimer = shallowRef<number>();
const chartTimer = shallowRef<number>();

const timeOptions = computed<TimeOption[]>(() => [
  { label: gettext('Hour'), value: 'hour' },
  { label: gettext('Day'), value: 'day' },
  { label: gettext('Week'), value: 'week' },
  { label: gettext('Month'), value: 'month' },
  { label: gettext('Year'), value: 'year' },
]);

const rrdConsolidationOptions = computed(() => [
  { label: gettext('Average'), value: 'AVERAGE' },
  { label: gettext('Maximum'), value: 'MAX' },
]);

const networkColumns = computed<QTableColumn<NetworkInterface>[]>(() => [
  { name: 'name', label: gettext('Name'), align: 'left', field: 'name', sortable: true },
  {
    name: 'mac_address',
    label: gettext('MAC'),
    align: 'left',
    field: 'macAddress',
    sortable: true,
  },
  {
    name: 'ip_address',
    label: gettext('IP Address'),
    align: 'left',
    field: (row) => row.ipInfo.join(', '),
    sortable: true,
  },
]);

const vmColumns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'vmid', label: gettext('VMID'), align: 'left', field: 'vmid', sortable: true },
  {
    name: 'name',
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || '-',
    sortable: true,
  },
  {
    name: 'status',
    label: gettext('Status'),
    align: 'left',
    field: (row) => statusText(row.status),
    sortable: true,
  },
  { name: 'node', label: gettext('Node'), align: 'left', field: 'node', sortable: true },
  {
    name: 'type',
    label: gettext('Type'),
    align: 'left',
    field: (row) => vmTypeText(row.type),
    sortable: true,
  },
]);

const isFixedVm = computed(() => Boolean(props.fixedNode && props.fixedVmid));
const fixedVm = computed<PveRecord>(() => ({
  id: `qemu/${props.fixedVmid || ''}`,
  type: 'qemu',
  node: props.fixedNode,
  vmid: props.fixedVmid,
}));
const selectedVm = computed(
  () =>
    (isFixedVm.value && fixedVm.value) ||
    vmOptions.value.find((item) => resourceId(item) === selectedId.value) ||
    vmOptions.value[0] ||
    {},
);
const selectedType = computed(() =>
  isFixedVm.value || selectedVm.value.type !== 'lxc' ? 'qemu' : 'lxc',
);
const overviewIllustration = computed(() =>
  selectedType.value === 'lxc' ? lxcOverviewIcon : vmOverviewIcon,
);
const vmName = computed(() => textValue(current.value.name || selectedVm.value.name, '-'));
const vmid = computed(() => textValue(current.value.vmid || selectedVm.value.vmid, '-'));
const nodeName = computed(() => textValue(selectedVm.value.node || current.value.node, '-'));
const currentStatus = computed(() =>
  textValue(
    current.value.qmpstatus && current.value.qmpstatus !== current.value.status
      ? `${textValue(current.value.status)}(${textValue(current.value.qmpstatus)})`
      : current.value.status || selectedVm.value.status,
    '-',
  ),
);
const cpuPercent = computed(() =>
  Number((Number(current.value.cpu || selectedVm.value.cpu || 0) * 100).toFixed(2)),
);
const memPercent = computed(() =>
  usedPercent(
    current.value.mem as number,
    (current.value.maxmem || selectedVm.value.maxmem) as number,
  ),
);
const diskPercent = computed(() =>
  usedPercent(
    current.value.disk as number,
    (current.value.maxdisk || selectedVm.value.maxdisk) as number,
  ),
);
const primaryIp = computed(() => {
  if (Array.isArray(agentText.value)) return agentText.value[0] || '-';
  return agentText.value || '-';
});
const remark = computed(() => remarkText.value || '-');
const currentNode = computed(() => nodes.value.find((item) => item.node === nodeName.value));
const hostMemPercent = computed(() =>
  usedPercent(currentNode.value?.mem as number, currentNode.value?.maxmem as number),
);
const haStatus = computed(() => {
  const ha = current.value.ha as PveRecord | undefined;
  if (!ha || !ha.managed) return gettext('None');
  return `${textValue(ha.state, gettext('None'))}, ${gettext('Group')}:${textValue(
    ha.group,
    gettext('None'),
  )}`;
});
const agentHasMore = computed(() => Array.isArray(agentText.value) && agentText.value.length > 0);
const cpuValues = computed(() => rrdRows.value.map((item) => Number(item.cpu || 0) * 100));
const memoryUsedValues = computed(() => rrdRows.value.map((item) => Number(item.mem || 0)));
const memoryTotalValues = computed(() => rrdRows.value.map((item) => Number(item.maxmem || 0)));
const netInValues = computed(() => rrdRows.value.map((item) => Number(item.netin || 0)));
const netOutValues = computed(() => rrdRows.value.map((item) => Number(item.netout || 0)));
const diskReadValues = computed(() => rrdRows.value.map((item) => Number(item.diskread || 0)));
const diskWriteValues = computed(() => rrdRows.value.map((item) => Number(item.diskwrite || 0)));
const cpuPressureSomeValues = computed(() =>
  rrdRows.value.map((item) => Number(item.pressurecpusome || 0)),
);
const cpuPressureFullValues = computed(() =>
  rrdRows.value.map((item) => Number(item.pressurecpufull || 0)),
);
const ioPressureSomeValues = computed(() =>
  rrdRows.value.map((item) => Number(item.pressureiosome || 0)),
);
const ioPressureFullValues = computed(() =>
  rrdRows.value.map((item) => Number(item.pressureiofull || 0)),
);
const memoryPressureSomeValues = computed(() =>
  rrdRows.value.map((item) => Number(item.pressurememorysome || 0)),
);
const memoryPressureFullValues = computed(() =>
  rrdRows.value.map((item) => Number(item.pressurememoryfull || 0)),
);
const latestTime = computed(() => {
  const row = rrdRows.value[rrdRows.value.length - 1];
  return row?.time ? timestampToMinute(Number(row.time) * 1000) : '-';
});
const chartXAxis = computed(() =>
  rrdRows.value.map((item) => (item.time ? timestampToMinute(Number(item.time) * 1000) : '')),
);
const cpuSeries = computed(() => [
  { name: gettext('CPU Usage'), data: cpuValues.value, color: '#1976d2' },
]);
const memorySeries = computed(() => [
  { name: gettext('Total'), data: memoryTotalValues.value, color: '#8c96a8' },
  { name: gettext('RAM Used'), data: memoryUsedValues.value, color: '#2e7d32' },
]);
const networkSeries = computed(() => [
  { name: gettext('NetIn'), data: netInValues.value, color: '#00838f' },
  { name: gettext('NetOut'), data: netOutValues.value, color: '#1976d2' },
]);
const diskSeries = computed(() => [
  { name: gettext('Disk Read Speed'), data: diskReadValues.value, color: '#ef6c00' },
  { name: gettext('Disk Write Speed'), data: diskWriteValues.value, color: '#c62828' },
]);
const cpuPressureSeries = computed(() => [
  { name: gettext('Some'), data: cpuPressureSomeValues.value, color: '#ffd13e' },
  { name: gettext('Full'), data: cpuPressureFullValues.value, color: '#a61120' },
]);
const ioPressureSeries = computed(() => [
  { name: gettext('Some'), data: ioPressureSomeValues.value, color: '#ffd13e' },
  { name: gettext('Full'), data: ioPressureFullValues.value, color: '#a61120' },
]);
const memoryPressureSeries = computed(() => [
  { name: gettext('Some'), data: memoryPressureSomeValues.value, color: '#ffd13e' },
  { name: gettext('Full'), data: memoryPressureFullValues.value, color: '#a61120' },
]);
const basicInfoRows = computed(() => [
  { label: gettext('Name'), value: `${vmid.value}(${vmName.value})` },
  { label: gettext('Node'), value: nodeName.value },
  { label: gettext('Uptime'), value: formatUptime(current.value.uptime) },
  {
    label: gettext('Status'),
    value: statusText(currentStatus.value),
    tone: statusColor(currentStatus.value),
  },
  { label: gettext('HA Status'), value: haStatus.value },
  {
    label: gettext('Guest Agent Network Information'),
    value: primaryIp.value,
    network: true,
  },
]);

function resourceId(row: PveRecord) {
  return textValue(row.id, `${textValue(row.node)}:${textValue(row.vmid)}:${textValue(row.type)}`);
}

function vmTypeText(type: unknown) {
  const value = textValue(type);
  if (value === 'qemu') return gettext('Virtual Machine');
  if (value === 'lxc') return gettext('Container');
  return textValue(type, '-');
}

function statusText(status: unknown) {
  const value = textValue(status);
  if (value === 'running') return gettext('Running');
  if (value === 'stopped') return gettext('Stopped');
  if (value === 'online') return gettext('Online');
  if (value === 'offline') return gettext('Offline');
  return textValue(status, '-');
}

function statusColor(status: unknown) {
  const value = textValue(status);
  if (value === 'running' || value === 'online') return 'positive';
  if (value === 'stopped' || value === 'offline') return 'negative';
  return 'grey';
}

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function dataSize(value: unknown) {
  return formatBytes(value as number | string);
}

function timestampToMinute(value: number) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function refreshSelectedVm() {
  void refreshData();
}

function openRemarkEditor() {
  remarkDraft.value = remarkText.value;
  remarkEditing.value = true;
}

function cancelRemarkEdit() {
  remarkEditing.value = false;
  remarkDraft.value = remarkText.value;
}

function toggleRemark() {
  remarkCollapsed.value = !remarkCollapsed.value;
}

async function saveRemark() {
  const row = selectedVm.value;
  if (!row.vmid || !row.node) return;

  remarkSaving.value = true;
  try {
    const description = remarkDraft.value.trim();
    const data: PveRecord = configDigest.value ? { digest: configDigest.value } : {};

    if (description) {
      data.description = description;
    } else {
      data.delete = 'description';
    }

    await updateVmConfig(textValue(row.node), textValue(row.vmid), data, selectedType.value);
    remarkText.value = description;
    remarkEditing.value = false;
    await loadVmConfig();
  } finally {
    remarkSaving.value = false;
  }
}

function clearTimers() {
  if (statusTimer.value) window.clearTimeout(statusTimer.value);
  if (chartTimer.value) window.clearTimeout(chartTimer.value);
  statusTimer.value = undefined;
  chartTimer.value = undefined;
}

function scheduleStatusRefresh() {
  if (statusTimer.value) window.clearTimeout(statusTimer.value);
  statusTimer.value = window.setTimeout(() => {
    void loadVMInfo(true);
  }, 1000);
}

function scheduleChartRefresh() {
  if (chartTimer.value) window.clearTimeout(chartTimer.value);
  chartTimer.value = window.setTimeout(() => {
    void loadChartData(true);
  }, 30000);
}

async function loadVmList() {
  loading.value = true;
  try {
    if (isFixedVm.value) {
      vmOptions.value = [fixedVm.value];
      isExistVM.value = true;
      selectedId.value = resourceId(fixedVm.value);
      await Promise.all([refreshData(), loadNodes()]);
      return;
    }

    const resourceResponse = await getClusterResources({ type: 'vm' });
    vmOptions.value = (resourceResponse.data || [])
      .filter((item) => !item.template)
      .sort((a, b) => Number(a.vmid || 0) - Number(b.vmid || 0));
    isExistVM.value = vmOptions.value.length > 0;
    selectedId.value = resourceId(vmOptions.value[0] || {});
    await Promise.all([refreshData(), loadNodes()]);
  } finally {
    loading.value = false;
  }
}

async function loadNodes() {
  try {
    const response = await getNodes();
    nodes.value = response.data || [];
  } catch {
    nodes.value = [];
  }
}

async function refreshData() {
  clearTimers();
  current.value = {};
  rrdRows.value = [];
  networkList.value = [];
  agentText.value = '';
  remarkText.value = '';
  configDigest.value = '';
  await Promise.all([loadVMInfo(), loadChartData(), loadVmConfig()]);
}

async function loadVmConfig() {
  const row = selectedVm.value;
  if (!row.vmid || !row.node) return;

  try {
    const response = await getVmConfig(
      textValue(row.node),
      textValue(row.vmid),
      selectedType.value,
    );
    remarkText.value = textValue(response.data?.description, '');
    configDigest.value = textValue(response.data?.digest, '');
  } catch {
    remarkText.value = '';
    configDigest.value = '';
  }
}

async function loadVMInfo(fromTimer = false) {
  const row = selectedVm.value;
  if (!row.vmid || !row.node) return;
  try {
    const response = await getVmCurrent(
      textValue(row.node),
      textValue(row.vmid),
      selectedType.value,
    );
    current.value = response.data || {};
    await loadGuestAgentInfo();
  } finally {
    if (fromTimer || selectedId.value) scheduleStatusRefresh();
  }
}

async function loadGuestAgentInfo() {
  const row = selectedVm.value;
  if (!current.value.agent) {
    agentText.value = gettext('No Guest Agent configured');
    networkList.value = [];
    return;
  }
  if (current.value.status !== 'running') {
    agentText.value = gettext('Guest Agent is not running');
    networkList.value = [];
    return;
  }

  try {
    const response = await getVmGuestAgentInterfaces(
      textValue(row.node),
      textValue(row.vmid),
      selectedType.value,
    );
    const result = (response.data?.result || []) as PveRecord[];
    networkList.value = parseAgentInterfaces(result);
    const ips = networkList.value
      .flatMap((item) => item.ipInfo)
      .filter((item) => !item.startsWith('fe80:'));
    agentText.value = ips.slice(0, 2);
  } catch {
    agentText.value = gettext('Guest Agent is not running');
    networkList.value = [];
  }
}

async function loadChartData(fromTimer = false) {
  const row = selectedVm.value;
  if (!row.vmid || !row.node) return;
  try {
    const response = await getVmRrd(
      textValue(row.node),
      textValue(row.vmid),
      timeType.value,
      rrdConsolidation.value,
      selectedType.value,
    );
    rrdRows.value = response.data || [];
  } finally {
    if (fromTimer || selectedId.value) scheduleChartRefresh();
  }
}

function parseAgentInterfaces(items: PveRecord[]) {
  return items.map((item) => {
    const addresses = Array.isArray(item['ip-addresses'])
      ? (item['ip-addresses'] as PveRecord[])
      : [];
    return {
      name: textValue(item.name, '-'),
      macAddress: textValue(item['hardware-address'], '-'),
      ipInfo: addresses
        .map((address) => textValue(address['ip-address']))
        .filter((address) => address && address !== '127.0.0.1' && address !== '::1'),
    };
  });
}

onMounted(loadVmList);
onUnmounted(clearTimers);
</script>

<template>
  <div class="q-ma-md computer-overview">
    <div v-if="!isExistVM" class="empty-warning">
      <q-icon name="warning" class="text-red q-mr-sm" size="24px" />{{ gettext('Not found VM') }}
    </div>

    <div class="overview-toolbar">
      <div class="toolbar-controls">
        <SelectTable
          v-if="!hideVmSelector"
          v-model="selectedId"
          row-key="id"
          class="vm-select"
          :rows="vmOptions"
          :columns="vmColumns"
          :display-value="`${nodeName} : ${vmid}`"
          :loading="loading"
          width="560px"
          :get-row-value="resourceId"
          @selected="refreshSelectedVm"
        >
          <template #selected>
            <span class="text-primary text-weight-medium q-mr-xs">{{ nodeName }}</span>
            <span v-if="vmid">: {{ vmid }}</span>
          </template>

          <template #body-cell="scope">
            <q-badge
              v-if="scope.col.name === 'status'"
              :color="statusColor(scope.row.status)"
              :label="scope.value"
            />
            <template v-else>{{ scope.value }}</template>
          </template>
        </SelectTable>
        <q-select
          v-model="timeType"
          square
          outlined
          dense
          emit-value
          map-options
          options-dense
          class="u-dense u-size-12 time-select"
          :options="timeOptions"
          @update:model-value="refreshData"
        />
        <q-select
          v-model="rrdConsolidation"
          square
          outlined
          dense
          emit-value
          map-options
          options-dense
          class="u-dense u-size-12 aggregation-select"
          :options="rrdConsolidationOptions"
          @update:model-value="refreshData"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :loading="loading"
          :label="gettext('Refresh')"
          @click="loadVmList"
        />
      </div>
      <div class="toolbar-meta">
        {{ gettext('Time') }}: <span>{{ latestTime }}</span>
      </div>
    </div>

    <!-- <div class="summary-strip">
      <div v-for="item in statusSummary" :key="item.label" class="summary-item">
        <div class="summary-label">{{ item.label }}</div>
        <q-badge v-if="item.tone" :color="item.tone" class="summary-badge" :label="item.value" />
        <div v-else class="summary-value">{{ item.value }}</div>
      </div>
    </div> -->

    <div
      class="top-overview-grid"
      :class="{ 'top-overview-grid--remark-collapsed': remarkCollapsed }"
    >
      <q-card class="overview-panel base-info-panel no-shadow no-border-radius no-margin">
        <q-card-section class="panel-section">
          <div class="panel-header">
            <span>{{ gettext('Virtual Machine Basic Information') }}</span>
            <span class="panel-subtitle">{{ selectedType.toUpperCase() }}</span>
          </div>
          <div class="base-info-content">
            <div class="vm-illustration">
              <img :src="overviewIllustration" alt="" />
            </div>
            <div class="info-list">
              <div v-for="item in basicInfoRows" :key="item.label" class="info-row">
                <span>{{ item.label }}</span>
                <q-badge
                  v-if="item.tone"
                  :color="item.tone"
                  class="info-badge"
                  :label="item.value"
                />
                <div v-else-if="item.network" class="network-info-value">
                  <strong>{{ item.value }}</strong>
                  <button
                    v-if="agentHasMore"
                    class="link-button"
                    type="button"
                    @click="agentWin = true"
                  >
                    {{ gettext('More') }}&gt;&gt;
                  </button>
                </div>
                <strong v-else>{{ item.value }}</strong>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>



      <q-card class="overview-panel resource-grid-panel no-shadow no-border-radius no-margin">
        <q-card-section class="panel-section">
          <div class="panel-header">
            <span>{{ gettext('System Resources') }}</span>
          </div>
          <div class="resource-card-grid">
            <section class="resource-card resource-card-compare">
              <div class="resource-card-title">{{ gettext('CPU Usage') }}</div>
              <strong>{{ textValue(current.cpus, '0') }} Core</strong>
              <div class="resource-card-meta">
                <span>{{ gettext('Used') }}</span
                ><span>{{ cpuPercent.toFixed(2) }}%</span>
              </div>
              <q-circular-progress
                show-value
                class="resource-card-progress"
                size="68px"
                :thickness="0.18"
                :value="cpuPercent"
                :color="progressColor(cpuPercent)"
                track-color="blue-grey-1"
              >
                {{ cpuPercent.toFixed(0) }}%
              </q-circular-progress>
            </section>
            <section class="resource-card resource-card-compare">
              <div class="resource-card-title">{{ gettext('RAM Usage') }}</div>
              <strong>{{ dataSize(current.maxmem || selectedVm.maxmem) }}</strong>
              <div class="resource-card-meta">
                <span>{{ gettext('Used') }}</span
                ><span>{{ dataSize(current.mem) }}</span>
              </div>
              <q-circular-progress
                show-value
                class="resource-card-progress"
                size="68px"
                :thickness="0.18"
                :value="memPercent"
                :color="progressColor(memPercent)"
                track-color="blue-grey-1"
              >
                {{ memPercent.toFixed(0) }}%
              </q-circular-progress>
            </section>
            <section class="resource-card resource-card-compare">
              <div class="resource-card-title">{{ gettext('Bootdisk Size') }}</div>
              <strong>{{ dataSize(current.maxdisk || selectedVm.maxdisk) }}</strong>
              <div class="resource-card-meta">
                <span>{{ gettext('Used') }}</span
                ><span>{{ dataSize(current.disk) }}</span>
              </div>
              <q-circular-progress
                show-value
                class="resource-card-progress"
                size="68px"
                :thickness="0.18"
                :value="diskPercent"
                :color="progressColor(diskPercent)"
                track-color="blue-grey-1"
              >
                {{ diskPercent.toFixed(0) }}%
              </q-circular-progress>
            </section>
            <section class="resource-card resource-card-compare">
              <div class="resource-card-title">{{ gettext('Host Memory Usage') }}</div>
              <strong>{{ hostMemPercent.toFixed(2) }}%</strong>
              <div class="resource-card-meta">
                <span>{{ gettext('Used') }}</span
                ><span>{{ dataSize(currentNode?.mem) }}</span>
              </div>
              <q-circular-progress
                show-value
                class="resource-card-progress"
                size="68px"
                :thickness="0.18"
                :value="hostMemPercent"
                :color="progressColor(hostMemPercent)"
                track-color="blue-grey-1"
              >
                {{ hostMemPercent.toFixed(0) }}%
              </q-circular-progress>
            </section>
          </div>
        </q-card-section>
      </q-card>

      <q-card
        class="overview-panel remark-panel no-shadow no-border-radius no-margin"
        :class="{ 'remark-panel--collapsed': remarkCollapsed }"
      >
        <q-card-section class="panel-section">
          <div class="panel-header">
            <span>{{ gettext('Remark') }}</span>
            <div class="row items-center no-wrap">
              <q-btn
                flat
                round
                dense
                class="remark-collapse-button"
                size="10px"
                color="primary"
                :icon="remarkCollapsed ? 'expand_more' : 'expand_less'"
                :aria-label="remarkCollapsed ? gettext('Expand') : gettext('Collapse')"
                @click="toggleRemark"
              />
              <q-btn
                flat
                round
                dense
                class="remark-edit-button"
                icon="edit"
                size="10px"
                color="primary"
                @click="openRemarkEditor"
              />
            </div>
          </div>
          <div v-show="!remarkCollapsed" class="remark-content">{{ remark }}</div>
        </q-card-section>
      </q-card>
    </div>

    <div class="row q-col-gutter-sm chart-grid">
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('CPU Usage') }}</strong>
            </div>
            <LineMetricChart
              :x-data="chartXAxis"
              :series="cpuSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Memory Usage') }}</strong>
            </div>
            <LineMetricChart
              :x-data="chartXAxis"
              :series="memorySeries"
              unit-type="bytes"
              power-of-two
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Network Traffic') }}</strong>
            </div>
            <LineMetricChart :x-data="chartXAxis" :series="networkSeries" :height="260" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Disk IO') }}</strong>
            </div>
            <LineMetricChart :x-data="chartXAxis" :series="diskSeries" :height="260" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('CPU Pressure Stall') }}</strong>
            </div>
            <LineMetricChart
              :x-data="chartXAxis"
              :series="cpuPressureSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('IO Pressure Stall') }}</strong>
            </div>
            <LineMetricChart
              :x-data="chartXAxis"
              :series="ioPressureSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Memory Pressure Stall') }}</strong>
            </div>
            <LineMetricChart
              :x-data="chartXAxis"
              :series="memoryPressureSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="agentWin" persistent transition-show="scale" transition-hide="scale">
      <UWindow
        width="680px"
        :title="`${gettext('View')}: ${gettext('Guest Agent Network Information')}`"
        loading
      >
        <q-table
          flat
          style="height: 350px"
          :rows="networkList"
          :columns="networkColumns"
          row-key="name"
          table-header-class="u-table-header"
          hide-pagination
          virtual-scroll
          :rows-per-page-options="[0]"
          :no-data-label="gettext('no record can be found')"
        >
          <template #body-cell-name="props">
            <q-td :props="props"
              ><div class="network-name" :title="props.value">{{ props.value }}</div></q-td
            >
          </template>
          <template #body-cell-ip_address="props">
            <q-td :props="props"
              ><div v-for="item in props.row.ipInfo" :key="item">{{ item }}</div></q-td
            >
          </template>
        </q-table>
      </UWindow>
    </q-dialog>

    <q-dialog
      v-model="remarkEditing"
      persistent
      transition-show="scale"
      transition-hide="scale"
      @hide="cancelRemarkEdit"
    >
      <UWindow width="520px" :title="gettext('Edit Remark')">
        <q-form class="remark-dialog-form u-dense q-ma-sm q-pa-md u-border" @submit="saveRemark">
          <q-input
            v-model="remarkDraft"
            class="q-field--with-bottom"
            dense
            type="textarea"
            autogrow
            label-color="text-grey-8"
            :label="gettext('Remark')"
            maxlength="4096"
          />
        </q-form>
        <template #foot>
          <q-btn no-caps flat size="12px" :label="gettext('Cancel')" @click="cancelRemarkEdit" />
          <q-btn
            no-caps
            flat
            size="12px"
            :class="
              !remarkSaving ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'
            "
            :disable="remarkSaving"
            :loading="remarkSaving"
            :label="gettext('Save')"
            @click="saveRemark"
          />
        </template>
      </UWindow>
    </q-dialog>

    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.computer-overview {
  color: #333333;
}

.empty-warning {
  background: #fff7d6;
  border: 1px solid #f0d986;
  color: #4a4a4a;
  margin-bottom: 10px;
  padding: 12px;
  text-align: center;
}

.overview-toolbar {
  align-items: center;
  background: #ffffff;
  border: 1px solid #dfe1e6;
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  min-height: 44px;
  padding: 6px 8px;
}

.toolbar-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-meta {
  color: #666666;
  font-size: 12px;
  padding-right: 4px;
}

.toolbar-meta span {
  color: #333333;
  font-weight: 600;
}

.vm-select {
  min-width: 360px;
}

.time-select,
.aggregation-select {
  min-width: 130px;
}

.time-select :deep(.q-field__control),
.time-select :deep(.q-field__marginal),
.aggregation-select :deep(.q-field__control),
.aggregation-select :deep(.q-field__marginal) {
  height: 28px !important;
  min-height: 28px !important;
}

.time-select :deep(.q-field__native),
.time-select :deep(.q-field__input),
.aggregation-select :deep(.q-field__native),
.aggregation-select :deep(.q-field__input) {
  line-height: 28px;
  min-height: 28px !important;
  padding-bottom: 0;
  padding-top: 0;
}

.time-select :deep(.q-field--outlined .q-field__control::before),
.time-select :deep(.q-field--outlined .q-field__control::after),
.aggregation-select :deep(.q-field--outlined .q-field__control::before),
.aggregation-select :deep(.q-field--outlined .q-field__control::after) {
  border: 1px solid #cccccc !important;
}

.summary-strip {
  background: #f7f9fc;
  border: 1px solid #dfe1e6;
  border-top: 2px solid #1976d2;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 10px;
}

.summary-item {
  border-right: 1px solid #dfe1e6;
  min-width: 0;
  padding: 10px 14px;
}

.summary-item:last-child {
  border-right: 0;
}

.summary-label,
.panel-subtitle,
.chart-header span {
  color: #666666;
  font-size: 12px;
}

.summary-value {
  color: #333333;
  font-size: 15px;
  font-weight: 600;
  margin-top: 3px;
  min-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-badge {
  border-radius: 0;
  margin-top: 4px;
}

.overview-panel,
.chart-panel {
  background: #ffffff;
  border: 1px solid #dfe1e6;
}

.overview-panel {
  min-height: 216px;
}

.top-overview-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(390px, 1.2fr) minmax(470px, 1.15fr) minmax(210px, 0.48fr);
  margin-bottom: 10px;
}

.top-overview-grid .overview-panel {
  min-width: 0;
}

.top-overview-grid--remark-collapsed {
  grid-template-columns: minmax(390px, 1.2fr) minmax(470px, 1.15fr) 38px;
}

.base-info-content {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(180px, 0.7fr) minmax(260px, 1.3fr);
  min-height: 176px;
  padding: 12px 16px;
}

.base-info-content .info-list {
  padding: 0;
}

.vm-illustration {
  align-items: center;
  display: flex;
  justify-content: center;
  margin: auto;
  width: 180px;
}

.vm-illustration img {
  display: block;
  height: auto;
  max-height: 170px;
  max-width: 100%;
  object-fit: contain;
}

.resource-card-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 10px;
}

.resource-card {
  background: #fbfcfe;
  border: 1px solid #e1e6ee;
  border-radius: 4px;
  min-height: 124px;
  padding: 12px 14px;
  position: relative;
}

.resource-card-heading {
  align-items: center;
  color: #52657d;
  display: flex;
  gap: 7px;
  min-width: 0;
}

.resource-card-heading .q-icon {
  color: #4e7fac;
  flex: 0 0 auto;
}

.resource-card-title {
  color: #475b73;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-heading > span {
  color: #6c7c90;
  flex: 0 0 auto;
  font-size: 12px;
}

.resource-card strong {
  color: #27384d;
  display: block;
  font-size: 22px;
  line-height: 1.35;
  margin: 8px 0 5px;
}

.resource-card-meta {
  color: #718096;
  display: flex;
  font-size: 12px;
  min-width: 0;
}

.resource-card-meta span:last-child {
  color: #52657d;
  overflow: hidden;
  padding-left: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card:hover {
  border-color: #bfd1e4;
}

.resource-card-compare {
  padding-right: 82px;
}

.resource-card-compare .resource-card-title {
  display: block;
  line-height: 24px;
}

.resource-card-progress {
  color: #52657d;
  font-size: 11px;
  font-weight: 600;
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.network-info-value {
  align-items: center;
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  min-width: 0;
}

.network-info-value strong {
  color: #333333;
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remark-panel {
  max-height: 320px;
  min-height: 216px;
}

.remark-panel--collapsed {
  max-height: none;
  min-height: 216px;
}

.remark-panel--collapsed .panel-section,
.remark-panel--collapsed .panel-header {
  height: 100%;
}

.remark-panel--collapsed .panel-header {
  border-bottom: 0;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 0;
}

.remark-panel--collapsed .panel-header > span {
  writing-mode: vertical-rl;
}

.remark-panel--collapsed .panel-header .row {
  flex-direction: column;
}

.remark-panel--collapsed .remark-edit-button {
  display: none;
}

.remark-content {
  color: #333333;
  font-size: 13px;
  line-height: 1.6;
  max-height: 272px;
  min-height: 160px;
  overflow-y: auto;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}

.remark-dialog-form :deep(.q-field__native),
.remark-dialog-form :deep(.q-field__prefix),
.remark-dialog-form :deep(.q-field__suffix),
.remark-dialog-form :deep(.q-field__input) {
  color: #666666;
  font-size: 12px;
}

.remark-dialog-form :deep(.q-field__control-container .q-field__label) {
  color: #333333;
  font-size: 12px;
}

.remark-dialog-form :deep(.q-field--with-bottom) {
  padding-bottom: 15px;
}

.remark-dialog-form :deep(.q-field__bottom) {
  display: none;
}

.top-panels {
  align-items: stretch;
}

.top-panels > [class*='col-'] {
  display: flex;
}

.top-panels .overview-panel {
  flex: 1;
  height: 100%;
}

.panel-section {
  padding: 0;
}

.panel-header,
.chart-header {
  align-items: center;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
  color: #174f86;
  display: flex;
  justify-content: space-between;
  min-height: 38px;
  padding: 0 14px;
}

.panel-header span:first-child,
.chart-header strong {
  font-size: 13px;
  font-weight: 600;
}

.info-list {
  padding: 10px 14px 12px;
}

.info-row,
.resource-meta-row,
.usage-title {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 30px;
}

.info-row {
  border-bottom: 1px solid #eef1f6;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-row span,
.resource-meta-row span,
.usage-title span {
  color: #666666;
  font-size: 12px;
}

.info-row strong,
.resource-meta-row strong,
.usage-title strong {
  color: #333333;
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-badge {
  border-radius: 0;
}

.resource-section {
  padding-bottom: 12px;
}

.usage-block {
  padding: 12px 14px 4px;
}

.resource-meta-row {
  border-top: 1px solid #eef1f6;
  margin: 8px 14px 0;
  padding-top: 8px;
}

.link-button {
  background: transparent;
  border: 0;
  color: #1976d2;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  padding: 0;
  text-align: right;
}

.link-button:hover,
.link-button:focus-visible {
  text-decoration: underline;
}

.chart-card-section {
  padding: 0;
}

.chart-grid {
  margin-top: 2px;
}

.chart-caption {
  color: #666666;
  font-size: 12px;
  margin-top: 4px;
  text-align: right;
}

.q-field :deep(.q-field__control) {
  background: #ffffff;
}

.network-name {
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: break-all;
}

@media (max-width: 1280px) {
  .top-overview-grid {
    grid-template-columns: minmax(460px, 1.35fr) minmax(260px, 0.65fr);
  }

  .resource-grid-panel {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .resource-card-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .top-overview-grid--remark-collapsed {
    grid-template-columns: minmax(460px, 1fr) 38px;
  }

  .remark-panel {
    grid-column: 2;
    grid-row: 1;
    min-height: 216px;
  }

  .chart-grid > .col-md-6 {
    flex: 0 0 100%;
    max-width: 100%;
  }

  .remark-content {
    min-height: 60px;
  }

  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-item:nth-child(2) {
    border-right: 0;
  }

  .summary-item:nth-child(-n + 2) {
    border-bottom: 1px solid #dfe1e6;
  }
}

@media (max-width: 760px) {
  .top-overview-grid,
  .base-info-content {
    grid-template-columns: 1fr;
  }

  .resource-grid-panel,
  .remark-panel {
    grid-column: auto;
    grid-row: auto;
  }

  .top-overview-grid--remark-collapsed .remark-panel {
    justify-self: end;
    width: 38px;
  }

  .resource-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .base-info-content {
    gap: 12px;
  }

  .vm-illustration {
    width: 150px;
  }
}
</style>
