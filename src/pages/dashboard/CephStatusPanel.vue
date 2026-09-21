<template>
  <q-card
    flat
    bordered
    class="ceph-status-card"
  >
    <q-card-section class="ceph-status-card__header">
      <div class="ceph-status-card__title">{{ gettext('状态') }}</div>
    </q-card-section>

    <q-separator />

    <q-card-section class="ceph-status-card__body">
      <div class="row">
        <div class="col-6 ceph-section ceph-section--osd">
          <div class="ceph-section__title">OSDs</div>

          <div class="osd-table">
            <div class="osd-row osd-row--header">
              <div class="osd-cell osd-cell--label"></div>
              <div class="osd-cell">
                <div class="osd-head-label">
                  <span class="legend-dot legend-dot--in"></span>
                  <span>{{ gettext('已加入') }}</span>
                </div>
              </div>
              <div class="osd-cell">
                <div class="osd-head-label">
                  <span class="legend-dot legend-dot--out"></span>
                  <span>{{ gettext('已移出') }}</span>
                </div>
              </div>
            </div>

            <div class="osd-row">
              <div class="osd-cell osd-cell--label">
                <div class="osd-status osd-status--online">
                  <q-icon
                    name="arrow_circle_up"
                    size="17px"
                  />
                  <span>{{ gettext('在线') }}</span>
                </div>
              </div>
              <div class="osd-cell osd-cell--value">{{ osdStatus.upIn }}</div>
              <div class="osd-cell osd-cell--value">{{ osdStatus.upOut }}</div>
            </div>

            <div class="osd-row">
              <div class="osd-cell osd-cell--label">
                <div class="osd-status osd-status--offline">
                  <q-icon
                    name="arrow_circle_down"
                    size="17px"
                  />
                  <span>{{ gettext('离线') }}</span>
                </div>
              </div>
              <div class="osd-cell osd-cell--value">{{ osdStatus.downIn }}</div>
              <div class="osd-cell osd-cell--value">{{ osdStatus.downOut }}</div>
            </div>
          </div>

          <div class="osd-total">
            {{ gettext('总计') }}：
            <span>{{ osdStatus.total }}</span>
          </div>
        </div>

        <div class="col-6 ceph-section ceph-section--pg">
          <div class="pg-content">
            <div class="pg-donut" :style="donutStyle">
              <div class="pg-donut__inner">
                <div class="pg-donut__value">{{ totalPgs }}</div>
                <div class="pg-donut__label">PGs</div>
              </div>
            </div>

            <div class="pg-legend">
              <div
                v-for="legend in pgLegendItems"
                :key="legend.key"
                class="pg-legend__item"
              >
                <span class="pg-legend__dot" :style="{ background: legend.color }"></span>
                <span class="pg-legend__label">{{ legend.label }}：</span>
                <span class="pg-legend__value">{{ legend.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>

    <q-card-section class="health-summary">
      <div class="health-summary__label">{{ gettext('概要') }}</div>
      <div class="health-summary__content">
        <q-icon
          :name="health.icon"
          size="18px"
          :class="health.iconClass"
        />
        <span>{{ health.summary }}</span>
      </div>
      <div
        v-if="warnings.length"
        class="health-warnings"
      >
        <div
          v-for="warning in warnings"
          :key="warning.id"
          class="health-warnings__item"
        >
          <span
            class="health-warnings__severity"
            :class="`health-warnings__severity--${warning.severityClass}`"
          >{{ warning.severityLabel }}：</span>
          <span class="health-warnings__summary">{{ warning.summary }}</span>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephStatus, getCephMetadata } from '@/api/ceph';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type WarningRow = {
  id: string;
  severity: string;
  severityClass: 'ok' | 'warn' | 'error' | 'muted';
  severityLabel: string;
  summary: string;
};

const status = shallowRef<PveRecord>({});
const metadata = shallowRef<PveRecord>({});
const { node = 'localhost' } = defineProps<{ node?: string }>();
let statusTimer: ReturnType<typeof setInterval> | undefined;
let metadataTimer: ReturnType<typeof setInterval> | undefined;

const osdmap = computed(() => (status.value.osdmap || {}) as PveRecord);
const pgmap = computed(() => (status.value.pgmap || {}) as PveRecord);
const totalPgs = computed(() => Number(pgmap.value.num_pgs) || 0);

const warnings = computed<WarningRow[]>(() => {
  const checks = ((status.value.health as PveRecord | undefined)?.checks || {}) as PveRecord;
  return Object.entries(checks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const check = value as PveRecord;
      const rawSeverity = textValue(check.severity, 'HEALTH_UNKNOWN');
      const severityClass = rawSeverity.includes('ERR')
        ? 'error'
        : rawSeverity.includes('WARN')
        ? 'warn'
        : rawSeverity.includes('OK')
        ? 'ok'
        : 'muted';
      const severityLabel =
        severityClass === 'error'
          ? gettext('错误')
          : severityClass === 'warn'
          ? gettext('警告')
          : severityClass === 'ok'
          ? gettext('正常')
          : gettext('未知');
      return {
        id,
        severity: rawSeverity,
        severityClass,
        severityLabel,
        summary: textValue((check.summary as PveRecord)?.message, id),
      };
    });
});

