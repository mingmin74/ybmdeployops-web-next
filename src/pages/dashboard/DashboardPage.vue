<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import MetricSparkline from '@/components/MetricSparkline.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { getClusterResources, getClusterStatus } from '@/api/resources';
import { getCephStatus } from '@/api/ceph';
import { getTaskLogs } from '@/api/maintenance';
import { gettext } from '@/locale';
import { formatBytes, formatTaskDescription, textValue, timestampToTime, usedPercent } from '@/utils/pveFormat';

type UsageInfo = {
  used: number;
  total: number;
  percent: number;
};

type GuestStats = {
  online: number;
  offline: number;
  template: number;
};

type RingSlice = {
  key: string;
  color: string;
  dash: string;
  offset: string;
};

const loading = ref(false);
const cephTab = ref('read');
const resources = shallowRef<PveRecord[]>([]);
const clusterStatusRows = shallowRef<PveRecord[]>([]);
const tasks = shallowRef<PveRecord[]>([]);
const cephStatus = shallowRef<PveRecord>({});
const readSeries = ref<number[]>([0, 0]);
const writeSeries = ref<number[]>([0, 0]);
const iopsSeries = ref<number[]>([0, 0]);

const nodes = computed(() => resources.value.filter((item) => item.type === 'node'));
const storages = computed(() => resources.value.filter((item) => item.type === 'storage'));
const qemus = computed(() => resources.value.filter((item) => item.type === 'qemu'));
const lxcs = computed(() => resources.value.filter((item) => item.type === 'lxc'));
const nodeTableRows = computed(() => [...nodes.value].sort((left, right) => textValue(left.node).localeCompare(textValue(right.node))));
const taskTableRows = computed(() => [...tasks.value].sort((left, right) => Number(right.starttime || 0) - Number(left.starttime || 0)));

const clusterName = computed(() => textValue(clusterStatusRows.value.find((item) => item.type === 'cluster')?.name, gettext('Unknown')));
const clusterQuorate = computed(() => Number(clusterStatusRows.value.find((item) => item.type === 'cluster')?.quorate) === 1);
const cephHealth = computed(() => textValue((cephStatus.value.health as PveRecord | undefined)?.status || cephStatus.value.health, 'UNKNOWN'));
const pgmap = computed(() => (cephStatus.value.pgmap || {}) as PveRecord);
const osdmap = computed(() => ((cephStatus.value.osdmap as PveRecord | undefined)?.osdmap || {}) as PveRecord);
const pgsByState = computed(() => (Array.isArray(pgmap.value.pgs_by_state) ? (pgmap.value.pgs_by_state as PveRecord[]) : []));

const clusterCpu = computed(() => {
  const used = nodes.value.reduce((sum, item) => sum + Number(item.cpu || 0) * Number(item.maxcpu || 0), 0);
  const total = nodes.value.reduce((sum, item) => sum + Number(item.maxcpu || 0), 0);
  return makeUsage(used, total);
});
const clusterMem = computed(() => sumUsage(nodes.value, 'mem', 'maxmem'));
const clusterStorage = computed(() => sumUsage(dedupeStorage(storages.value), 'disk', 'maxdisk'));
const cephCapacity = computed(() => makeUsage(Number(pgmap.value.bytes_used || 0), Number(pgmap.value.bytes_total || 0)));

const vmStats = computed(() => countGuests(qemus.value));
const lxcStats = computed(() => countGuests(lxcs.value));
const vmRingSlices = computed(() => makeRingSlices(vmStats.value));
const lxcRingSlices = computed(() => makeRingSlices(lxcStats.value));
const osdStats = computed(() => {
  const total = Number(osdmap.value.num_osds || 0);
  const up = Number(osdmap.value.num_up_osds || 0);
  const inCount = Number(osdmap.value.num_in_osds || 0);
  const down = Math.max(total - up, 0);
  return {
    total,
    upin: Math.min(up, inCount),
    upout: Math.max(up - inCount, 0),
    downin: Math.max(inCount - up, 0),
    downout: Math.max(down - Math.max(inCount - up, 0), 0),
  };
});

const nodeColumns: QTableColumn<PveRecord>[] = [
  { name: 'node', required: true, label: gettext('Node'), align: 'left', field: (row) => row.node || '-', sortable: true },
  { name: 'cpu', label: gettext('CPU Usage'), align: 'left', field: 'cpu' },
  { name: 'mem', label: gettext('Memory Usage'), align: 'left', field: 'mem' },
  { name: 'disk', label: gettext('Disk Usage'), align: 'left', field: 'disk' },
  { name: 'status', label: gettext('Status'), align: 'left', field: (row) => row.status || '-', sortable: true },
];

