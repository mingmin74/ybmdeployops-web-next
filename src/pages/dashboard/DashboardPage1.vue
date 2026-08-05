<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef } from 'vue';
import UsageProgress from '@/components/UsageProgress.vue';
import LegacyGaugeChart from './components/LegacyGaugeChart.vue';
import LegacyRingChart from './components/LegacyRingChart.vue';
import LegacyRunningChart from './components/LegacyRunningChart.vue';
import type { PveRecord } from '@/api/resources';
import { getClusterResources, getClusterStatus } from '@/api/resources';
import { getCephMetadata, getCephStatus } from '@/api/ceph';
import { getTaskLogs } from '@/api/maintenance';
import { gettext } from '@/locale';
import {
  formatBytes,
  formatTaskDescription,
  textValue,
  timestampToTime,
  usedPercent,
} from '@/utils/pveFormat';

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

type RunningChartData = {
  xList: string[];
  yList: number[];
  xLabel: string;
  yLabel: string;
};

type PgStateClass = 'faded' | 'good' | 'warning' | 'critical';
type ServiceHealth =
  'HEALTH_UNKNOWN' | 'HEALTH_ERR' | 'HEALTH_WARN' | 'HEALTH_UPGRADE' | 'HEALTH_OLD' | 'HEALTH_OK';

type CephServiceItem = {
  id: string;
  name: string;
  health: ServiceHealth;
  text: string;
};

const loading = shallowRef(false);
const cephTab = shallowRef('read');
const cephVersion = shallowRef<'hammer' | 'jewel'>('hammer');
const resources = shallowRef<PveRecord[]>([]);
const clusterStatusRows = shallowRef<PveRecord[]>([]);
const tasks = shallowRef<PveRecord[]>([]);
const cephStatus = shallowRef<PveRecord>({});
const cephMetadata = shallowRef<PveRecord>({});
const iopsChart = shallowRef(initRunningChart());
const readsChart = shallowRef(initRunningChart());
const writesChart = shallowRef(initRunningChart());
const readIopsChart = shallowRef(initRunningChart());
const writeIopsChart = shallowRef(initRunningChart());

const nodes = computed(() => resources.value.filter((item) => item.type === 'node'));
const storages = computed(() => resources.value.filter((item) => item.type === 'storage'));
const qemus = computed(() => resources.value.filter((item) => item.type === 'qemu'));
const lxcs = computed(() => resources.value.filter((item) => item.type === 'lxc'));
const nodeTableRows = computed(() =>
  [...nodes.value].sort((left, right) => textValue(left.node).localeCompare(textValue(right.node))),
);
const taskTableRows = computed(() =>
  [...tasks.value].sort(
    (left, right) => Number(right.starttime || 0) - Number(left.starttime || 0),
  ),
);

const clusterName = computed(() =>
  textValue(
    clusterStatusRows.value.find((item) => item.type === 'cluster')?.name,
    gettext('Unknown'),
  ),
);
const clusterQuorate = computed(
  () => Number(clusterStatusRows.value.find((item) => item.type === 'cluster')?.quorate) === 1,
);
const cephHealth = computed(() =>
  textValue(
    (cephStatus.value.health as PveRecord | undefined)?.status || cephStatus.value.health,
    'UNKNOWN',
  ),
);
const pgmap = computed(() => (cephStatus.value.pgmap || {}) as PveRecord);
const osdmap = computed(
  () => ((cephStatus.value.osdmap as PveRecord | undefined)?.osdmap || {}) as PveRecord,
);
const pgsByState = computed(() =>
  Array.isArray(pgmap.value.pgs_by_state) ? (pgmap.value.pgs_by_state as PveRecord[]) : [],
);
const pgsByStateRows = computed<{ state_name: string; count: number; cls: PgStateClass }[]>(() =>
  pgsByState.value.map((item) => ({
    state_name: textValue(item.state_name),
    count: Number(item.count || 0),
    cls: pgStateClass(textValue(item.state_name)),
  })),
);

