<script setup lang="ts">
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
import { computed, onMounted, shallowRef } from 'vue';
import LegacyRunningChart from './components/LegacyRunningChart.vue';
import resourceOverviewImage from '@/assets/overview/banner.png';

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

type DashboardAlarm = {
  id: string;
  title: string;
  level: 'critical' | 'warning';
  time: string;
};

const loading = shallowRef(false);
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
  [...nodes.value].sort((left, right) =>
    textValue(left.node).localeCompare(textValue(right.node)),
  ),
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
  () =>
    Number(
      clusterStatusRows.value.find((item) => item.type === 'cluster')?.quorate,
    ) === 1,
);

const cephHealth = computed(() =>
  textValue(
    (cephStatus.value.health as PveRecord | undefined)?.status ||
      cephStatus.value.health,
    'UNKNOWN',
  ),
);

const pgmap = computed(() => (cephStatus.value.pgmap || {}) as PveRecord);

const osdmap = computed(
  () =>
    ((cephStatus.value.osdmap as PveRecord | undefined)?.osdmap ||
      {}) as PveRecord,
);

const pgsByState = computed(() =>
  Array.isArray(pgmap.value.pgs_by_state)
    ? (pgmap.value.pgs_by_state as PveRecord[])
    : [],
);

const pgsByStateRows = computed<
  { state_name: string; count: number; cls: PgStateClass }[]
>(() =>
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
  const total = nodes.value.reduce(
    (sum, item) => sum + Number(item.maxcpu || 0),
    0,
  );
  return makeUsage(used, total);
});

const clusterMem = computed(() => sumUsage(nodes.value, 'mem', 'maxmem'));

const clusterStorage = computed(() =>
  sumUsage(dedupeStorage(storages.value), 'disk', 'maxdisk'),
);

const cephCapacity = computed(() =>
  makeUsage(
    Number(pgmap.value.bytes_used || 0),
    Number(pgmap.value.bytes_total || 0),
  ),
);

const vmStats = computed(() => countGuests(qemus.value));
const lxcStats = computed(() => countGuests(lxcs.value));

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

const onlineNodeCount = computed(
  () =>
    nodes.value.filter(
      (item) => textValue(item.status).toLowerCase() === 'online',
    ).length,
);

const offlineNodeCount = computed(() =>
  Math.max(nodes.value.length - onlineNodeCount.value, 0),
);

const nodePreviewRows = computed(() => nodeTableRows.value.slice(0, 5));
const recentTaskRows = computed(() => taskTableRows.value.slice(0, 5));

const storageHealthStats = computed(() => {
  const healthy = osdStats.value.upin;
  const warning = osdStats.value.upout + osdStats.value.downin;
  const abnormal = osdStats.value.downout;

  return {
    healthy,
    warning,
    abnormal,
    total: osdStats.value.total,
  };
});

const dashboardAlarms = computed<DashboardAlarm[]>(() => {
  const result: DashboardAlarm[] = [];

  if (!clusterQuorate.value) {
    result.push({
      id: 'cluster',
      title: `${gettext('Cluster')} ${gettext('Quorate')} ${gettext('Abnormal')}`,
      level: 'critical',
      time: '-',
    });
  }

  if (!cephHealth.value.includes('OK')) {
    result.push({
      id: 'ceph',
      title: `Ceph ${gettext('Status')}: ${cephHealth.value}`,
      level: 'critical',
      time: '-',
    });
  }

  nodes.value
    .filter((item) => textValue(item.status).toLowerCase() !== 'online')
    .slice(0, 3)
    .forEach((item) => {
      result.push({
        id: `node-${textValue(item.node)}`,
        title: `${gettext('Node')} ${textValue(item.node)} ${gettext('Offline')}`,
        level: 'critical',
        time: '-',
      });
    });

  pgsByStateRows.value
    .filter((item) => item.cls === 'warning' || item.cls === 'critical')
    .slice(0, 3)
    .forEach((item) => {
      result.push({
        id: `pg-${item.state_name}`,
        title: `PG ${item.state_name}: ${item.count}`,
        level: item.cls === 'critical' ? 'critical' : 'warning',
        time: '-',
      });
    });

  return result;
});

const alarmTotal = computed(() => dashboardAlarms.value.length);

const criticalAlarmCount = computed(
  () =>
    dashboardAlarms.value.filter((item) => item.level === 'critical').length,
);

const warningAlarmCount = computed(
  () =>
    dashboardAlarms.value.filter((item) => item.level === 'warning').length,
);

const nodeOnlinePercent = computed(() =>
  nodes.value.length
    ? Math.round((onlineNodeCount.value / nodes.value.length) * 100)
    : 0,
);

const cephHealthy = computed(() => cephHealth.value.includes('OK'));

function makeUsage(used: number, total: number): UsageInfo {
  return {
    used,
    total,
    percent: usedPercent(used, total),
  };
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
      if (item.template) {
        stats.template += 1;
      } else if (
        Number(item.uptime || 0) > 0 ||
        textValue(item.status).toLowerCase() === 'running'
      ) {
        stats.online += 1;
      } else {
        stats.offline += 1;
      }

      return stats;
    },
    {
      online: 0,
      offline: 0,
      template: 0,
    },
  );
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

