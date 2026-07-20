<script setup lang="ts">
import { date } from 'quasar';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import { getSystemJournal } from '@/api/maintenance';
import { gettext } from '@/locale';

const loading = ref(false);
const node = ref('');
const liveMode = ref(true);
const since = ref('');
const until = ref('');
const lines = shallowRef<string[]>([]);
const startcursor = ref('');
const endcursor = ref('');
const logRef = ref<HTMLElement>();
let timer: ReturnType<typeof setInterval> | undefined;

const output = computed(() => lines.value.join('\n'));
const modeOptions = computed(() => [
  { label: gettext('Live Mode'), value: true },
  { label: gettext('Select Timespan'), value: false },
]);

function initDates() {
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - 3);
  since.value = date.formatDate(start, 'YYYY-MM-DD');
  until.value = date.formatDate(now, 'YYYY-MM-DD');
}

function parseDate(value: string) {
  const parts = value.split('-').map((item) => Number(item));
  if (parts.length !== 3 || parts.some((item) => Number.isNaN(item))) return undefined;
  return new Date(parts[0] || 0, (parts[1] || 1) - 1, parts[2] || 1);
}

function buildParams(isPolling: boolean) {
  if (liveMode.value) {
    if (isPolling && startcursor.value) return { startcursor: startcursor.value };
    return { lastentries: 500, ...(endcursor.value ? { endcursor: endcursor.value } : {}) };
  }

  const sinceDate = parseDate(since.value);
  const untilDate = parseDate(until.value);
  if (!sinceDate || !untilDate) return undefined;
  sinceDate.setHours(0, 0, 0, 0);
  untilDate.setHours(0, 0, 0, 0);
  untilDate.setDate(untilDate.getDate() + 1);
  return {
    since: Math.floor(sinceDate.getTime() / 1000),
    until: Math.floor(untilDate.getTime() / 1000),
  };
}

async function loadLogs(isPolling = false) {
  const params = buildParams(isPolling);
  if (!node.value || !params) return;
  if (!isPolling) loading.value = true;
  try {
    const response = await getSystemJournal(node.value, params);
    const data = Array.isArray(response.data) ? [...response.data] : [];
    const nextEnd = data.shift();
    const nextStart = data.pop();
    if (liveMode.value) {
      endcursor.value = nextEnd || endcursor.value;
      startcursor.value = nextStart || startcursor.value;
    }
    lines.value = liveMode.value && isPolling ? [...lines.value, ...data] : data;
    if (lines.value.length > 5000) lines.value = lines.value.slice(-5000);
    await nextTick();
    if (logRef.value && liveMode.value) logRef.value.scrollTop = logRef.value.scrollHeight;
  } finally {
    if (!isPolling) loading.value = false;
  }
}

function resetAndLoad() {
  startcursor.value = '';
  endcursor.value = '';
  lines.value = [];
  void loadLogs(false);
  if (liveMode.value) startPolling();
}

function startPolling() {
  stopPolling();
  timer = setInterval(() => {
    if (liveMode.value) void loadLogs(true);
  }, 1000);
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

function exportData() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'system-logs.txt';
  link.click();
  URL.revokeObjectURL(link.href);
}

watch(liveMode, (enabled) => {
  if (enabled) {
    resetAndLoad();
  } else {
    stopPolling();
    lines.value = [];
  }
});

watch(node, () => {
  resetAndLoad();
});

initDates();

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="column q-ma-sm">
    <div class="col q-mb-sm">
      <div class="row q-gutter-sm items-center">
        <q-btn-toggle v-model="liveMode" no-caps size="12px" class="u-button" toggle-color="primary" :options="modeOptions" />
        <template v-if="!liveMode">
          <q-input v-model="since" square outlined dense class="u-dense date-input" :label="gettext('Since')" />
          <q-input v-model="until" square outlined dense class="u-dense date-input" :label="gettext('Until')" />
        </template>
        <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Export')" @click="exportData" />
        <q-btn no-caps size="12px" color="primary" class="u-button" :label="gettext('Update')" @click="resetAndLoad" />
        <q-space />
        <NodeSelectTable v-model="node" />
      </div>
    </div>
    <div ref="logRef" class="system-log-box">
      {{ output || gettext('No logs found') }}
    </div>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.date-input {
  width: 140px;
}

.system-log-box {
  height: 700px;
  overflow: auto;
  border: 1px solid #cccccc;
  padding: 8px;
  color: #333333;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
</style>
