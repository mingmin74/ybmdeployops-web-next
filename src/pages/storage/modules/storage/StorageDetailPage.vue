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
        :label="gettext('Summary')"
      />
      <q-tab
        v-for="item in contentTabs"
        :key="item.name"
        no-caps
        :name="item.name"
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
        <section class="summary-strip">
          <header class="summary-header">
            <div class="summary-identity">
              <div class="summary-icon">
                <q-icon
                  name="storage"
                  size="24px"
                />
              </div>
              <div class="summary-heading">
                <div class="summary-eyebrow">
                  {{ `${gettext('Storage')} ${gettext('Summary')}` }}
                </div>
                <h2 class="summary-title">{{ textValue(storage.storage, '-') }}</h2>
              </div>
            </div>
            <div class="summary-statuses">
              <span class="summary-status">
                <span>{{ gettext('Enabled') }}</span>
                <strong>{{ boolLabel(Number(status.disabled || 0) === 0) }}</strong>
              </span>
              <span class="summary-status">
                <q-icon
                  name="circle"
                  size="8px"
                  :class="
                    status.active == null
                      ? 'status-unknown'
                      : status.active
                        ? 'status-active'
                        : 'status-inactive'
                  "
                />
                <span>{{ gettext('Active') }}</span>
                <strong>{{ status.active == null ? '-' : boolLabel(status.active) }}</strong>
              </span>
            </div>
          </header>
          <div class="summary-body">
            <dl class="summary-fields">
              <div class="summary-field">
                <dt>{{ gettext('Node') }}</dt>
                <dd>{{ textValue(node, '-') }}</dd>
              </div>
              <div class="summary-field">
                <dt>{{ gettext('Type') }}</dt>
                <dd>{{ formatStorageType(status.type, status.monhost, true) }}</dd>
              </div>
              <div class="summary-field summary-content">
                <dt>{{ gettext('Content') }}</dt>
                <dd>{{ formatContent(status.content) || '-' }}</dd>
              </div>
            </dl>
            <div class="summary-capacity">
              <div class="capacity-heading">{{ gettext('Usage') }}</div>
              <div class="capacity-values">
                <div>
                  <span class="capacity-label">{{ gettext('Used Size') }}</span>
                  <strong class="capacity-used">
                    {{ status.used == null ? '-' : formatBytes(Number(status.used)) }}
                  </strong>
                </div>
                <div class="capacity-total">
                  <span class="capacity-label">{{ gettext('Total Size') }}</span>
                  <strong>
                    {{ status.total == null ? '-' : formatBytes(Number(status.total)) }}
                  </strong>
                </div>
              </div>
              <UsageProgress
                v-if="Number(status.total) > 0 && status.used != null"
                :percent="(Number(status.used) / Number(status.total)) * 100"
                width="100%"
              />
              <div
                v-else
                class="capacity-empty"
              >
                —
              </div>
            </div>
          </div>
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

.summary-strip {
  border: 1px solid #dfe1e6;
  background: #fff;
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #dfe1e6;
}

.summary-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.summary-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  background: #e6f1fc;
  color: #1976d2;
}

.summary-heading {
  min-width: 0;
}

.summary-eyebrow,
.capacity-label {
  color: #666;
  font-size: 12px;
}

.summary-title {
  margin: 3px 0 0;
  color: #333;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.summary-statuses {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.summary-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 12px;
}

.summary-status strong {
  color: #333;
  font-weight: 500;
}

.status-active {
  color: #21bf4b;
}
.status-inactive {
  color: #ff6c59;
}
.status-unknown {
  color: #999;
}

.summary-body {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
}

.summary-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 0;
  padding: 20px;
}

.summary-field {
  min-width: 0;
}
.summary-content {
  grid-column: 1 / -1;
}

.summary-field dt {
  margin-bottom: 6px;
  color: #666;
  font-size: 12px;
}

.summary-field dd {
  margin: 0;
  color: #333;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.summary-capacity {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 20px 24px;
  border-left: 1px solid #dfe1e6;
  background: #f7f9fc;
  min-width: 0;
}

.capacity-heading {
  margin-bottom: 12px;
  color: #333;
  font-size: 13px;
  font-weight: 600;
}

.capacity-values {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
  font-variant-numeric: tabular-nums;
}

.capacity-label {
  display: block;
  margin-bottom: 4px;
}
.capacity-values strong {
  color: #333;
  font-weight: 500;
}
.capacity-values .capacity-used {
  color: #1976d2;
  font-size: 26px;
  line-height: 1.2;
}
.capacity-total {
  text-align: right;
}
.capacity-total strong {
  font-size: 16px;
}
.capacity-empty {
  height: 20px;
  color: #999;
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
  .summary-body {
    grid-template-columns: 1fr;
  }

  .summary-capacity {
    border-left: 0;
    border-top: 1px solid #dfe1e6;
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
