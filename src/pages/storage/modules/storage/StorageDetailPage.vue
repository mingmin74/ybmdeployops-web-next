<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import LineMetricChart from '@/components/LineMetricChart.vue';
import StorageContentTable from '@/components/StorageContentTable.vue';
import StorageBackupView from './StorageBackupView.vue';
import StorageImageView from './StorageImageView.vue';
import StorageTemplateView from './StorageTemplateView.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { getStorageRrd } from '@/api/overview';
import { getStorageStatus } from '@/api/storageContent';
import { gettext } from '@/locale';
import {
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
  const content = textValue(props.storage.content);
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

  return tokens.filter((item) => map[item]).map((item) => ({ name: item, label: map[item] }));
});

const chartXAxis = computed(() =>
  chartRows.value.map((item) => timestampToTime(Number(item.time) * 1000)),
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
  startChartRefresh,
);

watch([() => props.node, () => props.storage.storage], startStatusRefresh);

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
      <q-tab no-caps name="summary" :label="gettext('Summary')" />
      <q-tab
        v-for="item in contentTabs"
        :key="item.name"
        no-caps
        :name="item.name"
        :label="gettext(item.label || '')"
      />
    </q-tabs>
    <q-separator />

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="summary" class="q-pa-md">
        <section class="summary-strip">
          <header class="summary-header">
            <q-icon name="storage" size="22px" color="primary" />
            <div>
              <div class="summary-title">{{ `${gettext('Storage')} ${gettext('Summary')}` }}</div>
              <div class="summary-subtitle">{{ textValue(storage.storage, '-') }}</div>
            </div>
          </header>
          <div class="summary-fields">
            <div class="summary-field">
              <span>{{ gettext('Type') }}</span
              ><strong>{{ formatStorageType(status.type, status.monhost, true) }}</strong>
            </div>
            <div class="summary-field">
              <span>{{ gettext('Content') }}</span
              ><strong>{{ formatContent(status.content) || '-' }}</strong>
            </div>
            <div class="summary-field">
              <span>{{ gettext('Enabled') }}</span
              ><strong>{{ boolLabel(Number(status.disabled || 0) === 0) }}</strong>
            </div>
            <div class="summary-field">
              <span>{{ gettext('Active') }}</span
              ><strong>{{ boolLabel(status.active) }}</strong>
            </div>
          </div>
          <UsageProgress :percent="(Number(status.used) / Number(status.total || 1)) * 100" />
        </section>

        <section class="usage-section q-mt-md">
          <div class="usage-toolbar">
            <div class="text-subtitle2">{{ gettext('Usage') }}</div>
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
        </section>
      </q-tab-panel>

      <q-tab-panel v-for="item in contentTabs" :key="item.name" :name="item.name" class="q-pa-md">
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

.summary-strip {
  border: 1px solid #dfe1e6;
  border-top: 2px solid #1976d2;
  background: #f7f9fc;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #dfe1e6;
  background: #ffffff;
}

.summary-title {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

.summary-subtitle {
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
}

.summary-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 4px 16px;
}

.summary-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px 0;
}

.summary-field span {
  color: #667085;
  font-size: 12px;
}

.summary-field strong {
  overflow: hidden;
  color: #1f2937;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-section {
  border: 1px solid #dfe1e6;
  padding: 12px 16px 4px;
}

.usage-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
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
  .summary-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .summary-fields {
    grid-template-columns: 1fr;
  }

  .usage-toolbar {
    flex-wrap: wrap;
  }

  .usage-toolbar :deep(.q-space) {
    display: none;
  }
}
</style>