function appendRunningChart(
  chart:
    | typeof iopsChart
     
     
     
     ,
  value: number,
) {
  chart.value = {
    ...chart.value,
    xList: [...chart.value.xList.slice(-29), currentTimeText()],
    yList: [
      ...chart.value.yList.slice(-29),
      Number.isFinite(value) ? value : 0,
    ],
  };
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

function ringStyle(percent: number, color: string) {
  return {
    '--ring-percent': `${Math.max(0, Math.min(percent, 100))}%`,
    '--ring-color': color,
  };
}

function healthRingStyle() {
  const total = storageHealthStats.value.total;

  if (!total) {
    return {
      '--health-percent': '0%',
      '--health-color': '#dfe4ec',
    };
  }

  const percent = Math.round(
    (storageHealthStats.value.healthy / total) * 100,
  );

  let color = '#20ae5c';

  if (storageHealthStats.value.abnormal > 0) {
    color = '#ef4e4e';
  } else if (storageHealthStats.value.warning > 0) {
    color = '#f6ab27';
  }

  return {
    '--health-percent': `${percent}%`,
    '--health-color': color,
  };
}

function nodeCpuPercent(row: PveRecord) {
  return usedPercent(Number(row.cpu || 0), 1);
}

function nodeMemoryPercent(row: PveRecord) {
  return usedPercent(Number(row.mem || 0), Number(row.maxmem || 0));
}

function formatUptime(seconds: unknown) {
  const value = Number(seconds || 0);

  if (!value) return '-';

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${hours}h`;
}

function taskStatusClass(row: PveRecord) {
  const status = textValue(row.status).toLowerCase();

  if (
    status === 'ok' ||
    status === 'success' ||
    status === 'successful' ||
    status === 'stopped'
  ) {
    return 'task-success';
  }

  if (status.includes('error') || status.includes('fail')) {
    return 'task-error';
  }

  return 'task-running';
}

function taskStatusText(row: PveRecord) {
  const status = textValue(row.status);

  if (!status) return gettext('Running');

  if (status.toLowerCase() === 'ok') {
    return gettext('Success');
  }

  return status;
}

function taskProgress(row: PveRecord) {
  const status = textValue(row.status).toLowerCase();

  if (
    status === 'ok' ||
    status === 'success' ||
    status === 'successful' ||
    status === 'stopped'
  ) {
    return 1;
  }

  if (status.includes('error') || status.includes('fail')) {
    return 1;
  }

  return 0.65;
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

    if (resourceResponse.status === 'fulfilled') {
      resources.value = resourceResponse.value.data || [];
    }

    if (clusterResponse.status === 'fulfilled') {
      clusterStatusRows.value = clusterResponse.value.data || [];
    }

    if (taskResponse.status === 'fulfilled') {
      tasks.value = taskResponse.value.data || [];
    }

    if (cephMetadataResponse.status === 'fulfilled') {
      cephMetadata.value = cephMetadataResponse.value.data || {};
    }

    if (cephStatusResponse.status === 'fulfilled') {
      cephStatus.value = cephStatusResponse.value.data || {};

      const currentPgmap =
        (cephStatusResponse.value.data?.pgmap as PveRecord | undefined) || {};

      appendRunningChart(
        iopsChart,
        Number(currentPgmap.op_per_sec || 0),
      );
      appendRunningChart(
        readsChart,
        Number(currentPgmap.read_bytes_sec || 0),
      );
      appendRunningChart(
        writesChart,
        Number(currentPgmap.write_bytes_sec || 0),
      );
      appendRunningChart(
        readIopsChart,
        Number(currentPgmap.read_op_per_sec || 0),
      );
      appendRunningChart(
        writeIopsChart,
        Number(currentPgmap.write_op_per_sec || 0),
      );
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div class="dashboard-home">
    <!-- 顶部统计 -->
    <section class="summary-grid">
      <div class="summary-card">
        <div class="summary-icon summary-icon--blue">
          <q-icon name="dns" />
        </div>

        <div class="summary-content">
          <div class="summary-label">{{ gettext('Cluster Status') }}</div>

          <div
            class="summary-main summary-status"
            :class="clusterQuorate ? 'is-success' : 'is-danger'"
          >
            {{ clusterQuorate ? gettext('Healthy') : gettext('Abnormal') }}
          </div>

          <div class="summary-sub">
            <span
              class="status-dot"
              :class="
                clusterQuorate
                  ? 'status-dot--success'
                  : 'status-dot--danger'
              "
            />
            <span class="summary-sub-text">
              {{ clusterName }}
              ·
              {{
                clusterQuorate
                  ? gettext('Running normally')
                  : gettext('Cluster quorum abnormal')
              }}
            </span>
          </div>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon summary-icon--red">
          <q-icon name="layers" />
        </div>

        <div class="summary-content">
          <div class="summary-label">Ceph {{ gettext('Status') }}</div>

          <div
            class="summary-main summary-status"
            :class="cephHealthy ? 'is-success' : 'is-danger'"
          >
            {{ cephHealthy ? gettext('Healthy') : gettext('Abnormal') }}
          </div>

          <div class="summary-sub">
            <span
              class="status-dot"
              :class="
                cephHealthy
                  ? 'status-dot--success'
                  : 'status-dot--danger'
              "
            />
            <span class="summary-sub-text">
              {{ storageHealthStats.healthy }} OSD {{ gettext('Normal') }}
            </span>
          </div>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon summary-icon--indigo">
          <q-icon name="developer_board" />
        </div>

        <div class="summary-content">
          <div class="summary-label">{{ gettext('Nodes') }}</div>

          <div class="summary-main">
            {{ onlineNodeCount }}
            <span class="summary-total">/ {{ nodes.length }}</span>
          </div>

          <div class="summary-sub summary-progress-row">
            <span>{{ gettext('Online') }} {{ nodeOnlinePercent }}%</span>

            <q-linear-progress
              rounded
              size="5px"
              color="positive"
              track-color="grey-3"
              :value="nodeOnlinePercent / 100"
            />
          </div>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon summary-icon--blue">
          <q-icon name="view_in_ar" />
        </div>

        <div class="summary-content">
          <div class="summary-label">{{ gettext('Virtual Machine') }}</div>

          <div class="summary-main">
            {{ qemus.length }}
          </div>

          <div class="summary-sub">
            <span class="status-dot status-dot--success" />
            <span class="summary-sub-text">
              {{ gettext('Running') }} {{ vmStats.online }}
            </span>
          </div>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon summary-icon--green">
          <q-icon name="inventory_2" />
        </div>

        <div class="summary-content">
          <div class="summary-label">LXC {{ gettext('Container') }}</div>

          <div class="summary-main">
            {{ lxcs.length }}
          </div>

          <div class="summary-sub">
            <span class="status-dot status-dot--success" />
            <span class="summary-sub-text">
              {{ gettext('Running') }} {{ lxcStats.online }}
            </span>
          </div>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon summary-icon--orange">
          <q-icon name="notifications_active" />
        </div>

        <div class="summary-content">
          <div class="summary-label">{{ gettext('Alerts') }}</div>

          <div class="summary-main">
            {{ alarmTotal }}
          </div>

          <div class="summary-sub alarm-count-summary">
            <span class="alarm-critical">
              {{ gettext('Critical') }} {{ criticalAlarmCount }}
            </span>
            <span class="alarm-warning">
              {{ gettext('Warning') }} {{ warningAlarmCount }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 主体 -->
    <section class="dashboard-main-grid">
      <div class="dashboard-left">
        <!-- 资源拓扑总览 -->
        <div class="panel topology-panel">
          <div class="panel-header">
            <div class="panel-title">
              {{ gettext('Resource Topology Overview') }}
            </div>
          </div>

          <div class="topology-content">
            <svg
              class="topology-lines"
              viewBox="0 0 1000 520"
              preserveAspectRatio="none"
            >
              <line x1="500" y1="255" x2="225" y2="130" />
              <line x1="500" y1="255" x2="500" y2="76" />
              <line x1="500" y1="255" x2="780" y2="135" />
              <line x1="500" y1="255" x2="155" y2="350" />
              <line x1="500" y1="255" x2="500" y2="425" />
              <line x1="500" y1="255" x2="840" y2="365" />
            </svg>

            <div class="topology-image-wrap">
              <img
                :src="resourceOverviewImage"
                class="topology-image"
                alt="resource overview"
              />
            </div>

            <div class="topology-info topology-vm">
              <div class="topology-info-title topology-blue">
                <q-icon name="view_in_ar" />
                {{ gettext('Virtual Machine') }}
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Running') }}</span>
                <strong>{{ vmStats.online }}</strong>
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Stopped') }}</span>
                <strong>{{ vmStats.offline }}</strong>
              </div>
            </div>

            <div class="topology-info topology-pool">
              <div class="topology-info-title topology-blue">
                <q-icon name="widgets" />
                {{ gettext('Resource Pool') }}
              </div>

              <div class="topology-pool-desc">
                CPU · {{ gettext('Memory') }} · {{ gettext('Storage') }} ·
                {{ gettext('Network') }}
              </div>

              <div class="topology-pool-tags">
                <span>{{ gettext('Unified Scheduling') }}</span>
                <span>{{ gettext('Flexible Allocation') }}</span>
              </div>
            </div>

            <div class="topology-info topology-lxc">
              <div class="topology-info-title topology-green">
                <q-icon name="inventory_2" />
                LXC {{ gettext('Container') }}
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Running') }}</span>
                <strong>{{ lxcStats.online }}</strong>
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Stopped') }}</span>
                <strong>{{ lxcStats.offline }}</strong>
              </div>
            </div>

            <div class="topology-info topology-node">
              <div class="topology-info-title topology-blue">
                <q-icon name="lan" />
                {{ gettext('Node') }}
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Online') }}</span>
                <strong>{{ onlineNodeCount }} / {{ nodes.length }}</strong>
              </div>

              <div class="topology-info-line">
                <span>CPU</span>
                <strong>{{ clusterCpu.percent }}%</strong>
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Memory') }}</span>
                <strong>{{ clusterMem.percent }}%</strong>
              </div>
            </div>

            <div class="topology-info topology-network">
              <div class="topology-info-title topology-blue">
                <q-icon name="device_hub" />
                {{ gettext('Network') }}
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Resource') }}</span>
                <strong>--</strong>
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Status') }}</span>
                <strong class="is-muted">{{ gettext('Pending') }}</strong>
              </div>
            </div>

            <div class="topology-info topology-storage">
              <div class="topology-info-title topology-blue">
                <q-icon name="storage" />
                {{ gettext('Storage') }}
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Capacity') }}</span>
                <strong>{{ formatBytes(clusterStorage.total) }}</strong>
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Used') }}</span>
                <strong>{{ formatBytes(clusterStorage.used) }}</strong>
              </div>

              <div class="topology-info-line">
                <span>{{ gettext('Usage') }}</span>
                <strong>{{ clusterStorage.percent }}%</strong>
              </div>
            </div>

            <div class="topology-legend">
              <span>
                <i class="legend-line" />
                {{ gettext('Network Connection') }}
              </span>

              <span>
                <i class="legend-line legend-line--dash" />
                {{ gettext('Resource Scheduling') }}
              </span>

              <span>
                <i class="status-dot status-dot--success" />
                {{ gettext('Healthy') }}
              </span>

              <span>
                <i class="status-dot status-dot--warning" />
                {{ gettext('Warning') }}
              </span>

              <span>
                <i class="status-dot status-dot--danger" />
                {{ gettext('Abnormal') }}
              </span>
            </div>
          </div>
        </div>

        <!-- 左下 -->
        <div class="bottom-overview-grid">
          <div class="panel node-panel">
            <div class="panel-header">
              <div class="panel-title">{{ gettext('Node Status') }}</div>
              <button class="panel-more">
                {{ gettext('More') }} ›
              </button>
            </div>

            <div class="simple-table node-table">
              <div class="simple-table-header">
                <div>{{ gettext('Node') }}</div>
                <div>{{ gettext('Status') }}</div>
                <div>{{ gettext('Role') }}</div>
                <div>CPU</div>
                <div>{{ gettext('Memory') }}</div>
                <div>{{ gettext('Uptime') }}</div>
              </div>

              <div
                v-for="node in nodePreviewRows"
                :key="textValue(node.id || node.node)"
                class="simple-table-row"
              >
                <div class="table-main-text">
                  {{ textValue(node.node, '-') }}
                </div>

                <div>
                  <span
                    class="status-dot"
                    :class="
                      textValue(node.status).toLowerCase() === 'online'
                        ? 'status-dot--success'
                        : 'status-dot--danger'
                    "
                  />

                  <span
                    :class="
                      textValue(node.status).toLowerCase() === 'online'
                        ? 'text-success'
                        : 'text-danger'
                    "
                  >
                    {{
                      textValue(node.status).toLowerCase() === 'online'
                        ? gettext('Online')
                        : gettext('Offline')
                    }}
                  </span>
                </div>

                <div class="table-secondary">计算 / 存储</div>

                <div class="resource-table-cell">
                  <q-linear-progress
                    rounded
                    size="5px"
                    color="primary"
                    track-color="grey-3"
                    :value="nodeCpuPercent(node) / 100"
                  />
                  <span>{{ nodeCpuPercent(node) }}%</span>
                </div>

                <div class="resource-table-cell">
                  <q-linear-progress
                    rounded
                    size="5px"
                    color="positive"
                    track-color="grey-3"
                    :value="nodeMemoryPercent(node) / 100"
                  />
                  <span>{{ nodeMemoryPercent(node) }}%</span>
                </div>

                <div class="table-secondary">
                  {{ formatUptime(node.uptime) }}
                </div>
              </div>

              <div v-if="!nodePreviewRows.length" class="table-empty">
                {{ gettext('no record can be found') }}
              </div>
            </div>
          </div>
   <div class="panel recent-task-panel">
          <div class="panel-header">
            <div class="panel-title">{{ gettext('Recent Tasks') }}</div>
            <button class="panel-more">
              {{ gettext('More') }} ›
            </button>
          </div>

          <div class="simple-table task-table">
            <div class="simple-table-header">
              <div>{{ gettext('Task') }}</div>
              <div>{{ gettext('Type') }}</div>
              <div>{{ gettext('Status') }}</div>
              <div>{{ gettext('Progress') }}</div>
              <div>{{ gettext('Start Time') }}</div>
            </div>

            <div
              v-for="task in recentTaskRows"
              :key="textValue(task.upid || task.id)"
              class="simple-table-row"
            >
              <div class="table-main-text task-name">
                {{ formatTaskDescription(task.type, task.id) }}
              </div>

              <div class="table-secondary">
                {{ textValue(task.type, '-') }}
              </div>

              <div>
                <span
                  class="task-status-dot"
                  :class="taskStatusClass(task)"
                />
                <span :class="taskStatusClass(task)">
                  {{ taskStatusText(task) }}
                </span>
              </div>

              <div class="task-progress">
                <q-linear-progress
                  rounded
                  size="5px"
                  :color="
                    taskStatusClass(task) === 'task-error'
                      ? 'negative'
                      : 'positive'
                  "
                  track-color="grey-3"
                  :value="taskProgress(task)"
                />
                <span>{{ Math.round(taskProgress(task) * 100) }}%</span>
              </div>

              <div class="table-secondary">
                {{
                  task.starttime
                    ? timestampToTime(Number(task.starttime) * 1000)
                    : '-'
                }}
              </div>
            </div>

            <div v-if="!recentTaskRows.length" class="table-empty">
              {{ gettext('no record can be found') }}
            </div>
          </div>
        </div>
          <!-- <div class="panel alarm-panel">
            <div class="panel-header">
              <div class="panel-title">{{ gettext('Alert Overview') }}</div>
              <button class="panel-more">
                {{ gettext('More') }} ›
              </button>
            </div>

            <div class="alarm-summary-line">
              <span class="alarm-critical">
                <q-icon name="error" />
                {{ gettext('Critical') }} {{ criticalAlarmCount }}
              </span>

              <span class="alarm-warning">
                <q-icon name="warning" />
                {{ gettext('Warning') }} {{ warningAlarmCount }}
              </span>
            </div>

            <div class="alarm-list">
              <div
                v-for="alarm in dashboardAlarms.slice(0, 5)"
                :key="alarm.id"
                class="alarm-row"
              >
                <div
                  class="alarm-marker"
                  :class="`alarm-marker--${alarm.level}`"
                />

                <div class="alarm-title">
                  {{ alarm.title }}
                </div>

                <div
                  class="alarm-level"
                  :class="
                    alarm.level === 'critical'
                      ? 'alarm-critical'
                      : 'alarm-warning'
                  "
                >
                  {{
                    alarm.level === 'critical'
                      ? gettext('Critical')
                      : gettext('Warning')
                  }}
                </div>

                <div class="alarm-time">
                  {{ alarm.time }}
                </div>
              </div>

              <div v-if="!dashboardAlarms.length" class="alarm-empty">
                <q-icon name="check_circle" />
                {{ gettext('No active alerts') }}
              </div>
            </div>
          </div> -->
        </div>
      </div>

      <!-- 右侧 -->
      <div class="dashboard-right">
        <div class="panel system-resource-panel">
          <div class="panel-header">
            <div class="panel-title">{{ gettext('System Resources') }}</div>
            <button class="panel-more">
              {{ gettext('More') }} ›
            </button>
          </div>

          <div class="resource-ring-grid">
            <div class="resource-ring-item">
              <div class="resource-ring-title">
                CPU {{ gettext('Usage') }}
              </div>

              <div
                class="resource-ring"
                :style="ringStyle(clusterCpu.percent, '#237FDB')"
              >
                <div class="resource-ring-inner">
                  <strong>{{ clusterCpu.percent }}%</strong>
                </div>
              </div>

              <div class="resource-ring-desc">
                {{ Math.round(clusterCpu.used) }}
                /
                {{ Math.round(clusterCpu.total) }} Core
              </div>
            </div>

            <div class="resource-ring-item">
              <div class="resource-ring-title">
                {{ gettext('Memory Usage') }}
              </div>

              <div
                class="resource-ring"
                :style="ringStyle(clusterMem.percent, '#6269E8')"
              >
                <div class="resource-ring-inner">
                  <strong>{{ clusterMem.percent }}%</strong>
                </div>
              </div>

              <div class="resource-ring-desc">
                {{ formatBytes(clusterMem.used) }}
                /
                {{ formatBytes(clusterMem.total) }}
              </div>
            </div>

            <div class="resource-ring-item">
              <div class="resource-ring-title">
                {{ gettext('Storage Usage') }}
              </div>

              <div
                class="resource-ring"
                :style="ringStyle(clusterStorage.percent, '#F4B400')"
              >
                <div class="resource-ring-inner">
                  <strong>{{ clusterStorage.percent }}%</strong>
                </div>
              </div>

              <div class="resource-ring-desc">
                {{ formatBytes(clusterStorage.used) }}
                /
                {{ formatBytes(clusterStorage.total) }}
              </div>
            </div>
          </div>
        </div>

        <div class="panel storage-health-panel">
          <div class="panel-header">
            <div class="panel-title">{{ gettext('Storage Health') }}</div>
            <button class="panel-more">
              {{ gettext('More') }} ›
            </button>
          </div>

          <div class="storage-health-body">
            <div class="health-ring" :style="healthRingStyle()">
              <div class="health-ring-inner">
                <span>{{ gettext('Healthy') }}</span>
                <strong>
                  {{ storageHealthStats.healthy }}/{{ storageHealthStats.total }}
                </strong>
              </div>
            </div>

            <div class="health-stat-list">
              <div>
                <span class="status-dot status-dot--success" />
                <span>{{ gettext('Healthy') }}</span>
                <strong>{{ storageHealthStats.healthy }}</strong>
              </div>

              <div>
                <span class="status-dot status-dot--warning" />
                <span>{{ gettext('Warning') }}</span>
                <strong>{{ storageHealthStats.warning }}</strong>
              </div>

              <div>
                <span class="status-dot status-dot--danger" />
                <span>{{ gettext('Abnormal') }}</span>
                <strong>{{ storageHealthStats.abnormal }}</strong>
              </div>

              <div class="health-divider" />

              <div>
                <span>{{ gettext('Total Capacity') }}</span>
                <strong>{{ formatBytes(cephCapacity.total) }}</strong>
              </div>

              <div>
                <span>{{ gettext('Used Capacity') }}</span>
                <strong>{{ formatBytes(cephCapacity.used) }}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="panel io-panel">
          <div class="panel-header">
            <div class="panel-title">I/O {{ gettext('Trend') }}</div>

            <div class="io-range">
              {{ gettext('Recent') }} 24h
              <q-icon name="expand_more" />
            </div>
          </div>

          <div class="io-legend">
            <span>
              <i class="io-legend-line io-legend-line--read" />
              IOPS
            </span>
            <span>
              <i class="io-legend-line io-legend-line--write" />
              {{ gettext('Storage') }}
            </span>
          </div>

          <div class="io-chart">
            <LegacyRunningChart :chart-data="iopsChart" />
          </div>
        </div>

     
      </div>
    </section>

    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.dashboard-home {
  min-width: 1180px;
  min-height: 100%;
  padding: 16px;
  box-sizing: border-box;
  background:
    linear-gradient(180deg, #f5f8fd 0%, #f7f9fc 52%, #f5f7fb 100%);
  color: #253047;
}

/* =========================
   公共 Panel
   ========================= */

.panel {
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid #e7ebf2;
  border-radius: 12px;
  background: #ffffff;
  box-shadow:
    0 2px 8px rgba(31, 56, 88, 0.025),
    0 8px 24px rgba(31, 56, 88, 0.035);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid #edf0f5;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #202b3d;
}

.panel-more {
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #8490a4;
  font-size: 12px;
  cursor: pointer;
}

.panel-more:hover {
  color: #237fdb;
}

/* =========================
   顶部统计
   ========================= */

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.summary-card {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 112px;
  padding: 16px;
  box-sizing: border-box;
  border: 1px solid #e7ebf2;
  border-radius: 12px;
  background: #ffffff;
  box-shadow:
    0 2px 8px rgba(31, 56, 88, 0.025),
    0 8px 24px rgba(31, 56, 88, 0.03);
}

.summary-icon {
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-right: 14px;
  border-radius: 13px;
  font-size: 28px;
}

.summary-icon--blue {
  color: #176bed;
  background: linear-gradient(145deg, #f0f6ff, #e9f2ff);
}

.summary-icon--indigo {
  color: #4168df;
  background: linear-gradient(145deg, #f2f5ff, #ebefff);
}

.summary-icon--green {
  color: #11a88b;
  background: linear-gradient(145deg, #effaf8, #e7f7f4);
}

.summary-icon--red {
  color: #f04a42;
  background: linear-gradient(145deg, #fff4f3, #feeeee);
}

.summary-icon--orange {
  color: #f05f42;
  background: linear-gradient(145deg, #fff4f1, #feefec);
}

.summary-content {
  flex: 1;
  min-width: 0;
}

.summary-label {
  margin-bottom: 4px;
  overflow: hidden;
  color: #4c586d;
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.summary-main {
  margin-bottom: 6px;
  color: #161d2c;
  font-size: 24px;
  font-weight: 600;
  line-height: 28px;
}

.summary-total {
  color: #222a38;
  font-size: 18px;
  font-weight: 500;
}

.summary-status {
  font-size: 21px;
}

.summary-sub {
  display: flex;
  align-items: center;
  min-width: 0;
  color: #8490a4;
  font-size: 11px;
  line-height: 16px;
}

.summary-sub-text {
  overflow: hidden;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.summary-progress-row {
  gap: 8px;
}

.summary-progress-row > span {
  flex-shrink: 0;
}

.summary-progress-row .q-linear-progress {
  width: 54px;
}

.is-success,
.text-success {
  color: #16b364;
}

.is-danger,
.text-danger {
  color: #ef4e4e;
}

.is-muted {
  color: #99a2b2;
}

/* =========================
   状态点
   ========================= */

.status-dot,
.task-status-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
}

.status-dot--success {
  background: #16b364;
}

.status-dot--warning {
  background: #f5a623;
}

.status-dot--danger {
  background: #f04438;
}

/* =========================
   主布局
   ========================= */

.dashboard-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.15fr) minmax(360px, 0.85fr);
  gap: 14px;
}

.dashboard-left,
.dashboard-right {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

/* =========================
   资源拓扑
   ========================= */

.topology-panel {
  height: 500px;
}

.topology-content {
  position: relative;
  height: calc(100% - 48px);
  overflow: hidden;
  background:
    radial-gradient(
      circle at 50% 45%,
      rgba(35, 127, 219, 0.065),
      rgba(255, 255, 255, 0) 38%
    ),
    linear-gradient(180deg, #ffffff, #fbfdff);
}

.topology-lines {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.topology-lines line {
  stroke: #4691ea;
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  opacity: 0.65;
}

.topology-image-wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 55%;
  height: 67%;
  transform: translate(-50%, -48%);
}

.topology-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 16px 20px rgba(40, 82, 130, 0.11));
}

.topology-info {
  position: absolute;
  z-index: 3;
  min-width: 124px;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid rgba(67, 137, 225, 0.36);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 5px 15px rgba(31, 92, 166, 0.07);
}

.topology-vm {
  top: 13%;
  left: 10%;
}

.topology-pool {
  top: 4%;
  left: 50%;
  min-width: 190px;
  transform: translateX(-50%);
  text-align: center;
}

.topology-lxc {
  top: 14%;
  right: 7%;
  border-color: rgba(17, 168, 139, 0.35);
}

.topology-node {
  bottom: 21%;
  left: 3%;
}

.topology-network {
  bottom: 9%;
  left: 50%;
  transform: translateX(-50%);
}

.topology-storage {
  right: 2%;
  bottom: 18%;
}

.topology-info-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}

.topology-pool .topology-info-title {
  justify-content: center;
}

.topology-blue {
  color: #1673df;
}

.topology-green {
  color: #0ca98a;
}

.topology-info-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 3px;
  color: #718096;
  font-size: 11px;
}

.topology-info-line strong {
  color: #435069;
  font-weight: 500;
}

.topology-pool-desc {
  color: #6e7990;
  font-size: 10px;
}

.topology-pool-tags {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 5px;
  color: #66738a;
  font-size: 10px;
}

.topology-legend {
  position: absolute;
  bottom: 8px;
  left: 50%;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 7px 22px;
  border: 1px solid #e6ebf3;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #7d889c;
  font-size: 10px;
  transform: translateX(-50%);
  white-space: nowrap;
}

.topology-legend > span {
  display: flex;
  align-items: center;
}

.legend-line {
  display: inline-block;
  width: 24px;
  height: 1px;
  margin-right: 6px;
  background: #3487e8;
}

.legend-line--dash {
  height: 0;
  border-top: 2px dotted #3487e8;
  background: none;
}

/* =========================
   左下
   ========================= */

.bottom-overview-grid {
  display: grid;
  grid-template-columns: 1fr 1.17fr;
  gap: 14px;
}

.node-panel,
.alarm-panel {
  height: 270px;
}

/* =========================
   系统资源
   ========================= */

.system-resource-panel {
  height: 205px;
}

.resource-ring-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  height: calc(100% - 48px);
  padding: 12px 8px 8px;
  box-sizing: border-box;
}

.resource-ring-item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  flex-direction: column;
}

.resource-ring-title {
  margin-bottom: 8px;
  color: #4f5c72;
  font-size: 11px;
}

.resource-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 78px;
  height: 78px;
  padding: 8px;
  box-sizing: border-box;
  border-radius: 50%;
  background:
    conic-gradient(
      var(--ring-color) 0 var(--ring-percent),
      #e7ebf2 var(--ring-percent) 100%
    );
}

.resource-ring-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: #fff;
}

.resource-ring-inner strong {
  color: #192233;
  font-size: 16px;
}

.resource-ring-desc {
  max-width: 100%;
  margin-top: 8px;
  overflow: hidden;
  color: #7b879b;
  font-size: 10px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* =========================
   存储健康
   ========================= */

.storage-health-panel {
  height: 185px;
}

.storage-health-body {
  display: flex;
  align-items: center;
  height: calc(100% - 48px);
  padding: 12px 26px;
  box-sizing: border-box;
}

.health-ring {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 92px;
  height: 92px;
  padding: 9px;
  box-sizing: border-box;
  border-radius: 50%;
  background:
    conic-gradient(
      var(--health-color) 0 var(--health-percent),
      #e9edf3 var(--health-percent) 100%
    );
}

.health-ring-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 74px;
  height: 74px;
  flex-direction: column;
  border-radius: 50%;
  background: #ffffff;
}

.health-ring-inner span {
  color: #59667a;
  font-size: 11px;
}

.health-ring-inner strong {
  margin-top: 3px;
  color: #172033;
  font-size: 15px;
}

.health-stat-list {
  flex: 1;
  margin-left: 30px;
  min-width: 0;
  font-size: 10px;
}

.health-stat-list > div:not(.health-divider) {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  min-height: 21px;
  color: #69768b;
}

.health-stat-list > div:nth-last-child(-n + 2) {
  grid-template-columns: 1fr auto;
}

.health-stat-list strong {
  color: #566278;
  font-weight: 500;
}

.health-divider {
  height: 1px;
  margin: 4px 0;
  background: #edf0f4;
}

/* =========================
   IO
   ========================= */

.io-panel {
  height: 245px;
}

.io-range {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border: 1px solid #e4e8ef;
  border-radius: 5px;
  color: #8691a5;
  font-size: 10px;
}

.io-legend {
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  height: 25px;
  padding: 8px 18px 0;
  box-sizing: border-box;
  color: #69758a;
  font-size: 10px;
}

.io-legend span {
  display: flex;
  align-items: center;
}

.io-legend-line {
  display: inline-block;
  width: 16px;
  height: 2px;
  margin-right: 5px;
}

.io-legend-line--read {
  background: #237fdb;
}

.io-legend-line--write {
  background: #23a65c;
}

.io-chart {
  height: 170px;
}

.io-chart :deep(.metric-sparkline) {
  border: 0;
  background: transparent;
}

/* =========================
   最近任务
   ========================= */

.recent-task-panel {
  height: 285px;
}

/* =========================
   通用表格
   ========================= */

.simple-table {
  width: 100%;
}

.simple-table-header,
.simple-table-row {
  display: grid;
  align-items: center;
  min-width: 0;
  padding: 0 14px;
  box-sizing: border-box;
}

.node-table .simple-table-header,
.node-table .simple-table-row {
  grid-template-columns:
    minmax(72px, 1fr)
    58px
    minmax(82px, 1fr)
    minmax(90px, 1.2fr)
    minmax(90px, 1.2fr)
    minmax(86px, 1fr);
}

.task-table .simple-table-header,
.task-table .simple-table-row {
  grid-template-columns:
    minmax(130px, 1.5fr)
    minmax(70px, 0.8fr)
    66px
    minmax(90px, 1fr)
    minmax(92px, 0.9fr);
}

.simple-table-header {
  height: 32px;
  background: #fbfcfe;
  color: #8390a5;
  font-size: 10px;
}

.simple-table-row {
  min-height: 36px;
  border-bottom: 1px solid #f0f2f6;
  color: #637087;
  font-size: 10px;
}

.simple-table-row:last-child {
  border-bottom: 0;
}

.simple-table-row > div {
  min-width: 0;
}

.table-main-text {
  overflow: hidden;
  color: #38465c;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.table-secondary {
  overflow: hidden;
  color: #7c889d;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.resource-table-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 10px;
}

.resource-table-cell .q-linear-progress {
  flex: 1;
}

.resource-table-cell span {
  width: 28px;
  flex-shrink: 0;
  color: #68758b;
}

.task-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
}

.task-progress .q-linear-progress {
  flex: 1;
}

.task-progress span {
  width: 30px;
  flex-shrink: 0;
}

.task-success {
  color: #18ae61;
}

.task-error {
  color: #ef4e4e;
}

.task-running {
  color: #237fdb;
}

.task-status-dot.task-success {
  background: #18ae61;
}

.task-status-dot.task-error {
  background: #ef4e4e;
}

.task-status-dot.task-running {
  background: #237fdb;
}

.table-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: #a0a9b8;
  font-size: 11px;
}

/* =========================
   告警
   ========================= */

.alarm-count-summary {
  gap: 10px;
}

.alarm-critical {
  color: #ed4b46;
}

.alarm-warning {
  color: #f3a31d;
}

.alarm-summary-line {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 32px;
  padding: 0 14px;
  border-bottom: 1px solid #edf0f4;
  font-size: 10px;
}

.alarm-list {
  padding: 0 14px;
}

.alarm-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) 48px 98px;
  align-items: center;
  height: 35px;
  border-bottom: 1px solid #f0f2f5;
  font-size: 10px;
}

.alarm-marker {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.alarm-marker--critical {
  background: #ef4e4e;
}

.alarm-marker--warning {
  background: #f3a31d;
}

.alarm-title {
  overflow: hidden;
  padding-right: 10px;
  color: #526077;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.alarm-time {
  color: #8490a3;
  text-align: right;
}

.alarm-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  gap: 6px;
  color: #18ae61;
  font-size: 11px;
}

.alarm-empty .q-icon {
  font-size: 17px;
}

/* =========================
   Quasar
   ========================= */

.dashboard-home :deep(.q-linear-progress) {
  border-radius: 99px;
}

.dashboard-home :deep(.q-inner-loading) {
  border-radius: 12px;
}

/* =========================
   自适应
   ========================= */

@media (max-width: 1500px) {
  .dashboard-home {
    padding: 12px;
  }

  .summary-grid {
    gap: 10px;
  }

  .summary-card {
    height: 100px;
    padding: 12px;
  }

  .summary-icon {
    width: 46px;
    height: 46px;
    flex-basis: 46px;
    margin-right: 10px;
    font-size: 24px;
  }

  .summary-main {
    font-size: 21px;
  }

  .dashboard-main-grid {
    grid-template-columns: minmax(0, 2fr) minmax(340px, 0.92fr);
    gap: 10px;
  }

  .dashboard-left,
  .dashboard-right,
  .bottom-overview-grid {
    gap: 10px;
  }

  .topology-info {
    transform: scale(0.92);
  }

  .topology-pool {
    transform: translateX(-50%) scale(0.92);
  }

  .topology-network {
    transform: translateX(-50%) scale(0.92);
  }
}

@media (max-width: 1250px) {
  .summary-card {
    padding: 10px;
  }

  .summary-icon {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    margin-right: 8px;
    font-size: 21px;
  }

  .summary-label {
    font-size: 12px;
  }

  .summary-main {
    font-size: 19px;
  }

  .summary-sub {
    font-size: 10px;
  }

  .topology-vm {
    left: 5%;
  }

  .topology-lxc {
    right: 4%;
  }

  .topology-storage {
    right: 1%;
  }
}
</style>