const clusterCpu = computed(() => {
  const used = nodes.value.reduce(
    (sum, item) => sum + Number(item.cpu || 0) * Number(item.maxcpu || 0),
    0,
  );
  const total = nodes.value.reduce((sum, item) => sum + Number(item.maxcpu || 0), 0);
  return makeUsage(used, total);
});
const clusterMem = computed(() => sumUsage(nodes.value, 'mem', 'maxmem'));
const clusterStorage = computed(() => sumUsage(dedupeStorage(storages.value), 'disk', 'maxdisk'));
const cephCapacity = computed(() =>
  makeUsage(Number(pgmap.value.bytes_used || 0), Number(pgmap.value.bytes_total || 0)),
);
const cephCapacityName = computed(
  () => `${formatBytes(cephCapacity.value.used)} of ${formatBytes(cephCapacity.value.total)}`,
);

const vmStats = computed(() => countGuests(qemus.value));
const lxcStats = computed(() => countGuests(lxcs.value));
const vmCount = computed(() => makeGuestChartData(vmStats.value));
const lxcCount = computed(() => makeGuestChartData(lxcStats.value));
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
const cephServices = computed(() => ({
  mon: buildServiceItems('mon'),
  mgr: buildServiceItems('mgr'),
  mds: buildServiceItems('mds'),
}));

const nodeColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'node',
    required: true,
    label: gettext('Node'),
    align: 'left',
    field: (row) => row.node || '-',
    sortable: true,
  },
  { name: 'cpu', label: gettext('CPU Usage'), align: 'left', field: 'cpu' },
  { name: 'mem', label: gettext('Memory Usage'), align: 'left', field: 'mem' },
  { name: 'disk', label: gettext('Disk Usage'), align: 'left', field: 'disk' },
  {
    name: 'status',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.status || '-',
    sortable: true,
  },
];

const taskColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'status',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.status || '-',
    sortable: true,
  },
  {
    name: 'starttime',
    label: gettext('Start Time'),
    align: 'left',
    field: (row) => timestampToTime(Number(row.starttime) * 1000),
    sortable: true,
  },
  {
    name: 'node',
    label: gettext('Node'),
    align: 'left',
    field: (row) => row.node || '-',
    sortable: true,
  },
  {
    name: 'user',
    label: gettext('User'),
    align: 'left',
    field: (row) => row.user || '-',
    sortable: true,
  },
  {
    name: 'desc',
    label: gettext('Description'),
    align: 'left',
    field: (row) => formatTaskDescription(row.type, row.id),
    sortable: true,
  },
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

function makeGuestChartData(stats: GuestStats) {
  return [
    { state_name: gettext('Running'), count: stats.online, cls: 'good' as const },
    { state_name: gettext('Stopped'), count: stats.offline, cls: 'critical' as const },
    { state_name: gettext('Templates'), count: stats.template, cls: 'faded' as const },
  ];
}

