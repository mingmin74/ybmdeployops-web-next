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
import { getLogs } from '@/api/logs';
import { gettext } from '@/locale';

const loading = ref(false);
const selectedNode = ref('');
const liveMode = ref(true);
const since = ref('');
const until = ref('');
const lines = shallowRef<string[]>([]);
const startcursor = ref('');
const endcursor = ref('');
const requestRunning = ref(false);
const scrollToEnd = ref(true);
const logRef = ref<HTMLElement>();
const sinceDatePopup = useTemplateRef<{ show: () => void }>('sinceDatePopup');
const untilDatePopup = useTemplateRef<{ show: () => void }>('untilDatePopup');
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
  const nodeName = selectedNode.value;
  if (!nodeName || requestRunning.value) return;

  const params = buildParams(isPolling);
  if (!params) return;

  if (!isPolling) loading.value = true;
  requestRunning.value = true;
  try {
    const response = await getLogs({ node: nodeName, source: 'system', params });
    if (nodeName !== selectedNode.value) return;

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
  } finally {
    requestRunning.value = false;
    if (!isPolling) loading.value = false;
  }

  await nextTick();
  if (logRef.value && scrollToEnd.value) logRef.value.scrollTop = logRef.value.scrollHeight;
}

function resetAndLoad() {
  startcursor.value = '';
  endcursor.value = '';
  lines.value = [];
  void loadLogs();
}

function exportData() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'system-logs.txt';
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateScrollPosition() {
  const element = logRef.value;
  if (!element) return;
  scrollToEnd.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 5;
}

watch(liveMode, (enabled) => {
  if (enabled) {
    resetAndLoad();
  } else {
    lines.value = [];
  }
});

watch(selectedNode, resetAndLoad);

initDates();

onMounted(() => {
  timer = setInterval(() => {
    if (liveMode.value) void loadLogs(true);
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="overlay-system-logs column no-wrap">
    <div class="overlay-system-logs__toolbar row items-center q-gutter-sm no-wrap">
      <q-btn-toggle
        v-model="liveMode"
        no-caps
        size="12px"
        class="u-button"
        toggle-color="primary"
        :options="modeOptions"
      />
      <template v-if="!liveMode">
        <q-input
          v-model="since"
          square
          outlined
          dense
          class="u-dense overlay-system-logs__date"
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
          class="u-dense overlay-system-logs__date"
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
      <NodeSelectTable v-model="selectedNode" />
    </div>
    <div
      ref="logRef"
      class="overlay-system-logs__output"
      @scroll="updateScrollPosition"
    >
      {{ output || gettext('No logs found') }}
    </div>
    <q-inner-loading :showing="loading" />
  </section>
</template>

<style scoped>
.overlay-system-logs {
  position: relative;
  height: 100%;
  min-height: 0;
  padding: 6px 12px 8px;
}

.overlay-system-logs__toolbar {
  min-height: 32px;
  margin-bottom: 6px;
}

.overlay-system-logs__date {
  width: 130px;
}

.overlay-system-logs__date :deep(.q-field__native),
.overlay-system-logs__date :deep(.q-field__append) {
  align-self: center;
}

.overlay-system-logs__date :deep(.q-field__append) {
  display: flex;
  height: 100%;
  align-items: center;
}

.overlay-system-logs__output {
  min-height: 0;
  flex: 1 1 0;
  overflow: auto;
  border: 1px solid #cccccc;
  padding: 8px;
  color: #333333;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
</style>
