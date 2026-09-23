<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import LineMetricChart from '@/components/LineMetricChart.vue';
import StorageContentTable from '@/components/StorageContentTable.vue';
import StorageBackupView from './StorageBackupView.vue';
import StorageImageView from './StorageImageView.vue';
import StorageTemplateView from './StorageTemplateView.vue';
import storageIllustration from '@/assets/overview/storage.png';
import type { PveRecord } from '@/api/resources';
import { getStorageRrd } from '@/api/overview';
import { getStorageStatus } from '@/api/storageContent';
import { gettext } from '@/locale';
import {
  formatBytes,
  formatContent,
  formatStorageType,
  textValue,
  timestampToTime,
} from '@/utils/pveFormat';

const props = defineProps<{
  node: string;
  storage: PveRecord;
}>();

const tab = ref('summary');
const timeType = ref('hour');
const rrdConsolidation = ref<'AVERAGE' | 'MAX'>('AVERAGE');
const chartRows = shallowRef<PveRecord[]>([]);
const chartTimer = shallowRef<number>();
const status = shallowRef<PveRecord>({});
const statusTimer = shallowRef<number>();
let chartRequestId = 0;

const timeOptions = computed(() => [
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

const contentTabs = computed(() => {
  const content = textValue(props.storage.content || status.value.content);
  const tokens = content
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const map: Record<string, string> = {
    backup: 'Backup',
    images: 'VM Disks',
    rootdir: 'CT Volumes',
    iso: 'ISO Image',
    vztmpl: 'CT Templates',
    snippets: 'Snippets',
    import: 'Import',
  };
  const icons: Record<string, string> = {
    backup: 'backup',
    images: 'storage',
    rootdir: 'inventory_2',
    iso: 'album',
    vztmpl: 'layers',
    snippets: 'code',
    import: 'download',
  };

  return tokens
    .filter((item) => map[item])
    .map((item) => ({ name: item, label: map[item], icon: icons[item] }));
});

const chartXAxis = computed(() =>
  chartRows.value.map((item) => timestampToTime(Number(item.time) * 1000))
);

const storageUsageSeries = computed(() => [
  {
    name: gettext('Total Size'),
    data: chartRows.value.map((item) => Number(item.total) || 0),
    color: '#1976d2',
  },
  {
    name: gettext('Used Size'),
    data: chartRows.value.map((item) => Number(item.used) || 0),
    color: '#26a69a',
  },
]);

const storageUsagePercent = computed(() => {
  const total = Number(status.value.total);
  const used = Number(status.value.used);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return 0;
  return Math.min(Math.max((used / total) * 100, 0), 100);
});

function usageColor(percent: number) {
  if (percent >= 90) return 'negative';
  if (percent >= 80) return 'warning';
  return 'primary';
}

function boolLabel(value: unknown) {
  return value ? gettext('Yes') : gettext('No');
}

async function loadStatus() {
  const node = textValue(props.node);
  const storage = textValue(props.storage.storage);
  if (!node || !storage) {
    status.value = {};
    return;
  }
  try {
    const response = await getStorageStatus(node, storage);
    status.value = response.data || {};
  } catch {
    // Keep the last successful status, matching PVE's polling view.
  }
}

function startStatusRefresh() {
  if (statusTimer.value) window.clearInterval(statusTimer.value);
  void loadStatus();
  statusTimer.value = window.setInterval(() => void loadStatus(), 1000);
}

async function loadChartData() {
  const node = textValue(props.node);
  const storage = textValue(props.storage.storage);
  if (!node || !storage) {
    chartRows.value = [];
    return;
  }

  const requestId = ++chartRequestId;
  try {
    const response = await getStorageRrd(node, storage, timeType.value, rrdConsolidation.value);
    if (requestId === chartRequestId) chartRows.value = response.data || [];
  } catch {
    // The request client already shows the failure; keep the last successful chart visible.
  }
}

function startChartRefresh() {
  if (chartTimer.value) window.clearInterval(chartTimer.value);
  void loadChartData();
  chartTimer.value = window.setInterval(() => {
    void loadChartData();
  }, 3000);
}

onMounted(() => {
  startChartRefresh();
  startStatusRefresh();
});

watch(
  [() => props.node, () => props.storage.storage, timeType, rrdConsolidation],
  startChartRefresh
);

watch([() => props.node, () => props.storage.storage], () => {
  tab.value = 'summary';
  startStatusRefresh();
});

onBeforeUnmount(() => {
  if (chartTimer.value) window.clearInterval(chartTimer.value);
  if (statusTimer.value) window.clearInterval(statusTimer.value);
});
</script>

<template>
  <div>
    <q-tabs
      v-model="tab"
      dense
      active-color="primary"
      indicator-color="primary"
      align="left"
      narrow-indicator
      class="storage-tabs text-grey-8"
    >
      <q-tab
        no-caps
        name="summary"
        icon="summarize"
        :label="gettext('Summary')"
      />
      <q-tab
        v-for="item in contentTabs"
        :key="item.name"
        no-caps
        :name="item.name"
        :icon="item.icon"
        :label="gettext(item.label || '')"
      />
    </q-tabs>
    <q-separator />

    <q-tab-panels
      v-model="tab"
      animated
    >
      <q-tab-panel
        name="summary"
        class="q-pa-md"
      >
        <div class="storage-overview-grid">
          <q-card class="overview-panel no-shadow no-border-radius no-margin">
            <q-card-section class="panel-section">
              <div class="panel-header">
                <span>{{ gettext('Storage Summary') }}</span>
                <span class="panel-subtitle">{{ textValue(storage.storage, '-') }}</span>
              </div>
              <div class="storage-summary-content">
                <div class="storage-summary-illustration">
                  <img
                    :src="storageIllustration"
                    alt=""
                  />
                </div>
                <div class="info-list">
                  <div class="info-row">
                    <span>{{ gettext('Node') }}</span>
                    <strong>{{ textValue(node, '-') }}</strong>
                  </div>
                  <div class="info-row">
                    <span>{{ gettext('Type') }}</span>
                    <strong>{{ formatStorageType(status.type, status.monhost, true) }}</strong>
                  </div>
                  <div class="info-row">
                    <span>{{ gettext('Content') }}</span>
                    <strong>{{ formatContent(status.content) || '-' }}</strong>
                  </div>
                  <div class="info-row">
                    <span>{{ gettext('Enabled') }}</span>
                    <q-badge
                      :color="Number(status.disabled || 0) === 0 ? 'positive' : 'grey'"
                      class="info-badge"
                      :label="boolLabel(Number(status.disabled || 0) === 0)"
                    />
                  </div>
                  <div class="info-row">
                    <span>{{ gettext('Active') }}</span>
                    <q-badge
                      :color="
                        status.active == null ? 'grey' : status.active ? 'positive' : 'negative'
                      "
                      class="info-badge"
                      :label="status.active == null ? '-' : boolLabel(status.active)"
                    />
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <q-card class="overview-panel no-shadow no-border-radius no-margin">
            <q-card-section class="panel-section">
              <div class="panel-header">
                <span>{{ gettext('Usage') }}</span>
              </div>
              <div class="resource-card-grid">
                <section class="resource-card resource-card-compare">
                  <div class="resource-card-title">{{ gettext('Storage Usage') }}</div>
                  <strong>
                    {{ status.used == null ? '-' : formatBytes(Number(status.used)) }}
                  </strong>
                  <div class="resource-card-meta">
                    <span>{{ gettext('Total Size') }}</span>
                    <span>
                      {{ status.total == null ? '-' : formatBytes(Number(status.total)) }}
                    </span>
                  </div>
                  <q-circular-progress
                    show-value
                    class="resource-card-progress"
                    size="80px"
                    :thickness="0.18"
                    :value="storageUsagePercent"
                    :color="usageColor(storageUsagePercent)"
                    track-color="blue-grey-1"
                  >
                    {{ storageUsagePercent.toFixed(0) }}%
                  </q-circular-progress>
                </section>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <q-card class="chart-panel no-shadow no-border-radius q-mt-sm">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Usage') }}</strong>
              <q-space />
              <q-select
                v-model="timeType"
                square
                dense
                outlined
                emit-value
                map-options
                options-dense
                class="u-dense u-size-12 storage-time-select"
                :aria-label="gettext('Select Timespan')"
                :options="timeOptions"
              />
              <q-select
                v-model="rrdConsolidation"
                square
                dense
                outlined
                emit-value
                map-options
                options-dense
                class="u-dense u-size-12 storage-aggregation-select"
                :aria-label="gettext('Aggregation')"
                :options="rrdConsolidationOptions"
              />
            </div>
            <LineMetricChart
              :x-data="chartXAxis"
              :series="storageUsageSeries"
              unit-type="bytes"
              power-of-two
              :height="400"
            />
          </q-card-section>
        </q-card>
      </q-tab-panel>

      <q-tab-panel
        v-for="item in contentTabs"
        :key="item.name"
        :name="item.name"
        class="q-pa-md"
      >
        <StorageBackupView
          v-if="item.name === 'backup'"
          :node="node"
          :storage="textValue(storage.storage)"
          :storage-type="textValue(status.type, textValue(storage.type))"
          :active="tab === item.name"
        />
        <StorageContentTable
          v-else-if="item.name !== 'images' && item.name !== 'rootdir' && item.name !== 'vztmpl'"
          :node="node"
          :storage="textValue(storage.storage)"
          :content="item.name"
          :shared="Number(storage.shared ?? status.shared ?? 0) !== 0"
          :active="tab === item.name"
        />
        <StorageImageView
          v-else-if="item.name === 'images' || item.name === 'rootdir'"
          :node="node"
          :storage="textValue(storage.storage)"
          :content="item.name === 'images' ? 'images' : 'rootdir'"
          :shared="Number(storage.shared ?? status.shared ?? 0) !== 0"
          :active="tab === item.name"
        />
        <StorageTemplateView
          v-else
          :node="node"
          :storage="textValue(storage.storage)"
          :active="tab === item.name"
        />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>

<style scoped>
.storage-tabs {
  min-height: 40px;
  background: #f7f9fc;
  border-bottom: 1px solid #dfe1e6;
}

.storage-tabs :deep(.q-tab) {
  min-height: 40px;
  padding: 0 16px;
}

.storage-overview-grid {
  display: grid;
  grid-template-columns: minmax(360px, 1.1fr) minmax(300px, 0.9fr);
  gap: 10px;
}

.overview-panel,
.chart-panel {
  background: #ffffff;
  border: 1px solid #dfe1e6;
}

.overview-panel {
  min-height: 216px;
}

.panel-section,
.chart-card-section {
  padding: 0;
}

.panel-header,
.chart-header {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  color: #174f86;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
}

.panel-header span:first-child,
.chart-header strong {
  font-size: 13px;
  font-weight: 600;
}

.panel-subtitle {
  margin-left: auto;
  color: #666666;
  font-size: 12px;
  font-weight: normal;
}

.info-list {
  padding: 10px 14px 12px;
}

.storage-summary-content {
  display: grid;
  grid-template-columns: minmax(120px, 0.65fr) minmax(240px, 1.35fr);
  align-items: center;
  min-height: 176px;
  gap: 14px;
  padding: 10px 14px;
}

.storage-summary-content .info-list {
  padding: 0;
}

.storage-summary-illustration {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.storage-summary-illustration img {
  display: block;
  width: min(100%, 144px);
  height: auto;
  max-height: 150px;
  object-fit: contain;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 30px;
  border-bottom: 1px solid #eef1f6;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-row > span {
  color: #666666;
  font-size: 12px;
}

.info-row strong {
  min-width: 0;
  overflow: hidden;
  color: #333333;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-badge {
  border-radius: 0;
}

.resource-card-grid {
  padding: 10px;
}

.resource-card {
  position: relative;
  min-height: 124px;
  padding: 12px 96px 12px 14px;
  background: #fbfcfe;
  border: 1px solid #e1e6ee;
  border-radius: 4px;
}

.resource-card-title {
  color: #475b73;
  font-size: 13px;
  font-weight: 600;
}

.resource-card strong {
  display: block;
  margin: 8px 0 5px;
  color: #27384d;
  font-size: 22px;
  line-height: 1.35;
}

.resource-card-meta {
  display: flex;
  color: #718096;
  font-size: 12px;
}

.resource-card-meta span:last-child {
  padding-left: 8px;
  overflow: hidden;
  color: #52657d;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-progress {
  position: absolute;
  top: 50%;
  right: 16px;
  color: #52657d;
  font-size: 11px;
  font-weight: 600;
  transform: translateY(-50%);
}

.storage-time-select,
.storage-aggregation-select {
  min-width: 130px;
}

.storage-time-select :deep(.q-field__control),
.storage-time-select :deep(.q-field__marginal),
.storage-aggregation-select :deep(.q-field__control),
.storage-aggregation-select :deep(.q-field__marginal) {
  height: 28px;
  min-height: 28px;
}

.storage-time-select :deep(.q-field__native),
.storage-time-select :deep(.q-field__input),
.storage-aggregation-select :deep(.q-field__native),
.storage-aggregation-select :deep(.q-field__input) {
  min-height: 28px;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 28px;
}

@media (max-width: 900px) {
  .storage-overview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .storage-summary-content {
    grid-template-columns: 1fr;
  }

  .storage-summary-illustration {
    display: none;
  }

  .chart-header {
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
}
</style>