const taskColumns: QTableColumn<PveRecord>[] = [
  { name: 'status', label: gettext('Status'), align: 'left', field: (row) => row.status || '-', sortable: true },
  { name: 'starttime', label: gettext('Start Time'), align: 'left', field: (row) => timestampToTime(Number(row.starttime) * 1000), sortable: true },
  { name: 'node', label: gettext('Node'), align: 'left', field: (row) => row.node || '-', sortable: true },
  { name: 'user', label: gettext('User'), align: 'left', field: (row) => row.user || '-', sortable: true },
  { name: 'desc', label: gettext('Description'), align: 'left', field: (row) => formatTaskDescription(row.type, row.id), sortable: true },
];

function makeUsage(used: number, total: number): UsageInfo {
  return { used, total, percent: usedPercent(used, total) };
}

function sumUsage(rows: PveRecord[], usedKey: string, totalKey: string) {
  return makeUsage(
    rows.reduce((sum, item) => sum + Number(item[usedKey] || 0), 0),
    rows.reduce((sum, item) => sum + Number(item[totalKey] || 0), 0),
  );
}

function dedupeStorage(rows: PveRecord[]) {
  const seen = new Set<string>();
  return rows.filter((item) => {
    const key = textValue(item.shared ? item.storage : item.id || item.storage);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countGuests(rows: PveRecord[]): GuestStats {
  return rows.reduce<GuestStats>(
    (stats, item) => {
      if (item.template) stats.template += 1;
      else if (Number(item.uptime || 0) > 0) stats.online += 1;
      else stats.offline += 1;
      return stats;
    },
    { online: 0, offline: 0, template: 0 },
  );
}

function makeRingSlices(stats: GuestStats): RingSlice[] {
  const values = [
    { key: 'online', value: stats.online, color: '#21BF4B' },
    { key: 'offline', value: stats.offline, color: '#FF6C59' },
    { key: 'template', value: stats.template, color: '#cfcfcf' },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [{ key: 'empty', color: '#cfcfcf', dash: '100 0', offset: '25' }];

  let offset = 25;
  return values
    .filter((item) => item.value > 0)
    .map((item) => {
      const percent = (item.value / total) * 100;
      const slice = {
        key: item.key,
        color: item.color,
        dash: `${percent} ${100 - percent}`,
        offset: String(offset),
      };
      offset -= percent;
      return slice;
    });
}

function statusColor(value: unknown) {
  const status = textValue(value).toLowerCase();
  if (status === 'online' || status === 'running') return 'green';
  if (status === 'offline' || status === 'stopped' || status === 'error') return 'red';
  return 'grey';
}

function appendMetricSeries(series: typeof readSeries, value: number) {
  if (series.value.length >= 30) series.value.shift();
  series.value.push(value);
}

async function loadData() {
  loading.value = true;
  try {
    const [resourceResponse, clusterResponse, taskResponse, cephStatusResponse] = await Promise.allSettled([
      getClusterResources(),
      getClusterStatus(),
      getTaskLogs(),
      getCephStatus(),
    ]);

    if (resourceResponse.status === 'fulfilled') resources.value = resourceResponse.value.data || [];
    if (clusterResponse.status === 'fulfilled') clusterStatusRows.value = clusterResponse.value.data || [];
    if (taskResponse.status === 'fulfilled') tasks.value = taskResponse.value.data || [];
    if (cephStatusResponse.status === 'fulfilled') {
      cephStatus.value = cephStatusResponse.value.data || {};
      appendMetricSeries(readSeries, Number(pgmap.value.read_bytes_sec || 0));
      appendMetricSeries(writeSeries, Number(pgmap.value.write_bytes_sec || 0));
      appendMetricSeries(iopsSeries, Number(pgmap.value.op_per_sec || 0));
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div class="dashboard-old q-pa-sm">
    <div class="row q-col-gutter-sm">
      <div class="col-4">
        <q-card class="dashboard-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('System Status') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="dashboard-status-body text-center">
            <div class="row">
              <div class="col">
                <div class="text-weight-bold q-py-sm">{{ gettext('Cluster Status') }}</div>
                <q-icon :name="clusterQuorate ? 'check_circle' : 'error'" :color="clusterQuorate ? 'green' : 'red'" size="64px" class="q-py-md" />
                <div class="q-py-sm">{{ gettext('Cluster') }}: {{ clusterName }}，{{ gettext('Quorate') }}: {{ clusterQuorate ? gettext('Yes') : gettext('No') }}</div>
              </div>
              <div class="col">
                <div class="text-weight-bold q-py-sm">{{ gettext('Storage Status') }}</div>
                <q-icon :name="cephHealth.includes('OK') ? 'check_circle' : 'error'" :color="cephHealth.includes('OK') ? 'green' : 'red'" size="64px" class="q-py-md" />
                <div class="q-py-sm">{{ cephHealth }}</div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-5">
        <q-card class="dashboard-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('System Resources') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="q-py-none q-pt-md text-center">
            <div class="row">
              <div class="col"><q-circular-progress class="legacy-gauge" show-value font-size="14px" :value="clusterCpu.percent" size="124px" :thickness="0.18" color="blue" track-color="blue-1">{{ clusterCpu.percent.toFixed(0) }}%</q-circular-progress><div class="q-pb-sm">{{ gettext('of') }} {{ clusterCpu.total }} CPU(s)</div></div>
              <div class="col"><q-circular-progress class="legacy-gauge" show-value font-size="14px" :value="clusterMem.percent" size="124px" :thickness="0.18" color="blue" track-color="blue-1">{{ clusterMem.percent.toFixed(0) }}%</q-circular-progress><div class="q-pb-sm">{{ gettext('Used') }} {{ formatBytes(clusterMem.used) }}，{{ gettext('of') }} {{ formatBytes(clusterMem.total) }}</div></div>
              <div class="col"><q-circular-progress class="legacy-gauge" show-value font-size="14px" :value="clusterStorage.percent" size="124px" :thickness="0.18" color="blue" track-color="blue-1">{{ clusterStorage.percent.toFixed(0) }}%</q-circular-progress><div class="q-pb-sm">{{ gettext('Used') }} {{ formatBytes(clusterStorage.used) }}，{{ gettext('of') }} {{ formatBytes(clusterStorage.total) }}</div></div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-3">
        <q-card class="dashboard-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Client Statistics') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="row q-pa-none dashboard-client-body">
            <div class="col chart-card">
              <div class="client-stat">
                <div class="total-title">{{ gettext('VM Total') }}</div>
                <span class="text-green">{{ gettext('Running') }}({{ vmStats.online }})</span>
                <span class="text-red q-ml-xs">{{ gettext('Stopped') }}({{ vmStats.offline }})</span>
                <span class="text-grey q-ml-xs">{{ gettext('Templates') }}({{ vmStats.template }})</span>
              </div>
              <svg class="client-ring" viewBox="0 0 42 42" aria-hidden="true">
                <circle class="ring-track" cx="21" cy="21" r="15.9155" />
                <circle v-for="slice in vmRingSlices" :key="slice.key" class="ring-slice" cx="21" cy="21" r="15.9155" :stroke="slice.color" :stroke-dasharray="slice.dash" :stroke-dashoffset="slice.offset" />
              </svg>
            </div>
            <div class="col chart-card">
              <div class="client-stat">
                <div class="total-title">{{ gettext('Container Statistics') }}</div>
                <span class="text-green">{{ gettext('Running') }}({{ lxcStats.online }})</span>
                <span class="text-red q-ml-xs">{{ gettext('Stopped') }}({{ lxcStats.offline }})</span>
                <span class="text-grey q-ml-xs">{{ gettext('Templates') }}({{ lxcStats.template }})</span>
              </div>
              <svg class="client-ring" viewBox="0 0 42 42" aria-hidden="true">
                <circle class="ring-track" cx="21" cy="21" r="15.9155" />
                <circle v-for="slice in lxcRingSlices" :key="slice.key" class="ring-slice" cx="21" cy="21" r="15.9155" :stroke="slice.color" :stroke-dasharray="slice.dash" :stroke-dashoffset="slice.offset" />
              </svg>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-sm q-mt-sm">
      <div class="col-2">
        <q-card class="dashboard-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Cluster Storage Capacity') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="text-center dashboard-capacity">
            <q-circular-progress class="legacy-gauge" show-value font-size="14px" :value="cephCapacity.percent" size="150px" :thickness="0.18" color="blue" track-color="blue-1">{{ cephCapacity.percent.toFixed(0) }}%</q-circular-progress>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-6">
        <q-card class="dashboard-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Storage Status') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="q-py-none text-center dashboard-storage-status">
            <div class="row storage-status-row">
              <div class="col q-ma-sm">
                <div class="status-title">{{ gettext('OSDs') }}</div>
                <div class="q-pa-md">
                  <div class="row text-center">
                    <div class="col q-pa-sm u-border-right u-border-bottom"></div>
                    <div class="col q-pa-sm u-border-right u-border-bottom"><q-icon name="circle" class="good" />{{ gettext('Cluster In') }}</div>
                    <div class="col q-pa-sm u-border-bottom"><q-icon name="radio_button_unchecked" class="warning" />{{ gettext('Cluster Out') }}</div>
                  </div>
                  <div class="row text-center">
                    <div class="col q-pa-sm u-border-right u-border-bottom"><q-icon name="arrow_circle_up" class="good" />{{ gettext('Up') }}</div>
                    <div class="col q-pa-sm text-grey-8 u-border-right u-border-bottom">{{ osdStats.upin }}</div>
                    <div class="col q-pa-sm text-grey-8 u-border-bottom">{{ osdStats.upout }}</div>
                  </div>
                  <div class="row text-center">
                    <div class="col q-pa-sm u-border-right"><q-icon name="arrow_circle_down" class="critical" />{{ gettext('Down') }}</div>
                    <div class="col q-pa-sm text-grey-8 u-border-right">{{ osdStats.downin }}</div>
                    <div class="col q-pa-sm text-grey-8">{{ osdStats.downout }}</div>
                  </div>
                </div>
                <div class="total-osd">{{ gettext('Total') }}: {{ osdStats.total }}</div>
              </div>
              <div class="col">
                <q-circular-progress class="legacy-gauge pg-gauge" show-value font-size="13px" :value="usedPercent(Number(pgmap.num_pgs || 0), Math.max(Number(pgmap.num_pgs || 0), 1))" size="150px" :thickness="0.18" color="blue" track-color="blue-1">{{ pgmap.num_pgs || 0 }}</q-circular-progress>
              </div>
              <div class="col q-ma-sm">
                <div class="status-title">{{ gettext('PG Number') }}</div>
                <q-scroll-area class="pg-list q-mt-sm">
                  <div v-for="item in pgsByState" :key="textValue(item.state_name)" class="row">
                    <div class="col-9 text-left text-overflow"><q-icon name="circle" color="primary" size="10px" /> {{ item.state_name }}</div>
                    <div class="col-3 text-right">{{ item.count }}</div>
                  </div>
                </q-scroll-area>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-4">
        <q-card class="dashboard-card no-shadow no-border-radius">
          <q-tabs v-model="cephTab" dense class="text-grey" active-color="primary" indicator-color="primary" align="left" narrow-indicator>
            <q-tab name="read" :label="`${gettext('Read')} (${formatBytes(pgmap.read_bytes_sec as number)})`" />
            <q-tab name="write" :label="`${gettext('Write')} (${formatBytes(pgmap.write_bytes_sec as number)})`" />
            <q-tab name="iops" :label="`IOPS (${pgmap.op_per_sec || 0})`" />
          </q-tabs>
          <q-separator />
          <q-tab-panels v-model="cephTab" animated class="running-panels">
            <q-tab-panel name="read">
              <div class="running-chart u-border-bottom"><MetricSparkline :values="readSeries" :height="180" color="#1976d2" /></div>
              <div class="running-current text-grey-8">{{ gettext('Read') }}: {{ formatBytes(Number(pgmap.read_bytes_sec || 0)) }}</div>
            </q-tab-panel>
            <q-tab-panel name="write">
              <div class="running-chart u-border-bottom"><MetricSparkline :values="writeSeries" :height="180" color="#1976d2" /></div>
              <div class="running-current text-grey-8">{{ gettext('Write') }}: {{ formatBytes(Number(pgmap.write_bytes_sec || 0)) }}</div>
            </q-tab-panel>
            <q-tab-panel name="iops">
              <div class="running-chart u-border-bottom"><MetricSparkline :values="iopsSeries" :height="180" color="#1976d2" /></div>
              <div class="running-current text-grey-8">IOPS: {{ pgmap.op_per_sec || 0 }}</div>
            </q-tab-panel>
          </q-tab-panels>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-sm q-mt-sm">
      <div class="col-6">
        <q-card class="dashboard-table-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Nodes') }} <span class="text-blue">( {{ nodeTableRows.length }} )</span>
          </q-card-section>
          <q-separator />
          <q-card-section class="q-pa-none text-center">
            <q-scroll-area class="nodes-scroll full-width text-grey-8">
              <q-table flat dense row-key="id" table-header-class="u-table-header" class="q-ma-none q-pa-none" :rows="nodeTableRows" :columns="nodeColumns" :pagination="{ rowsPerPage: 0 }" :rows-per-page-options="[0]" :loading="loading" :no-data-label="gettext('no record can be found')">
                <template #body-cell-cpu="scope"><q-td :props="scope"><UsageProgress :percent="usedPercent(Number(scope.row.cpu), 1)" /></q-td></template>
                <template #body-cell-mem="scope"><q-td :props="scope"><UsageProgress :percent="usedPercent(Number(scope.row.mem), Number(scope.row.maxmem))" /></q-td></template>
                <template #body-cell-disk="scope"><q-td :props="scope"><UsageProgress :percent="usedPercent(Number(scope.row.disk), Number(scope.row.maxdisk))" /></q-td></template>
                <template #body-cell-status="scope"><q-td :props="scope"><q-badge :color="statusColor(scope.row.status)" :label="textValue(scope.row.status, '-')" /></q-td></template>
              </q-table>
            </q-scroll-area>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6">
        <q-card class="dashboard-table-card no-shadow no-border-radius">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Running tasks') }} (<span class="text-blue">{{ taskTableRows.length }}</span>)
          </q-card-section>
          <q-separator />
          <q-card-section class="q-pa-none text-center">
            <q-scroll-area class="tasks-scroll text-grey-8">
              <q-table flat dense row-key="upid" table-header-class="u-table-header" class="q-ma-none q-pa-none" :rows="taskTableRows" :columns="taskColumns" :pagination="{ rowsPerPage: 0 }" :rows-per-page-options="[0]" :loading="loading" :no-data-label="gettext('no record can be found')" />
            </q-scroll-area>
          </q-card-section>
        </q-card>
      </div>
    </div>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.dashboard-old {
  color: #333333;
}

.dashboard-card {
  height: 250px;
}

.dashboard-table-card {
  height: 310px;
  overflow: hidden;
}

.dashboard-card-title {
  padding: 8px 16px;
  font-size: 13px;
  color: #333333;
}

.dashboard-card-title :deep(.q-icon) {
  font-size: 16px;
}

.dashboard-status-body,
.dashboard-client-body {
  height: 212px;
  color: #666666;
}

.dashboard-capacity,
.dashboard-storage-status {
  height: 212px;
  color: #666666;
}

.chart-card {
  position: relative;
  border: 1px solid #f1f1f1;
  border-top: 0;
}

.client-stat {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 100%;
  transform: translateX(-50%);
  text-align: center;
  font-size: 12px;
  z-index: 1;
}

.total-title {
  margin-bottom: 4px;
  font-size: 13px;
}

.client-ring {
  display: block;
  width: 100%;
  height: 160px;
  margin-top: 42px;
  transform: rotate(-90deg);
}

.ring-track,
.ring-slice {
  fill: none;
  stroke-width: 8;
}

.ring-track {
  stroke: #f1f1f1;
}

.ring-slice {
  transition: stroke-dasharray 0.2s ease;
}

.legacy-gauge {
  color: #1976d2;
}

.storage-status-row {
  height: 200px;
  font-size: 12px;
}

.status-title {
  font-size: 16px;
  text-align: center;
}

.total-osd {
  font-size: 13px;
  text-align: center;
}

.u-border-right {
  border-right: 1px solid #cccccc;
}

.u-border-bottom {
  border-bottom: 1px solid #cccccc;
}

.good {
  color: #21bf4b;
}

.warning {
  color: #ffcc00;
}

.critical {
  color: #ff6c59;
}

.pg-list {
  height: 150px;
  padding-right: 15px;
  font-size: 12px;
}

:deep(.q-tab-panel) {
  padding: 0;
}

.running-chart {
  height: 180px;
}

.running-current {
  padding: 8px 16px;
  font-size: 12px;
}

.running-chart :deep(.metric-sparkline) {
  border: 0;
  background: #ffffff;
}

.nodes-scroll {
  height: 200px;
}

.tasks-scroll {
  height: 250px;
  padding-right: 15px;
}

:deep(.q-table__top) {
  padding: 0;
}
</style>
