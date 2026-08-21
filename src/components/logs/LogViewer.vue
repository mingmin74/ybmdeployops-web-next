<script setup lang="ts">
import { date } from 'quasar';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import { getLogs, type LogSource } from '@/api/logs';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const {
  source,
  node: fixedNode = '',
  showNodeSelector = true,
  service = '',
} = defineProps<{
  source: LogSource;
  node?: string;
  showNodeSelector?: boolean;
  service?: string;
}>();

const loading = ref(false);
const selectedNode = ref('');
const liveMode = ref(true);
const since = ref('');
const until = ref('');
const lines = shallowRef<string[]>([]);
const startcursor = ref('');
const endcursor = ref('');
const cephStart = ref(0);
const requestRunning = ref(false);
const scrollToEnd = ref(true);
const logRef = ref<HTMLElement>();
const sinceDatePopup = useTemplateRef<{ show: () => void }>('sinceDatePopup');
const untilDatePopup = useTemplateRef<{ show: () => void }>('untilDatePopup');
let timer: ReturnType<typeof setInterval> | undefined;

const isSystemLog = computed(() => source === 'system');
const output = computed(() => lines.value.join('\n'));
const currentNode = computed(() => fixedNode || selectedNode.value);
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
  if (!isSystemLog.value) return { start: cephStart.value, limit: 510 };
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

function normalizeCephRows(value: unknown) {
  function textFromLogValue(item: unknown): string {
    const directValue = textValue(item);
    if (directValue) return directValue;
    if (Array.isArray(item)) return item.map((value) => textFromLogValue(value)).filter(Boolean).join(' ');
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      for (const key of ['t', 'msg', 'message', 'text', 'line']) {
        const value = textFromLogValue(record[key]);
        if (value) return value;
      }
      return JSON.stringify(item);
    }
    return '';
  }

  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = item as Record<string, unknown>;
      return {
        index,
        line: textFromLogValue(record.t ?? record.msg ?? record.message ?? item),
        number: Number(record.n),
      };
    })
    .filter((item) => item.line)
    .sort((a, b) =>
      Number.isFinite(a.number) && Number.isFinite(b.number)
        ? a.number - b.number
        : a.index - b.index
    )
    .map((item) => item.line);
}

async function loadLogs(isPolling = false) {
  const params = buildParams(isPolling);
  const nodeName = currentNode.value;
  const serviceName = service;
  if (!nodeName || !params || requestRunning.value) return;
  if (!isPolling) loading.value = true;
  requestRunning.value = true;
  let reloadLatest = false;
  try {
    const response = await getLogs({ node: nodeName, source, params, service });
    if (nodeName !== currentNode.value || serviceName !== service) return;

    if (!isSystemLog.value) {
      lines.value = normalizeCephRows(response.data);
      const total = Number((response as { total?: unknown }).total);
      const latestStart = Number.isFinite(total) ? Math.max(0, total - 510) : cephStart.value;
      if (latestStart !== cephStart.value) {
        cephStart.value = latestStart;
        reloadLatest = true;
      }
    } else {
      const data = Array.isArray(response.data)
        ? response.data.filter((item): item is string => typeof item === 'string')
        : [];
      const nextEnd = data.shift();
      const nextStart = data.pop();
      if (liveMode.value) {
        endcursor.value = nextEnd || endcursor.value;
        startcursor.value = nextStart || startcursor.value;
      }
      lines.value = liveMode.value && isPolling ? [...lines.value, ...data] : data;
      if (lines.value.length > 5000) lines.value = lines.value.slice(-5000);
    }
  } finally {
    requestRunning.value = false;
    if (!isPolling) loading.value = false;
  }

  if (reloadLatest) {
    void loadLogs(isPolling);
    return;
  }

  await nextTick();
  if (logRef.value && scrollToEnd.value) logRef.value.scrollTop = logRef.value.scrollHeight;
}

