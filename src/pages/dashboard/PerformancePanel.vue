<template>
  <q-card flat bordered class="performance-card">
    <q-card-section class="performance-card__header">
      <div class="row items-center justify-between">
        <div class="performance-card__title">{{ gettext('性能') }}</div>

        <q-btn
          flat
          dense
          no-caps
          color="primary"
          :label="gettext('近 24 小时')"
          icon-right="chevron_right"
          class="performance-card__action"
        />
      </div>
    </q-card-section>

    <q-separator />

    <q-card-section class="performance-card__body">
      <div class="performance-layout">
        <div class="usage-column">
          <div class="usage-section">
            <div class="usage-section__title">{{ gettext('使用率') }}</div>

            <div class="half-gauge">
              <div class="half-gauge__track">
                <div
                  class="half-gauge__progress"
                  :style="{
                    background: `conic-gradient(from 270deg, #1976d2 0deg, #1976d2 ${
                      usage * 1.8
                    }deg, transparent ${usage * 1.8}deg, transparent 360deg)`,
                  }"
                ></div>

                <div class="half-gauge__center">
                  <div class="half-gauge__value">
                    {{ usage.toFixed(0) }}<span>%</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="usage-section__label">{{ gettext('Ceph 使用率') }}</div>

            <div class="usage-section__caption">
              {{ gettext('已使用') }} {{ formatBytes(pgmap.bytes_used as number) }} /
              {{ gettext('总容量') }} {{ formatBytes(pgmap.bytes_total as number) }}
            </div>

            <div
              v-if="recovery"
              class="recovery-section"
            >
              <div class="recovery-heading">
                <span>{{ gettext('Recovery') }} / {{ gettext('Rebalance') }}</span>
                <strong>{{ recovery.recovered }} / {{ recovery.total }}</strong>
              </div>
              <q-linear-progress
                size="6px"
                :value="recovery.percent / 100"
                color="info"
                track-color="blue-grey-1"
              />
              <div
                v-if="recovery.speed"
                class="recovery-meta"
              >
                <span>{{ formatBytes(recovery.speed) }}/s</span>
                <span>{{ formatDuration(recovery.remainingSeconds) }} {{ gettext('left') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="performance-charts">
          <div class="chart-block">
            <LineMetricChart
              :x-data="chartXAxis"
              :series="bandwidthSeries"
              unit-type="bytespersecond"
              power-of-two
              :height="212"
            />
          </div>
          <div class="chart-block">
            <LineMetricChart
              :x-data="chartXAxis"
              :series="iopsSeries"
              y-unit="IOPS"
              :height="212"
            />
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import LineMetricChart from '@/components/LineMetricChart.vue';
import type { PveRecord } from '@/api/resources';
import { getCephStatus } from '@/api/ceph';
import { gettext } from '@/locale';
import { formatBytes, usedPercent } from '@/utils/pveFormat';

type PerformancePoint = {
  time: string;
  reads: number;
  writes: number;
  readIops: number;
  writeIops: number;
};

const status = shallowRef<PveRecord>({});
const performanceHistory = shallowRef<PerformancePoint[]>([]);
const { node = 'localhost' } = defineProps<{ node?: string }>();
let statusTimer: ReturnType<typeof setInterval> | undefined;

const pgmap = computed(() => (status.value.pgmap || {}) as PveRecord);
const usage = computed(() =>
  usedPercent(Number(pgmap.value.bytes_used), Number(pgmap.value.bytes_total))
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
const recovery = computed(() => {
  const total =
    Number(
      pgmap.value.misplaced_total || pgmap.value.unfound_total || pgmap.value.degraded_total
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
        remainingSeconds:
          Number(pgmap.value.recovering_bytes_per_sec) > 0
            ? unhealthy / (Number(pgmap.value.recovering_bytes_per_sec) / (4 * 1024 * 1024))
            : 0,
      }
    : null;
});

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const value = Math.round(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, `${remaining}s`]
    .filter(Boolean)
    .join(' ');
}

async function refreshStatus() {
  const response = await getCephStatus(node);
  status.value = response.data || {};
  const latestPgmap = (status.value.pgmap || {}) as PveRecord;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
    2,
    '0'
  )}:${String(now.getSeconds()).padStart(2, '0')}`;
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

onMounted(() => {
  void refreshStatus();
  statusTimer = setInterval(() => void refreshStatus(), 5000);
});

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<style scoped>
.performance-card {
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

.performance-card__header {
  padding: 10px 14px;
}

.performance-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

.performance-card__action {
  min-height: 28px;
  padding: 0 4px;
  font-size: 12px;
}

.performance-card__body {
  min-height: 0;
  flex: 1 1 auto;
  padding: 0;
}

.performance-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
}

.usage-column {}

.usage-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 212px;
  padding: 16px 28px;
  text-align: center;
  box-sizing: border-box;
}

.usage-section__title {
  margin-bottom: 8px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.usage-section__label {
  margin-top: 3px;
  color: #333;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.usage-section__caption {
  margin-top: 2px;
  color: #333;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.half-gauge {
  position: relative;
  width: 140px;
  height: 82px;
  overflow: hidden;
  margin: 10px 0 12px;
}

.half-gauge__track {
  position: absolute;
  top: 0;
  left: 0;
  width: 140px;
  height: 140px;
  background: conic-gradient(from 270deg, #edf1f5 0deg, #edf1f5 180deg, transparent 180deg);
  border-radius: 50%;
}

.half-gauge__progress {
  position: absolute;
  inset: 0;
  background: conic-gradient(
    from 270deg,
    #1976d2 0deg,
    #1976d2 99deg,
    transparent 99deg,
    transparent 360deg
  );
  border-radius: 50%;
}

.half-gauge__center {
  position: absolute;
  top: 15px;
  left: 15px;
  display: flex;
  width: 110px;
  height: 110px;
  align-items: flex-start;
  justify-content: center;
  padding-top: 32px;
  background: #ffffff;
  border-radius: 50%;
}

.half-gauge__value {
  color: #303846;
  font-size: 25px;
  font-weight: 600;
  line-height: 30px;
  font-variant-numeric: tabular-nums;
}

.half-gauge__value span {
  margin-left: 2px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 400;
}

.recovery-section {
  align-self: stretch;
  display: grid;
  gap: 9px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #dfe1e6;
  text-align: left;
}

.recovery-heading,
.recovery-meta {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.recovery-heading span,
.recovery-meta {
  color: #666;
  font-size: 12px;
}

.recovery-heading strong {
  color: #333;
  font-size: 13px;
}

.recovery-meta {
  gap: 10px;
}

.performance-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
}

.chart-block {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chart-block + .chart-block {}

@media (max-width: 900px) {
  .performance-layout {
    grid-template-columns: 1fr;
  }

  .usage-section {
    min-height: auto;
    height: auto;
  }

  .usage-column {
    border-right: 0;
  }
}

@media (max-width: 760px) {
  .performance-charts {
    grid-template-columns: 1fr;
  }

  .chart-block + .chart-block {
    border-left: 0;
  }
}
</style>


