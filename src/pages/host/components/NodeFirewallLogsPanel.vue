<script setup lang="ts">
import { date } from 'quasar';
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getNodeFirewallLogs } from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const { node } = defineProps<{ node: string }>();
const pageSize = 510;
const loading = shallowRef(false);
const requestRunning = shallowRef(false);
const liveMode = shallowRef(true);
const since = shallowRef('');
const until = shallowRef('');
const start = shallowRef(0);
const rows = shallowRef<PveRecord[]>([]);
const scrollToEnd = shallowRef(true);
const logRef = useTemplateRef<HTMLElement>('logRef');
const sinceDatePopup = useTemplateRef<{ show: () => void }>('sinceDatePopup');
const untilDatePopup = useTemplateRef<{ show: () => void }>('untilDatePopup');
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const output = computed(() => rows.value.map((row) => textValue(row.t)).join('\n'));
const modeOptions = computed(() => [
  { label: gettext('Live Mode'), value: true },
  { label: gettext('Select Timespan'), value: false },
]);

function initDates() {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 3);
  since.value = date.formatDate(startDate, 'YYYY-MM-DD');
  until.value = date.formatDate(now, 'YYYY-MM-DD');
}

function toUnixDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return undefined;
  if ([year, month, day].some(Number.isNaN)) return undefined;
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
}

function buildParams() {
  if (liveMode.value) return { start: start.value, limit: pageSize };
  const sinceValue = toUnixDate(since.value);
  const untilValue = toUnixDate(until.value);
  if (sinceValue === undefined || untilValue === undefined || sinceValue > untilValue)
    return undefined;
  return { start: 0, limit: pageSize, since: sinceValue, until: untilValue };
}

async function refreshData(isPolling = false) {
  const params = buildParams();
  const requestedNode = node;
  if (!params || requestRunning.value) return;
  requestRunning.value = true;
  if (!isPolling) loading.value = true;
  let reloadLatest = false;
  try {
    const response = await getNodeFirewallLogs(requestedNode, params);
    if (requestedNode !== node) return;
    rows.value = response.data || [];
    if (liveMode.value) {
      const total = Number(response.total);
      const latestStart = Number.isFinite(total) ? Math.max(0, total - pageSize) : start.value;
      if (latestStart !== start.value) {
        start.value = latestStart;
        reloadLatest = true;
      }
    }
  } finally {
    requestRunning.value = false;
    if (!isPolling) loading.value = false;
  }
  if (reloadLatest) {
    void refreshData(isPolling);
    return;
  }
  await nextTick();
  if (logRef.value && scrollToEnd.value) logRef.value.scrollTop = logRef.value.scrollHeight;
}

function resetAndLoad() {
  start.value = 0;
  rows.value = [];
  void refreshData();
}

function startPolling() {
  stopPolling();
  refreshTimer = setInterval(() => {
    if (liveMode.value && scrollToEnd.value) void refreshData(true);
  }, 1000);
}

function stopPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function updateScrollPosition() {
  const element = logRef.value;
  if (!element) return;
  scrollToEnd.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 5;
}

watch(liveMode, (enabled) => {
  if (enabled) {
    resetAndLoad();
    startPolling();
  } else {
    stopPolling();
    rows.value = [];
  }
});

watch(
  () => node,
  () => {
    resetAndLoad();
    if (liveMode.value) startPolling();
  },
  { immediate: true }
);

initDates();
onBeforeUnmount(stopPolling);
</script>

<template>
  <div class="node-firewall-logs">
    <div class="row q-gutter-sm items-center q-mb-sm">
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
      </template>
    </div>
    <pre
      ref="logRef"
      class="log-output"
      @scroll="updateScrollPosition"
      >{{ output || gettext('No logs found') }}</pre>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.node-firewall-logs {
  position: relative;
}
.date-input {
  width: 140px;
}
.date-input :deep(.q-field__native),
.date-input :deep(.q-field__append) {
  align-self: center;
}
.log-output {
  height: 500px;
  overflow: auto;
  margin: 0;
  border: 1px solid #cccccc;
  padding: 8px;
  color: #333333;
  font:
    12px/18px Consolas,
    'Courier New',
    monospace;
  white-space: pre;
}
</style>