function resetAndLoad() {
  startcursor.value = '';
  endcursor.value = '';
  cephStart.value = 0;
  lines.value = [];
  void loadLogs(false);
  if (isSystemLog.value && liveMode.value) startPolling();
}

function startPolling() {
  stopPolling();
  timer = setInterval(() => {
    if ((isSystemLog.value && liveMode.value) || (!isSystemLog.value && scrollToEnd.value)) {
      void loadLogs(true);
    }
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
  link.download = `${source}-logs.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateScrollPosition() {
  const element = logRef.value;
  if (!element) return;
  scrollToEnd.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 5;
}

watch(liveMode, (enabled) => {
  if (!isSystemLog.value) return;
  if (enabled) {
    resetAndLoad();
  } else {
    stopPolling();
    lines.value = [];
  }
});

watch(
  [currentNode, () => service],
  () => {
    resetAndLoad();
  },
  { immediate: true }
);

initDates();

onMounted(() => {
  if (!isSystemLog.value) startPolling();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="row column q-px-md q-py-sm">
    <div
      v-if="isSystemLog"
      class="col q-mb-sm"
    >
      <div class="row q-gutter-sm items-center">
        <q-btn-toggle
          v-if="isSystemLog"
          v-model="liveMode"
          no-caps
          size="12px"
          class="u-button"
          toggle-color="primary"
          :options="modeOptions"
        />
        <template v-if="isSystemLog && !liveMode">
          <q-input
            v-model="since"
            square
            outlined
            dense
            class="u-dense date-input"
            :placeholder="gettext('Since')"
            @click="sinceDatePopup?.show()"
          >
            <template #append>
              <q-icon
                name="event"
                size="16px"
                class="cursor-pointer"
              >
                <q-popup-proxy
                  ref="sinceDatePopup"
                  transition-show="scale"
                  transition-hide="scale"
                >
                  <q-date
                    v-model="since"
                    mask="YYYY-MM-DD"
                  />
                </q-popup-proxy>
              </q-icon>
            </template>
          </q-input>
          <q-input
            v-model="until"
            square
            outlined
            dense
            class="u-dense date-input"
            :placeholder="gettext('Until')"
            @click="untilDatePopup?.show()"
          >
            <template #append>
              <q-icon
                name="event"
                size="16px"
                class="cursor-pointer"
              >
                <q-popup-proxy
                  ref="untilDatePopup"
                  transition-show="scale"
                  transition-hide="scale"
                >
                  <q-date
                    v-model="until"
                    mask="YYYY-MM-DD"
                  />
                </q-popup-proxy>
              </q-icon>
            </template>
          </q-input>
        </template>
        <q-btn
          no-caps
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Export')"
          @click="exportData"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :loading="loading"
          :label="gettext('Update')"
          @click="resetAndLoad"
        />
        <q-space />
        <NodeSelectTable
          v-if="showNodeSelector"
          v-model="selectedNode"
        />
      </div>
    </div>
    <div
      ref="logRef"
      class="log-box"
      :class="`log-box--${source}`"
      @scroll="updateScrollPosition"
    >
      {{ output || gettext('No logs found') }}
    </div>
    <q-inner-loading
      v-if="isSystemLog"
      :showing="loading"
    />
  </div>
</template>

<style scoped>
.date-input {
  width: 140px;
}
.date-input :deep(.q-field__native),
.date-input :deep(.q-field__append) {
  align-self: center;
}
.date-input :deep(.q-field__append) {
  height: 100%;
  display: flex;
  align-items: center;
}
.log-box {
  overflow: auto;
  border: 1px solid #cccccc;
  padding: 8px;
  color: #333333;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
.log-box--system {
  height: 700px;
}
.log-box--ceph,
.log-box--service {
  height: 520px;
  font-family: Consolas, 'Courier New', monospace;
  overflow-wrap: anywhere;
}
</style>
