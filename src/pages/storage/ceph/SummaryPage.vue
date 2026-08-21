<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import LineMetricChart from '@/components/LineMetricChart.vue';
import LegacyRingChart from '@/pages/dashboard/components/LegacyRingChart.vue';
import type { PveRecord } from '@/api/resources';
import { getCephMetadata, getCephStatus } from '@/api/ceph';
import { gettext } from '@/locale';
import { formatBytes, textValue, usedPercent } from '@/utils/pveFormat';

type PgState = { state_name: string; count: number; category: string; color: string };
type WarningRow = { id: string; severity: string; summary: string; detail: string };
type ServiceRow = {
  id: string;
  type: string;
  name: string;
  host: string;
  address: string;
  version: string;
  status: string;
  color: string;
};
type PerformancePoint = {
  time: string;
  reads: number;
  writes: number;
  readIops: number;
  writeIops: number;
};

const loading = ref(false);
const status = shallowRef<PveRecord>({});
const metadata = shallowRef<PveRecord>({});
const performanceHistory = shallowRef<PerformancePoint[]>([]);
let statusTimer: ReturnType<typeof setInterval> | undefined;
let metadataTimer: ReturnType<typeof setInterval> | undefined;

const health = computed(() =>
  textValue(
    (status.value.health as PveRecord | undefined)?.status || status.value.health,
    'UNKNOWN',
  ),
);
const healthColor = computed(() => statusColor(health.value));
const pgmap = computed(() => (status.value.pgmap || {}) as PveRecord);
const osdmap = computed(
  () =>
    ((status.value.osdmap as PveRecord | undefined)?.osdmap ||
      status.value.osdmap ||
      {}) as PveRecord,
);
const usage = computed(() =>
  usedPercent(Number(pgmap.value.bytes_used), Number(pgmap.value.bytes_total)),
);
const capacity = computed(() => {
  const total = Number(pgmap.value.bytes_total) || 0;
  const used = Number(pgmap.value.bytes_used) || 0;
  const reportedAvailable = Number(pgmap.value.bytes_avail);
  return {
    total,
    used,
    available: Number.isFinite(reportedAvailable)
      ? Math.max(0, reportedAvailable)
      : Math.max(0, total - used),
  };
});
const cephVersion = computed(() => {
  const nodes = (metadata.value.node || {}) as PveRecord;
  return Object.values(nodes).reduce((latest, node) => {
    const version = textValue(
      (node as PveRecord)?.version && ((node as PveRecord).version as PveRecord).str,
    );
    return version > (latest as string) ? version : latest;
  }, '');
});
const warnings = computed<WarningRow[]>(() => {
  const checks = ((status.value.health as PveRecord | undefined)?.checks || {}) as PveRecord;
  return Object.entries(checks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const check = value as PveRecord;
      const detail = Array.isArray(check.detail)
        ? check.detail
            .map((entry) => textValue((entry as PveRecord).message))
            .filter(Boolean)
            .join('\n')
        : textValue(check.detail);
      return {
        id,
        severity: textValue(check.severity, 'HEALTH_UNKNOWN'),
        summary: textValue((check.summary as PveRecord)?.message, id),
        detail,
      };
    });
});
const pgStates = computed<PgState[]>(() => {
  const values = Array.isArray(pgmap.value.pgs_by_state) ? pgmap.value.pgs_by_state : [];
  return values
    .map((item) => {
      const value = item as PveRecord;
      const state = textValue(value.state_name);
      const category = pgCategory(state);
      return {
        state_name: state,
        count: Number(value.count) || 0,
        category: category.label,
        color: category.color,
      };
    })
    .sort((a, b) => a.state_name.localeCompare(b.state_name));
});
const pgSummary = computed(() =>
  ['Unknown', 'Clean', 'Busy', 'Warning', 'Critical']
    .map((label) => ({
      label,
      count: pgStates.value
        .filter((item) => item.category === label)
        .reduce((sum, item) => sum + item.count, 0),
      color: pgCategory(label.toLowerCase()).color,
    }))
    .filter((item) => item.count > 0),
);
type RingData = {
  cls: 'faded' | 'good' | 'warning' | 'critical';
  count: number;
  state_name?: string;
};
const pgChartData = computed<RingData[]>(() =>
  pgSummary.value.map((item) => ({
    count: item.count,
    state_name: item.label,
    cls:
      item.color === 'positive'
        ? 'good'
        : item.color === 'warning'
          ? 'warning'
          : item.color === 'negative'
            ? 'critical'
            : 'faded',
  })),
);
const chartXAxis = computed(() => performanceHistory.value.map((item) => item.time));
const bandwidthSeries = computed(() => [
  {
    name: gettext('Reads'),
    data: performanceHistory.value.map((item) => item.reads),
    color: '#ef6c00',
  },
  {
    name: gettext('Writes'),
    data: performanceHistory.value.map((item) => item.writes),
    color: '#c62828',
  },
]);
const iopsSeries = computed(() => [
  {
    name: `IOPS: ${gettext('Reads')}`,
    data: performanceHistory.value.map((item) => item.readIops),
    color: '#00838f',
  },
  {
    name: `IOPS: ${gettext('Writes')}`,
    data: performanceHistory.value.map((item) => item.writeIops),
    color: '#1976d2',
  },
]);
const osdStatus = computed(() => {
  const total = Number(osdmap.value.num_osds) || 0;
  const up = Number(osdmap.value.num_up_osds) || 0;
  const inside = Number(osdmap.value.num_in_osds) || 0;
  const downIn =
    warnings.value
      .find((warning) => warning.id === 'OSD_DOWN')
      ?.summary.match(/(\d+) osds down/)?.[1] || '0';
  const down = total - up;
  const downInCount = Number(downIn);
  const upIn = Math.max(0, inside - downInCount);
  return {
    total,
    upIn,
    upOut: Math.max(0, up - upIn),
    downIn: downInCount,
    downOut: Math.max(0, down - downInCount),
  };
});
const services = computed<ServiceRow[]>(() =>
  ['mon', 'mgr', 'mds']
    .flatMap((type) => {
      const entries = metadata.value[type];
      const values = Array.isArray(entries)
        ? entries
        : Object.entries((entries || {}) as PveRecord).map(([id, item]) => ({
            id,
            ...(item as PveRecord),
          }));
      return values.map((item) => {
        const service = item as PveRecord;
        const id =
          textValue(service.id) ||
          `${textValue(service.name)}@${textValue(service.hostname || service.host)}`;
        const [nameFromId, hostFromId] = id.split('@');
        const name = textValue(service.name, nameFromId || '-');
        const host = textValue(service.hostname || service.host, hostFromId || '-');
        const active =
          type === 'mgr' &&
          textValue((status.value.mgrmap as PveRecord | undefined)?.active_name) === name;
        const standby =
          type === 'mgr' &&
          Array.isArray((status.value.mgrmap as PveRecord | undefined)?.standbys) &&
          ((status.value.mgrmap as PveRecord).standbys as PveRecord[]).some(
            (mgr) => textValue(mgr.name) === name,
          );
        const state = active
          ? gettext('active')
          : standby
            ? gettext('standby')
            : textValue(service.status || service.state || service.service, gettext('Unknown'));
        return {
          id: `${type}-${id}`,
          type,
          name,
          host,
          address: textValue(service.addr || service.addrs, gettext('Unknown')),
          version: textValue(
            service.version || (metadata.value.version as PveRecord | undefined)?.[host],
            '-',
          ),
          status: state,
          color: statusColor(state),
        };
      });
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.host.localeCompare(b.host)),
);
const serviceGroups = computed(() =>
  [
    { type: 'mon', title: gettext('Monitors') },
    { type: 'mgr', title: gettext('Managers') },
    { type: 'mds', title: gettext('Metadata Servers') },
  ].map((group) => ({
    ...group,
    items: services.value.filter((service) => service.type === group.type),
  })),
);
const recovery = computed(() => {
  const total =
    Number(
      pgmap.value.misplaced_total || pgmap.value.unfound_total || pgmap.value.degraded_total,
    ) || 0;
  const unhealthy =
    Number(pgmap.value.degraded_objects || 0) +
    Number(pgmap.value.misplaced_objects || 0) +
    Number(pgmap.value.unfound_objects || 0);
  return total > 0
    ? {
        total,
        recovered: Math.max(0, total - unhealthy),
        percent: Math.max(0, Math.min(100, ((total - unhealthy) / total) * 100)),
        speed: Number(pgmap.value.recovering_bytes_per_sec) || 0,
      }
    : null;
});

function statusColor(value: string) {
  const normalized = value.toUpperCase();
  if (normalized.includes('ERR') || normalized.includes('CRIT') || normalized.includes('DOWN'))
    return 'negative';
  if (normalized.includes('WARN') || normalized.includes('OUT') || normalized.includes('UNKNOWN'))
    return 'warning';
  if (normalized.includes('OK') || normalized === 'ACTIVE') return 'positive';
  return 'grey-7';
}

function pgCategory(state: string) {
  const parts = state.split(/[^a-z]+/);
  if (
    parts.some((item) =>
      [
        'backfill_toofull',
        'backfill_unfound',
        'down',
        'incomplete',
        'inconsistent',
        'recovery_toofull',
        'recovery_unfound',
        'snaptrim_error',
        'stale',
      ].includes(item),
    )
  )
    return { label: 'Critical', color: 'negative' };
  if (parts.some((item) => ['degraded', 'undersized'].includes(item)))
    return { label: 'Warning', color: 'warning' };
  if (
    parts.some((item) =>
      [
        'activating',
        'backfill_wait',
        'backfilling',
        'creating',
        'deep',
        'forced_backfill',
        'forced_recovery',
        'peered',
        'peering',
        'recovering',
        'recovery_wait',
        'remapped',
        'repair',
        'scrubbing',
        'snaptrim',
        'snaptrim_wait',
      ].includes(item),
    )
  )
    return { label: 'Busy', color: 'info' };
  if (parts.some((item) => ['clean', 'active'].includes(item)))
    return { label: 'Clean', color: 'positive' };
  return { label: 'Unknown', color: 'grey-6' };
}

async function refreshStatus() {
  const response = await getCephStatus();
  status.value = response.data || {};
  const latestPgmap = (status.value.pgmap || {}) as PveRecord;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  performanceHistory.value = [
    ...performanceHistory.value,
    {
      time,
      reads: Number(latestPgmap.read_bytes_sec) || 0,
      writes: Number(latestPgmap.write_bytes_sec) || 0,
      readIops: Number(latestPgmap.read_op_per_sec) || 0,
      writeIops: Number(latestPgmap.write_op_per_sec) || 0,
    },
  ].slice(-30);
}
async function refreshMetadata() {
  const response = await getCephMetadata();
  metadata.value = response.data || {};
}
async function refreshData() {
  loading.value = true;
  try {
    await Promise.allSettled([refreshStatus(), refreshMetadata()]);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refreshData();
  statusTimer = setInterval(() => void refreshStatus(), 5000);
  metadataTimer = setInterval(() => void refreshMetadata(), 15000);
});
onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer);
  if (metadataTimer) clearInterval(metadataTimer);
});
</script>