const osdStatus = computed(() => {
  const total = Number(osdmap.value.num_osds) || 0;
  const up = Number(osdmap.value.num_up_osds) || 0;
  const inside = Number(osdmap.value.num_in_osds) || 0;
  const downInRaw = warnings.value
    .find((warning) => warning.id === 'OSD_DOWN')
    ?.summary.match(/(\d+) osds down/)?.[1] || '0';
  const down = total - up;
  const downInCount = Number(downInRaw);
  const upIn = Math.max(0, inside - downInCount);
  return {
    total,
    upIn,
    upOut: Math.max(0, up - upIn),
    downIn: downInCount,
    downOut: Math.max(0, down - downInCount),
  };
});

type PgStateCategory = { label: string; color: string };
function pgCategory(state: string): PgStateCategory {
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
      ].includes(item)
    )
  ) {
    return { label: 'Critical', color: '#e35d6a' };
  }
  if (parts.some((item) => ['degraded', 'undersized'].includes(item))) {
    return { label: 'Warning', color: '#e59b3a' };
  }
  if (parts.includes('clean') || parts.includes('active')) {
    return { label: 'Clean', color: '#27a474' };
  }
  return { label: 'Unknown', color: '#929baa' };
}

const pgStates = computed(() => {
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
  [
    { label: 'Clean', color: '#27a474' },
    { label: 'Warning', color: '#e59b3a' },
    { label: 'Critical', color: '#e35d6a' },
  ]
    .map((category) => ({
      ...category,
      count: pgStates.value
        .filter((item) => item.category === category.label)
        .reduce((sum, item) => sum + item.count, 0),
    }))
    .filter((item) => item.count > 0)
);

const pgLegendItems = computed(() => {
  const lookup = Object.fromEntries(pgSummary.value.map((item) => [item.label, item]));
  return [
    {
      key: 'active+clean',
      label: 'active+clean',
      color: lookup['Clean']?.color || '#27a474',
      count: lookup['Clean']?.count || 0,
    },
    {
      key: 'degraded',
      label: 'degraded',
      color: lookup['Warning']?.color || '#e59b3a',
      count: lookup['Warning']?.count || 0,
    },
    {
      key: 'undersized',
      label: 'undersized',
      color: lookup['Critical']?.color || '#e35d6a',
      count: lookup['Critical']?.count || 0,
    },
  ];
});

const donutStyle = computed(() => {
  const total = totalPgs.value || 1;
  const segments = [
    { count: pgLegendItems.value[0].count, color: pgLegendItems.value[0].color },
    { count: pgLegendItems.value[1].count, color: pgLegendItems.value[1].color },
    { count: pgLegendItems.value[2].count, color: pgLegendItems.value[2].color },
  ];
  let deg = 0;
  const parts: string[] = [];
  segments.forEach((segment) => {
    const span = (segment.count / total) * 360;
    if (span > 0) {
      const start = deg;
      const end = deg + span;
      parts.push(`${segment.color} ${start}deg ${end}deg`);
    }
    deg += span;
  });
  if (!parts.length || deg < 360) parts.push(`#edf0f3 ${deg}deg 360deg`);
  return { background: `conic-gradient(${parts.join(', ')})` };
});

const health = computed(() => {
  const overall = textValue(
    ((status.value.health as PveRecord | undefined)?.status as PveRecord | undefined)?.overall ||
      status.value.healthstatus,
    'HEALTH_UNKNOWN'
  ).toUpperCase();
  if (overall.includes('ERR')) {
    const first = warnings.value.find((w) => w.severityClass === 'error');
    return {
      icon: 'error',
      iconClass: 'text-negative',
      summary: first?.summary || gettext('集群存在错误，请检查健康警告详情'),
    };
  }
  if (overall.includes('WARN')) {
    const first = warnings.value.find((w) => w.severityClass === 'warn') || warnings.value[0];
    return {
      icon: 'warning',
      iconClass: 'text-warning',
      summary: first?.summary || gettext('集群存在警告，请检查健康警告详情'),
    };
  }
  if (warnings.value.length) {
    return {
      icon: 'info',
      iconClass: 'text-primary',
      summary: warnings.value[0].summary,
    };
  }
  return {
    icon: 'task_alt',
    iconClass: 'text-positive',
    summary: gettext('集群运行正常，所有节点和 Ceph 服务均处于健康状态'),
  };
});

async function refreshStatus() {
  const response = await getCephStatus(node);
  status.value = response.data || {};
}
async function refreshMetadata() {
  const response = await getCephMetadata(node);
  metadata.value = response.data || {};
}
async function refreshData() {
  await Promise.allSettled([refreshStatus(), refreshMetadata()]);
}

onMounted(() => {
  void refreshData();
  statusTimer = setInterval(() => void refreshStatus(), 5000);
  metadataTimer = setInterval(() => void refreshMetadata(), 15000);
});

onBeforeUnmount(() => {
  if (statusTimer) clearInterval(statusTimer);
  if (metadataTimer) clearInterval(metadataTimer);
});
</script>

<style scoped>
.ceph-status-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

.ceph-status-card__header {
  padding: 10px 14px;
}

.ceph-status-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

.ceph-status-card__body {
  padding: 14px;
}

.ceph-section {
  min-width: 0;
}

.ceph-section--osd {
  padding-right: 18px;
}

.ceph-section--pg {
  display: flex;
  align-items: center;
  padding-left: 18px;
  border-left: 1px solid #edf0f3;
}

.ceph-section__title {
  margin-bottom: 10px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
}

.osd-table {
  width: 100%;
}

.osd-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 34px;
  align-items: center;
  border-top: 1px solid #edf0f3;
}