function buildServiceItems(type: 'mon' | 'mgr' | 'mds'): CephServiceItem[] {
  const group = (cephMetadata.value[type] || {}) as Record<string, PveRecord>;
  return Object.keys(group)
    .map((id) => {
      const item = group[id] || {};
      const name = textValue(item.name || id.split('@')[0] || id);
      const host = textValue(id.split('@')[1] || item.host || gettext('Unknown'));
      const addr = textValue(item.addr || item.addrs || gettext('Unknown'));
      const version = serviceVersion(item);
      return {
        id,
        name,
        health: serviceHealth(item),
        text: serviceTooltipText(type, name, host, addr, version, item),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function serviceVersion(item: PveRecord) {
  if (typeof item.version === 'string') return item.version;
  const cephVersion = item.ceph_version as PveRecord | undefined;
  return textValue(cephVersion?.version || cephVersion?.release || item.version);
}

function serviceTooltipText(
  type: 'mon' | 'mgr' | 'mds',
  name: string,
  host: string,
  addr: string,
  version: string,
  item: PveRecord,
) {
  const lines = [`${gettext('Host')}: ${host}`, `${gettext('Address')}: ${addr}`];
  const status = serviceStatusText(type, name, item);
  if (status) lines.push(`${gettext('Status')}: ${status}`);
  if (version) lines.push(`${gettext('Version')}: ${version}`);
  return lines.join('<br>');
}

function serviceStatusText(type: 'mon' | 'mgr' | 'mds', name: string, item: PveRecord) {
  if (type === 'mgr') {
    const mgrmap = cephStatus.value.mgrmap as PveRecord | undefined;
    if (mgrmap?.active_name === name) return 'active';
    const standbys = Array.isArray(mgrmap?.standbys) ? (mgrmap.standbys as PveRecord[]) : [];
    if (standbys.some((mgr) => mgr.name === name)) return 'standby';
  }

  if (type === 'mds') {
    const fsmap = cephStatus.value.fsmap as PveRecord | undefined;
    const ranks = Array.isArray(fsmap?.by_rank) ? (fsmap.by_rank as PveRecord[]) : [];
    const mds = ranks.find((rank) => rank.name === name);
    if (mds) return `rank: ${textValue(mds.rank)}; ${textValue(mds.status)}`;
    if (textValue(item.addr || item.addrs) !== gettext('Unknown')) return 'standby';
  }

  return textValue(item.status || item.state);
}

function serviceHealth(item: PveRecord): ServiceHealth {
  const health = textValue(item.health || item.status || item.state).toUpperCase();
  if (health.includes('ERR') || health.includes('CRITICAL') || health.includes('DOWN'))
    return 'HEALTH_ERR';
  if (health.includes('WARN')) return 'HEALTH_WARN';
  if (health.includes('UPGRADE')) return 'HEALTH_UPGRADE';
  if (health.includes('OLD')) return 'HEALTH_OLD';
  if (item.service && !item.version) return 'HEALTH_UNKNOWN';
  return 'HEALTH_OK';
}

function serviceIcon(health: ServiceHealth) {
  if (health === 'HEALTH_OK') return 'fa-solid fa-check';
  if (health === 'HEALTH_ERR') return 'fa-solid fa-xmark';
  if (health === 'HEALTH_WARN') return 'fa-solid fa-exclamation';
  if (health === 'HEALTH_UPGRADE') return 'fa-solid fa-upload';
  if (health === 'HEALTH_OLD') return 'fa-solid fa-rotate-right';
  return 'fa-solid fa-question';
}

function serviceIconClass(health: ServiceHealth) {
  if (health === 'HEALTH_OK') return 'good';
  if (health === 'HEALTH_ERR') return 'critical';
  if (health === 'HEALTH_WARN' || health === 'HEALTH_UPGRADE' || health === 'HEALTH_OLD')
    return 'warning';
  return 'faded';
}

function initRunningChart(): RunningChartData {
  return {
    xList: initChartXTime(30, 3),
    yList: Array.from({ length: 30 }, () => 0),
    xLabel: `${gettext('Time')}: `,
    yLabel: `${gettext('Speed')}: `,
  };
}

function initChartXTime(count: number, step: number) {
  const times: string[] = [];
  const date = new Date();
  for (let i = 0; i < count; i += 1) {
    const item = new Date(date.getTime() - (count - i) * step * 1000);
    times[i] = `${item.getHours()}:${item.getMinutes()}:${item.getSeconds()}`;
  }
  return times;
}

function currentTimeText() {
  const date = new Date();
  return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

function appendRunningChart(chart: typeof readsChart, value: number) {
  chart.value = {
    ...chart.value,
    xList: [...chart.value.xList.slice(-29), currentTimeText()],
    yList: [...chart.value.yList.slice(-29), Number.isFinite(value) ? value : 0],
  };
}

function latestValue(chart: RunningChartData) {
  return chart.yList[chart.yList.length - 1] || 0;
}

function rateLabel(chart: RunningChartData) {
  return `${formatBytes(latestValue(chart))}/S`;
}

function iopsLabel(chart: RunningChartData) {
  return formatBytes(latestValue(chart)).replace('B', '');
}

function pgStateClass(stateName: string): PgStateClass {
  const pgstates: Record<string, number> = {
    clean: 1,
    active: 1,
    activating: 2,
    backfill_wait: 2,
    backfilling: 2,
    creating: 2,
    deep: 2,
    degraded: 2,
    forced_backfill: 2,
    forced_recovery: 2,
    peered: 2,
    peering: 2,
    recovering: 2,
    recovery_wait: 2,
    repair: 2,
    scrubbing: 2,
    snaptrim: 2,
    snaptrim_wait: 2,
    backfill_toofull: 3,
    backfill_unfound: 3,
    down: 3,
    incomplete: 3,
    inconsistent: 3,
    recovery_toofull: 3,
    recovery_unfound: 3,
    remapped: 3,
    snaptrim_error: 3,
    stale: 3,
    undersized: 3,
  };
  const level = stateName
    .split(/[^a-z]+/)
    .reduce((result, item) => Math.max(result, pgstates[item] || 0), 0);
  if (level === 1) return 'good';
  if (level === 2) return 'warning';
  if (level === 3) return 'critical';
  return 'faded';
}

function statusColor(value: unknown) {
  const status = textValue(value).toLowerCase();
  if (status === 'online' || status === 'running') return 'green';
  if (status === 'offline' || status === 'stopped' || status === 'error') return 'red';
  return 'grey';
}

async function loadData() {
  loading.value = true;
  try {
    const [
      resourceResponse,
      clusterResponse,
      taskResponse,
      cephStatusResponse,
      cephMetadataResponse,
    ] = await Promise.allSettled([
      getClusterResources(),
      getClusterStatus(),
      getTaskLogs(),
      getCephStatus(),
      getCephMetadata(),
    ]);

    if (resourceResponse.status === 'fulfilled')
      resources.value = resourceResponse.value.data || [];
    if (clusterResponse.status === 'fulfilled')
      clusterStatusRows.value = clusterResponse.value.data || [];
    if (taskResponse.status === 'fulfilled') tasks.value = taskResponse.value.data || [];
    if (cephMetadataResponse.status === 'fulfilled')
      cephMetadata.value = cephMetadataResponse.value.data || {};
    if (cephStatusResponse.status === 'fulfilled') {
      cephStatus.value = cephStatusResponse.value.data || {};
      const iops = Number(pgmap.value.op_per_sec || 0);
      const readIops = Number(pgmap.value.read_op_per_sec || 0);
      const writeIops = Number(pgmap.value.write_op_per_sec || 0);
      appendRunningChart(iopsChart, iops);
      appendRunningChart(readsChart, Number(pgmap.value.read_bytes_sec || 0));
      appendRunningChart(writesChart, Number(pgmap.value.write_bytes_sec || 0));
      appendRunningChart(readIopsChart, readIops);
      appendRunningChart(writeIopsChart, writeIops);
      if (pgmap.value.op_per_sec !== undefined) cephVersion.value = 'hammer';
      else if (
        pgmap.value.read_op_per_sec !== undefined ||
        pgmap.value.write_op_per_sec !== undefined
      )
        cephVersion.value = 'jewel';
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
        <q-card class="dashboard-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('System Status') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="dashboard-status-body text-center">
            <div class="row">
              <div class="col">
                <div class="text-weight-bold q-py-sm">{{ gettext('Cluster Status') }}</div>
                <div class="q-py-md">
                  <q-icon
                    :name="clusterQuorate ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'"
                    :class="clusterQuorate ? 'good' : 'critical'"
                    class="legacy-status-icon"
                  />
                </div>
                <div class="q-py-sm">
                  {{ gettext('Cluster') }}: {{ clusterName }}，{{ gettext('Quorate') }}:
                  {{ clusterQuorate ? gettext('Yes') : gettext('No') }}
                </div>
              </div>
              <div class="col">
                <div class="text-weight-bold q-py-sm">{{ gettext('Storage Status') }}</div>
                <div class="q-py-md">
                  <q-icon
                    :name="
                      cephHealth.includes('OK')
                        ? 'fa-solid fa-circle-check'
                        : 'fa-solid fa-circle-xmark'
                    "
                    :class="cephHealth.includes('OK') ? 'good' : 'critical'"
                    class="legacy-status-icon"
                  />
                </div>
                <div class="q-py-sm">{{ cephHealth }}</div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-5">
        <q-card class="dashboard-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('System Resources') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="q-py-none q-pt-md text-center">
            <div class="row">
              <div class="col">
                <div class="legacy-gauge-box">
                  <LegacyGaugeChart
                    :chart-data="{ value: clusterCpu.percent }"
                    :chart-options="{ textPosition: 'top', center: ['50%', '55%'] }"
                  />
                </div>
                <div class="q-pb-sm">{{ gettext('of') }} {{ clusterCpu.total }} CPU(s)</div>
              </div>
              <div class="col">
                <div class="legacy-gauge-box">
                  <LegacyGaugeChart
                    :chart-data="{ value: clusterMem.percent }"
                    :chart-options="{ textPosition: 'top', center: ['50%', '55%'] }"
                  />
                </div>
                <div class="q-pb-sm">
                  {{ gettext('Used') }} {{ formatBytes(clusterMem.used) }}，{{ gettext('of') }}
                  {{ formatBytes(clusterMem.total) }}
                </div>
              </div>
              <div class="col">
                <div class="legacy-gauge-box">
                  <LegacyGaugeChart
                    :chart-data="{ value: clusterStorage.percent }"
                    :chart-options="{ textPosition: 'top', center: ['50%', '55%'] }"
                  />
                </div>
                <div class="q-pb-sm">
                  {{ gettext('Used') }} {{ formatBytes(clusterStorage.used) }}，{{ gettext('of') }}
                  {{ formatBytes(clusterStorage.total) }}
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-3">
        <q-card class="dashboard-card">
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
                <span class="text-red q-ml-xs"
                  >{{ gettext('Stopped') }}({{ vmStats.offline }})</span
                >
                <span class="text-grey q-ml-xs"
                  >{{ gettext('Templates') }}({{ vmStats.template }})</span
                >
              </div>
              <LegacyRingChart
                :chart-data="vmCount"
                :chart-option="{
                  radius: '45%',
                  legend: {
                    bottom: '8%',
                    left: 'center',
                    icon: 'circle',
                    itemWidth: 10,
                    itemHeight: 10,
                    itemGap: 10,
                    textStyle: { fontSize: 12 },
                  },
                }"
              />
            </div>
            <div class="col chart-card">
              <div class="client-stat">
                <div class="total-title">{{ gettext('Container Statistics') }}</div>
                <span class="text-green">{{ gettext('Running') }}({{ lxcStats.online }})</span>
                <span class="text-red q-ml-xs"
                  >{{ gettext('Stopped') }}({{ lxcStats.offline }})</span
                >
                <span class="text-grey q-ml-xs"
                  >{{ gettext('Templates') }}({{ lxcStats.template }})</span
                >
              </div>
              <LegacyRingChart
                :chart-data="lxcCount"
                :chart-option="{
                  radius: '45%',
                  legend: {
                    bottom: '8%',
                    left: 'center',
                    icon: 'circle',
                    itemWidth: 10,
                    itemHeight: 10,
                    itemGap: 10,
                    textStyle: { fontSize: 12 },
                  },
                }"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-sm q-mt-sm">
      <div class="col-2">
        <q-card class="dashboard-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Cluster Storage Capacity') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="text-center dashboard-capacity">
            <div class="legacy-capacity-gauge">
              <LegacyGaugeChart
                :chart-data="{ value: cephCapacity.percent, name: cephCapacityName }"
                :chart-options="{ textPosition: 'top', center: ['50%', '55%'] }"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-6">
        <q-card class="dashboard-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Storage Status') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="q-py-none text-center dashboard-storage-status">
            <div class="row storage-status-row">
              <div class="col q-ma-sm">
                <div class="status-title">{{ gettext('OSDs') }}</div>
                <div class="osd-table q-pa-md">
                  <div class="row text-center">
                    <div class="col q-pa-sm u-border-right u-border-bottom"></div>
                    <div class="col q-pa-sm u-border-right u-border-bottom">
                      <q-icon name="fa-solid fa-circle" class="good fa-fw" />{{
                        gettext('Cluster In')
                      }}
                    </div>
                    <div class="col q-pa-sm u-border-bottom">
                      <q-icon name="fa-regular fa-circle" class="warning fa-fw" />{{
                        gettext('Cluster Out')
                      }}
                    </div>
                  </div>
                  <div class="row text-center">
                    <div class="col q-pa-sm u-border-right u-border-bottom">
                      <q-icon name="fa-solid fa-circle-up" class="good fa-fw" />{{ gettext('Up') }}
                    </div>
                    <div class="col q-pa-sm text-grey-8 u-border-right u-border-bottom">
                      {{ osdStats.upin }}
                    </div>
                    <div class="col q-pa-sm text-grey-8 u-border-bottom">{{ osdStats.upout }}</div>
                  </div>
                  <div class="row text-center">
                    <div class="col q-pa-sm u-border-right">
                      <q-icon name="fa-solid fa-circle-down" class="critical fa-fw" />{{
                        gettext('Down')
                      }}
                    </div>
                    <div class="col q-pa-sm text-grey-8 u-border-right">{{ osdStats.downin }}</div>
                    <div class="col q-pa-sm text-grey-8">{{ osdStats.downout }}</div>
                  </div>
                </div>
                <div class="total-osd">{{ gettext('Total') }}: {{ osdStats.total }}</div>
              </div>
              <div class="col">
                <LegacyRingChart :chart-data="pgsByStateRows" />
              </div>
              <div class="col q-ma-sm">
                <div class="status-title">{{ gettext('PG Number') }}</div>
                <q-scroll-area class="pg-list q-mt-sm">
                  <div v-for="item in pgsByStateRows" :key="textValue(item.state_name)" class="row">
                    <div class="col-10 text-left text-overflow">
                      <q-icon name="fa-solid fa-circle" :class="item.cls" size="10px" />
                      {{ item.state_name }}
                    </div>
                    <div class="col-2 text-right">{{ item.count }}</div>
                  </div>
                </q-scroll-area>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-4">
        <q-card class="dashboard-card">
          <q-tabs
            v-model="cephTab"
            dense
            class="text-grey"
            active-color="primary"
            indicator-color="primary"
            align="left"
            :breakpoint="0"
            narrow-indicator
          >
            <q-tab name="read" :label="`${gettext('Read')} (${rateLabel(readsChart)})`" />
            <q-tab name="write" :label="`${gettext('Write')} (${rateLabel(writesChart)})`" />
            <q-tab
              name="readIOPS"
              :label="`${gettext('Read')}IOPS (${iopsLabel(readIopsChart)})`"
            />
            <q-tab
              name="writeIOPS"
              :label="`${gettext('Write')}IOPS (${iopsLabel(writeIopsChart)})`"
            />
            <q-tab
              v-if="cephVersion === 'hammer'"
              name="hammerIOPS"
              :label="`IOPS (${rateLabel(iopsChart)})`"
            />
          </q-tabs>
          <q-separator />
          <q-tab-panels v-model="cephTab" animated class="running-panels">
            <q-tab-panel v-if="cephVersion === 'hammer'" name="hammerIOPS">
              <div class="row u-border-bottom running-chart">
                <LegacyRunningChart :chart-data="iopsChart" />
              </div>
            </q-tab-panel>
            <q-tab-panel name="read">
              <div class="row running-chart"><LegacyRunningChart :chart-data="readsChart" /></div>
            </q-tab-panel>
            <q-tab-panel name="write">
              <div :class="`row running-chart ${cephVersion === 'jewel' ? 'u-border-bottom' : ''}`">
                <LegacyRunningChart :chart-data="writesChart" />
              </div>
            </q-tab-panel>
            <q-tab-panel name="readIOPS">
              <div v-if="cephVersion === 'jewel'" class="row running-chart">
                <LegacyRunningChart :chart-data="readIopsChart" iops />
              </div>
            </q-tab-panel>
            <q-tab-panel name="writeIOPS">
              <div v-if="cephVersion === 'jewel'" class="row running-chart">
                <LegacyRunningChart :chart-data="writeIopsChart" iops />
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-sm q-mt-sm">
      <div class="col-5">
        <q-card class="dashboard-service-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Cluster Storage Services') }}
          </q-card-section>
          <q-separator />
          <q-card-section class="dashboard-services-body text-center">
            <div class="row no-padding">
              <div class="col">
                <div class="text-weight-medium service-title q-pa-sm text-center">
                  {{ gettext('Monitors') }}
                </div>
                <div class="row justify-center q-gutter-sm q-px-sm">
                  <div
                    v-for="item in cephServices.mon"
                    :key="item.id"
                    class="u-border q-px-sm service-badge"
                  >
                    {{ item.name }}:
                    <q-icon
                      :name="serviceIcon(item.health)"
                      :class="serviceIconClass(item.health)"
                      class="fa-fw"
                    />
                    <q-tooltip class="bg-primary service-tooltip">
                      <div v-html="item.text"></div>
                    </q-tooltip>
                  </div>
                </div>
              </div>
              <div class="col">
                <div class="text-weight-medium service-title q-pa-sm text-center">
                  {{ gettext('Managers') }}
                </div>
                <div class="row justify-center q-gutter-sm q-px-sm">
                  <div
                    v-for="item in cephServices.mgr"
                    :key="item.id"
                    class="u-border q-px-sm service-badge"
                  >
                    {{ item.name }}:
                    <q-icon
                      :name="serviceIcon(item.health)"
                      :class="serviceIconClass(item.health)"
                      class="fa-fw"
                    />
                    <q-tooltip class="bg-primary service-tooltip">
                      <div v-html="item.text"></div>
                    </q-tooltip>
                  </div>
                </div>
              </div>
              <div class="col">
                <div class="text-weight-medium service-title q-pa-sm text-center">
                  {{ gettext('Metadata Servers') }}
                </div>
                <div class="row justify-center q-gutter-sm q-px-sm">
                  <div
                    v-for="item in cephServices.mds"
                    :key="item.id"
                    class="u-border q-px-sm service-badge"
                  >
                    {{ item.name }}:
                    <q-icon
                      :name="serviceIcon(item.health)"
                      :class="serviceIconClass(item.health)"
                      class="fa-fw"
                    />
                    <q-tooltip class="bg-primary service-tooltip">
                      <div v-html="item.text"></div>
                    </q-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-7">
        <q-card class="dashboard-node-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Nodes') }} <span class="text-blue">( {{ nodeTableRows.length }} )</span>
          </q-card-section>
          <q-separator />
          <q-card-section class="q-pa-none text-center">
            <q-scroll-area class="nodes-scroll full-width text-grey-8">
              <q-table
                flat
                dense
                row-key="id"
                table-header-class="u-table-header"
                class="q-ma-none q-pa-none"
                :rows="nodeTableRows"
                :columns="nodeColumns"
                :pagination="{ rowsPerPage: 0 }"
                :rows-per-page-options="[0]"
                :loading="loading"
                :no-data-label="gettext('no record can be found')"
              >
                <template #body-cell-cpu="scope"
                  ><q-td :props="scope"
                    ><UsageProgress :percent="usedPercent(Number(scope.row.cpu), 1)" /></q-td
                ></template>
                <template #body-cell-mem="scope"
                  ><q-td :props="scope"
                    ><UsageProgress
                      :percent="
                        usedPercent(Number(scope.row.mem), Number(scope.row.maxmem))
                      " /></q-td
                ></template>
                <template #body-cell-disk="scope"
                  ><q-td :props="scope"
                    ><UsageProgress
                      :percent="
                        usedPercent(Number(scope.row.disk), Number(scope.row.maxdisk))
                      " /></q-td
                ></template>
                <template #body-cell-status="scope"
                  ><q-td :props="scope"
                    ><q-badge
                      :color="statusColor(scope.row.status)"
                      :label="textValue(scope.row.status, '-')" /></q-td
                ></template>
              </q-table>
            </q-scroll-area>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-sm q-mt-sm">
      <div class="col-12">
        <q-card class="dashboard-table-card">
          <q-card-section class="dashboard-card-title">
            <q-icon name="leaderboard" class="text-blue q-mr-xs" />
            {{ gettext('Running tasks') }} (<span class="text-blue">{{ taskTableRows.length }}</span
            >)
          </q-card-section>
          <q-separator />
          <q-card-section class="q-pa-none text-center">
            <q-scroll-area class="tasks-scroll text-grey-8">
              <q-table
                flat
                dense
                row-key="upid"
                table-header-class="u-table-header"
                class="q-ma-none q-pa-none"
                :rows="taskTableRows"
                :columns="taskColumns"
                :pagination="{ rowsPerPage: 0 }"
                :rows-per-page-options="[0]"
                :loading="loading"
                :no-data-label="gettext('no record can be found')"
              />
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
  /* background: #ffffff; */
  color: #333333;
}

.dashboard-old :deep(.text-grey-8) {
  color: #333333 !important;
}

.dashboard-old :deep(.q-card) {
  background: #ffffff;
  color: #333333;
}

.dashboard-old :deep(.q-table tbody td),
.dashboard-old :deep(.q-table thead th),
.dashboard-old :deep(.q-tab__label) {
  color: #333333;
}

.dashboard-card {
  height: 250px;
}

.dashboard-service-card {
  height: 250px;
  overflow: hidden;
}

.dashboard-node-card {
  height: 250px;
  overflow: hidden;
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
  color: #333333;
}

.dashboard-storage-status {
  height: 212px;
  color: #333333;
}

.dashboard-capacity {
  height: 220px;
  color: #333333;
}

.legacy-capacity-gauge {
  height: 100%;
}

.dashboard-services-body {
  box-sizing: border-box;
  height: 200px;
  padding: 16px;
  color: #333333;
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

.legacy-status-icon {
  font-size: 5em;
  line-height: 1;
}

.legacy-gauge-box {
  height: 160px;
}

.storage-status-row {
  height: 200px;
  font-size: 12px;
  color: #333333;
}

.status-title {
  font-size: 16px;
  text-align: center;
}

.total-osd {
  font-size: 13px;
  text-align: center;
}

.osd-table {
  padding: 16px !important;
}

.osd-table .q-pa-sm {
  min-height: 32px;
  padding: 8px !important;
  line-height: 16px;
}

.osd-table .q-icon {
  width: 1.25em;
  margin-right: 4px;
  font-size: 12px;
  vertical-align: baseline;
}

.service-title {
  font-size: 16px;
}

.service-badge {
  padding: 4px 8px !important;
  font-size: 13px;
  line-height: 20px;
}

.service-tooltip {
  font-size: 13px;
}

.u-border {
  border: 1px solid #cccccc;
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