<template>
  <div class="ceph-summary column q-gutter-md">
    <div class="row justify-end">
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :loading="loading"
        :label="gettext('Refresh')"
        @click="refreshData"
      />
    </div>
    <div class="row q-col-gutter-sm">
      <div class="col-12 col-lg-6">
        <q-card class="summary-panel no-shadow no-border-radius full-height"
          ><q-card-section class="panel-section"
            ><div class="panel-header">{{ gettext('Health') }}</div>
            <div class="panel-content row q-col-gutter-lg items-center">
              <div class="col-12 col-sm-4 text-center">
                <q-icon name="health_and_safety" :color="healthColor" size="54px" />
                <div class="text-h6 q-mt-sm" :class="`text-${healthColor}`">{{ health }}</div>
                <div class="text-caption text-grey-7 q-mt-sm">
                  {{ gettext('Ceph Version') }}: {{ cephVersion || '-' }}
                </div>
              </div>
              <div class="col-12 col-sm-8">
                <div v-if="warnings.length" class="column q-gutter-sm">
                  <q-expansion-item
                    v-for="warning in warnings"
                    :key="warning.id"
                    dense
                    dense-toggle
                    expand-separator
                    header-class="warning-row"
                    ><template #header
                      ><q-item-section avatar
                        ><q-icon
                          name="error"
                          :color="statusColor(warning.severity)" /></q-item-section
                      ><q-item-section
                        ><div>{{ warning.summary }}</div>
                        <div class="text-caption text-grey-7">
                          {{ warning.severity }}
                        </div></q-item-section
                      ></template
                    >
                    <div class="warning-detail">
                      {{ warning.detail || gettext('no additional data') }}
                    </div></q-expansion-item
                  >
                </div>
                <div v-else class="text-positive text-center q-pa-md">
                  <q-icon name="check_circle" size="22px" class="q-mr-sm" />{{
                    gettext('No Warnings/Errors')
                  }}
                </div>
              </div>
            </div></q-card-section
          ></q-card
        >
      </div>
      <div class="col-12 col-lg-6">
        <q-card class="summary-panel no-shadow no-border-radius full-height"
          ><q-card-section class="panel-section"
            ><div class="panel-header">{{ gettext('Status') }}</div>
            <div class="panel-content row q-col-gutter-lg">
              <div class="col-12 col-sm-5">
                <div class="text-subtitle2 text-center q-mb-sm">{{ gettext('OSDs') }}</div>
                <table class="osd-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>{{ gettext('In') }}</th>
                      <th>{{ gettext('Out') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>{{ gettext('Up') }}</th>
                      <td>{{ osdStatus.upIn }}</td>
                      <td>{{ osdStatus.upOut }}</td>
                    </tr>
                    <tr>
                      <th>{{ gettext('Down') }}</th>
                      <td>{{ osdStatus.downIn }}</td>
                      <td>{{ osdStatus.downOut }}</td>
                    </tr>
                  </tbody>
                </table>
                <div class="text-center q-mt-sm">{{ gettext('Total') }}: {{ osdStatus.total }}</div>
              </div>
              <div class="col-12 col-sm-7">
                <div class="text-subtitle2 q-mb-sm">{{ gettext('PGs') }}</div>
                <div class="pg-chart-wrap">
                  <LegacyRingChart
                    v-if="pgChartData.length"
                    :chart-data="pgChartData"
                    :chart-option="{ radius: ['46%', '74%'] }"
                  />
                  <div class="pg-chart-center">
                    <strong>{{ pgmap.num_pgs || 0 }}</strong
                    ><span>{{ gettext('PGs') }}</span>
                  </div>
                </div>
                <div v-if="pgStates.length" class="pg-state-list">
                  <div v-for="state in pgStates" :key="state.state_name" class="row items-center">
                    <q-icon name="circle" :color="state.color" size="10px" class="q-mr-sm" /><span
                      class="col"
                      >{{ state.state_name }}</span
                    ><span>{{ state.count }}</span>
                  </div>
                </div>
                <div v-else class="text-grey-7">-</div>
              </div>
            </div></q-card-section
          ></q-card
        >
      </div>
    </div>
    <q-card class="summary-panel no-shadow no-border-radius"
      ><q-card-section class="panel-section"
        ><div class="panel-header">{{ gettext('Services') }}</div>
        <div class="service-grid">
          <section v-for="group in serviceGroups" :key="group.type" class="service-group">
            <div class="service-group-title">{{ group.title }}</div>
            <div v-if="group.items.length" class="service-list">
              <div v-for="service in group.items" :key="service.id" class="service-widget">
                <span>{{ service.name }}</span
                ><q-icon name="circle" :color="service.color" size="12px" /><q-tooltip
                  class="service-tooltip"
                  ><div>{{ gettext('Host') }}: {{ service.host }}</div>
                  <div>{{ gettext('Address') }}: {{ service.address }}</div>
                  <div>{{ gettext('Version') }}: {{ service.version }}</div>
                  <div>{{ gettext('Status') }}: {{ service.status }}</div></q-tooltip
                >
              </div>
            </div>
            <div v-else class="service-empty">-</div>
          </section>
        </div></q-card-section
      ></q-card
    >
    <q-card class="summary-panel no-shadow no-border-radius"
      ><q-card-section class="panel-section"
        ><div class="panel-header">{{ gettext('Performance') }}</div>
        <div class="performance-layout">
          <div class="usage-ring-panel">
            <div class="metric-label">{{ gettext('Usage') }}</div>
            <q-circular-progress
              show-value
              class="usage-ring"
              size="116px"
              :thickness="0.16"
              :value="usage"
              color="primary"
              track-color="blue-grey-1"
              >{{ usage.toFixed(0) }}%</q-circular-progress
            >
            <div class="usage-ring-value">
              {{ formatBytes(capacity.used) }} {{ gettext('of') }} {{ formatBytes(capacity.total) }}
            </div>
            <dl class="capacity-summary">
              <div>
                <dt>{{ gettext('Total') }}</dt>
                <dd>{{ formatBytes(capacity.total) }}</dd>
              </div>
              <div>
                <dt>{{ gettext('Used') }}</dt>
                <dd>{{ formatBytes(capacity.used) }}</dd>
              </div>
              <div>
                <dt>{{ gettext('Available') }}</dt>
                <dd>{{ formatBytes(capacity.available) }}</dd>
              </div>
              <div>
                <dt>{{ gettext('Usage') }}</dt>
                <dd>{{ usage.toFixed(0) }}%</dd>
              </div>
            </dl>
            <div v-if="recovery" class="recovery-summary">
              <span>{{ gettext('Recovery') }} / {{ gettext('Rebalance') }}</span
              ><strong>{{ recovery.recovered }} / {{ recovery.total }}</strong
              ><q-linear-progress rounded size="8px" :value="recovery.percent / 100" color="info" />
            </div>
          </div>
          <div class="performance-charts">
            <div class="chart-block">
              <div class="chart-header">
                <strong>{{ gettext('Reads') }} / {{ gettext('Writes') }}</strong>
              </div>
              <LineMetricChart
                :x-data="chartXAxis"
                :series="bandwidthSeries"
                unit-type="bytespersecond"
                power-of-two
                :height="210"
              />
            </div>
            <div class="chart-block">
              <div class="chart-header">
                <strong>IOPS: {{ gettext('Reads') }} / {{ gettext('Writes') }}</strong>
              </div>
              <LineMetricChart
                :x-data="chartXAxis"
                :series="iopsSeries"
                y-unit="IOPS"
                :height="210"
              />
            </div>
          </div></div></q-card-section
    ></q-card>
  </div>
</template>

<style scoped>
.ceph-summary {
  padding: 16px;
}
.summary-panel {
  background: #fff;
  border: 1px solid #dfe1e6;
}
.panel-section {
  padding: 0;
}
.panel-header {
  align-items: center;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
  color: #174f86;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  min-height: 38px;
  padding: 0 14px;
}
.panel-content {
  padding: 16px;
}
.warning-row {
  min-height: 46px;
}
.warning-detail {
  padding: 8px 16px 12px 56px;
  white-space: pre-wrap;
  font-family: monospace;
  color: #555;
}
.osd-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
}
.osd-table th,
.osd-table td {
  padding: 6px;
  border-bottom: 1px solid #dfe1e6;
}
.osd-table th {
  font-weight: 500;
}
.pg-chart-wrap {
  height: 148px;
  position: relative;
}
.pg-chart-center {
  align-items: center;
  display: flex;
  flex-direction: column;
  inset: 0;
  justify-content: center;
  pointer-events: none;
  position: absolute;
}
.pg-chart-center strong {
  color: #333;
  font-size: 20px;
  line-height: 24px;
}
.pg-chart-center span {
  color: #666;
  font-size: 12px;
}
.pg-state-list {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 10px;
}
.service-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 128px;
  padding: 14px 18px 20px;
}
.service-group {
  min-width: 0;
  padding: 0 18px;
  text-align: center;
}
.service-group + .service-group {
  border-left: 1px solid #dfe1e6;
}
.service-group-title {
  color: #174f86;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}
.service-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.service-widget {
  align-items: center;
  color: #333;
  display: inline-flex;
  gap: 6px;
  justify-content: center;
  line-height: 20px;
}
.service-empty,
.metric-caption {
  color: #666;
  font-size: 12px;
}
.service-tooltip {
  font-size: 12px;
  line-height: 20px;
}
.metric-label {
  color: #666;
  font-size: 12px;
  margin-bottom: 6px;
}
.metric-value {
  color: #333;
  font-size: 15px;
  font-weight: 600;
  min-height: 22px;
}
.performance-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}
.usage-ring-panel {
  align-items: center;
  border-right: 1px solid #dfe1e6;
  display: flex;
  flex-direction: column;
  min-height: 458px;
  padding: 18px;
  text-align: center;
}
.usage-ring {
  margin: 12px 0 10px;
}
.usage-ring-value {
  color: #333;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.capacity-summary {
  align-self: stretch;
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 12px 0 0;
  text-align: left;
}
.capacity-summary div {
  min-width: 0;
}
.capacity-summary dt {
  color: #666;
  font-size: 12px;
}
.capacity-summary dd {
  color: #333;
  font-size: 12px;
  font-weight: 600;
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recovery-summary {
  align-self: stretch;
  display: grid;
  gap: 8px;
  margin-top: 26px;
  text-align: left;
}
.recovery-summary span {
  color: #666;
  font-size: 12px;
}
.recovery-summary strong {
  color: #333;
  font-size: 13px;
}
.performance-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0 10px;
}
.chart-block {
  min-width: 0;
}
.chart-block + .chart-block {
  border-left: 1px solid #dfe1e6;
}
.chart-header {
  align-items: center;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
  color: #174f86;
  display: flex;
  min-height: 38px;
  padding: 0 14px;
}
.chart-header strong {
  font-size: 13px;
  font-weight: 600;
}
@media (max-width: 900px) {
  .performance-layout {
    grid-template-columns: 1fr;
  }
  .usage-ring-panel {
    border-bottom: 1px solid #dfe1e6;
    border-right: 0;
    min-height: auto;
  }
}
@media (max-width: 760px) {
  .pg-state-list,
  .performance-charts,
  .service-grid {
    grid-template-columns: 1fr;
  }
  .chart-block + .chart-block,
  .service-group + .service-group {
    border-left: 0;
    border-top: 1px solid #dfe1e6;
  }
  .chart-block + .chart-block {
    margin-top: 12px;
  }
  .service-grid {
    gap: 14px;
  }
  .service-group {
    padding: 0;
  }
  .service-group + .service-group {
    padding-top: 14px;
  }
}
</style>
