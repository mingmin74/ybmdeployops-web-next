<template>
  <q-card
    flat
    bordered
    class="resources-card"
  >
    <!-- 标题 -->
    <q-card-section class="resources-card__header">
      <div class="row items-center justify-between">
        <div class="resources-card__title">资源</div>

        <q-btn
          flat
          dense
          round
          size="sm"
          icon="chevron_right"
          color="grey-6"
        />
      </div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="resources-card__body">
      <div class="row">
        <!-- CPU -->
        <div class="col-4 resource-item">
          <div class="resource-item__title">CPU</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div
                class="half-gauge__progress half-gauge__progress--cpu"
                :style="gaugeStyle(resources.cpu.percent)"
              ></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">
                  {{ resources.cpu.percent }}
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="resource-item__caption">
            {{ gettext('已使用') }} {{ resources.cpu.percent }}%
          </div>
        </div>

        <!-- 内存 -->
        <div class="col-4 resource-item resource-item--border">
          <div class="resource-item__title">内存</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div
                class="half-gauge__progress half-gauge__progress--memory"
                :style="gaugeStyle(resources.memory.percent)"
              ></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">
                  {{ resources.memory.percent }}
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="resource-item__caption">{{ resources.memory.caption }}</div>
        </div>

        <!-- 存储 -->
        <div class="col-4 resource-item">
          <div class="resource-item__title">存储</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div
                class="half-gauge__progress half-gauge__progress--storage"
                :style="gaugeStyle(resources.storage.percent)"
              ></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">
                  {{ resources.storage.percent }}
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="resource-item__caption">{{ resources.storage.caption }}</div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { getClusterResources, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/pveFormat';

type ResourceRow = PveRecord & {
  type?: string;
  id?: string;
  storage?: string;
  status?: string;
  shared?: boolean | number;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
};

type ResourceUsage = {
  used: number;
  total: number;
};

const records = shallowRef<ResourceRow[]>([]);
let refreshTimer: number | undefined;

const resources = computed(() => {
  const cpu: ResourceUsage = { used: 0, total: 0 };
  const memory: ResourceUsage = { used: 0, total: 0 };
  const storage: ResourceUsage = { used: 0, total: 0 };
  const countedStorage = new Set<string>();

  for (const record of records.value) {
    if (record.type === 'node') {
      const maxCpu = numberValue(record.maxcpu);
      cpu.used += numberValue(record.cpu) * maxCpu;
      cpu.total += maxCpu;
      memory.used += numberValue(record.mem);
      memory.total += numberValue(record.maxmem);
      continue;
    }

    if (record.type !== 'storage' || record.status === 'unknown') continue;

    // Matches PVE dc/Summary.js: shared storage is counted once, whereas local
    // or non-shared storage is counted separately for each node.
    const storageId = !record.shared || record.storage === 'local' ? record.id : record.storage;
    if (!storageId || countedStorage.has(storageId)) continue;

    storage.used += numberValue(record.disk);
    storage.total += numberValue(record.maxdisk);
    countedStorage.add(storageId);
  }

  return {
    cpu: toDisplayUsage(cpu, `${gettext('已使用')} ${usagePercent(cpu)}%`),
    memory: toDisplayUsage(memory),
    storage: toDisplayUsage(storage),
  };
});

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function usagePercent(usage: ResourceUsage) {
  if (usage.total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((usage.used / usage.total) * 100)));
}

function toDisplayUsage(usage: ResourceUsage, caption?: string) {
  return {
    percent: usagePercent(usage),
    caption: caption || `${formatBytes(usage.used)} / ${formatBytes(usage.total)}`,
  };
}

function gaugeStyle(percent: number) {
  return { '--gauge-progress': `${percent * 1.8}deg` };
}

async function refreshResources() {
  try {
    const response = await getClusterResources();
    records.value = Array.isArray(response.data) ? response.data : [];
  } catch {
    // Keep the latest successful snapshot visible while the periodic request retries.
  }
}

onMounted(() => {
  void refreshResources();
  refreshTimer = window.setInterval(() => void refreshResources(), 3000);
});

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<style scoped>
.resources-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* ---------------- header ---------------- */

.resources-card__header {
  padding: 10px 14px;
}

.resources-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* ---------------- body ---------------- */

.resources-card__body {
  padding: 16px 12px 14px;
}

/* ---------------- resource ---------------- */

.resource-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  padding: 0 14px;
}

.resource-item--border {
  border-right: 1px solid #edf0f3;
  border-left: 1px solid #edf0f3;
}

.resource-item__title {
  margin-bottom: 12px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.resource-item__caption {
  margin-top: 5px;
  overflow: hidden;
  color: #8b94a3;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- half gauge ---------------- */

.half-gauge {
  position: relative;
  width: 124px;
  height: 72px;
  overflow: hidden;
}

.half-gauge__track {
  position: absolute;
  top: 0;
  left: 0;
  width: 124px;
  height: 124px;
  background: conic-gradient(from 270deg, #edf1f5 0deg, #edf1f5 180deg, transparent 180deg);
  border-radius: 50%;
}

.half-gauge__progress {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.half-gauge__progress--cpu {
  background: conic-gradient(
    from 270deg,
    #1976d2 0deg,
    #1976d2 var(--gauge-progress),
    transparent var(--gauge-progress),
    transparent 360deg
  );
}

.half-gauge__progress--memory {
  background: conic-gradient(
    from 270deg,
    #5b8def 0deg,
    #5b8def var(--gauge-progress),
    transparent var(--gauge-progress),
    transparent 360deg
  );
}

.half-gauge__progress--storage {
  background: conic-gradient(
    from 270deg,
    #27a474 0deg,
    #27a474 var(--gauge-progress),
    transparent var(--gauge-progress),
    transparent 360deg
  );
}

/* 中心挖空 */
.half-gauge__center {
  position: absolute;
  top: 13px;
  left: 13px;
  display: flex;
  width: 98px;
  height: 98px;
  align-items: flex-start;
  justify-content: center;
  padding-top: 28px;
  background: #ffffff;
  border-radius: 50%;
}

.half-gauge__value {
  color: #303846;
  font-size: 22px;
  font-weight: 600;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
}

.half-gauge__value span {
  margin-left: 1px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 400;
}
</style>