.osd-row--header {
  min-height: 28px;
  border-top: 0;
}

.osd-cell {
  min-width: 0;
  color: #3e4653;
  font-size: 12px;
  text-align: center;
}

.osd-cell--label {
  text-align: center;
}

.osd-cell--value {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.osd-head-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #7b8494;
  font-size: 11px;
}

.osd-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #7b8494;
  font-size: 12px;
}

.osd-status--online .q-icon {
  color: #27a474;
}

.osd-status--offline .q-icon {
  color: #e35d6a;
}

.legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
}

.legend-dot--in {
  background: #27a474;
}

.legend-dot--out {
  background: transparent;
  border: 1px solid #e59b3a;
}

.osd-total {
  margin-top: 8px;
  color: #8b94a3;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.osd-total span {
  color: #303846;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.pg-content {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.pg-donut {
  position: relative;
  width: 112px;
  height: 112px;
  flex-shrink: 0;
  background: conic-gradient(#27a474 0deg 341deg, #e59b3a 341deg 354deg, #e35d6a 354deg 360deg);
  border-radius: 50%;
}

.pg-donut::after {
  position: absolute;
  inset: 20px;
  background: #ffffff;
  border-radius: 50%;
  content: '';
}

.pg-donut__inner {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.pg-donut__value {
  color: #303846;
  font-size: 20px;
  font-weight: 600;
  line-height: 24px;
  font-variant-numeric: tabular-nums;
}

.pg-donut__label {
  margin-top: 1px;
  color: #8b94a3;
  font-size: 10px;
  line-height: 14px;
}

.pg-legend {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.pg-legend__item {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.pg-legend__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-right: 7px;
  border-radius: 50%;
}

.pg-legend__label {
  color: #7b8494;
  font-size: 11px;
}

.pg-legend__value {
  margin-left: auto;
  padding-left: 5px;
  color: #303846;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.health-summary {
  margin: 14px;
  padding: 9px 11px;
  background: #f7f9fc;
  border: 1px solid #edf0f3;
  border-radius: 6px;
}

.health-summary__label {
  margin-bottom: 4px;
  color: #7b8494;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}

.health-summary__content {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: #3e4653;
  font-size: 12px;
  line-height: 20px;
}

.health-warnings {
  margin-top: 6px;
  display: grid;
  gap: 4px;
}

.health-warnings__item {
  font-size: 11px;
  line-height: 17px;
}

.health-warnings__severity {
  font-weight: 600;
}

.health-warnings__severity--error {
  color: #c62828;
}

.health-warnings__severity--warn {
  color: #e59b3a;
}

.health-warnings__severity--ok {
  color: #27a474;
}

.health-warnings__severity--muted {
  color: #8b94a3;
}

.health-warnings__summary {
  color: #3e4653;
}
</style>
