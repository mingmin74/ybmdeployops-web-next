<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import UWindow from '@/components/UWindow.vue';
import { getTaskLog, getTaskStatus, stopTask, type TaskStatus } from '@/api/maintenance';
import { gettext } from '@/locale';

const model = defineModel<boolean>({ required: true });
const props = defineProps<{
  node?: string;
  upid?: string;
  title?: string;
}>();

const $q = useQuasar();
const loading = shallowRef(false);
const stopping = shallowRef(false);
const activeTab = shallowRef<'output' | 'status'>('output');
const lines = shallowRef<string[]>([]);
const status = shallowRef<TaskStatus>();
const dialogTitle = computed(() => `${gettext('Task')}: ${props.title || '-'}`);
const canStop = computed(() => status.value?.status === 'running');
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function formatTime(value?: number) {
  return value ? new Date(value * 1000).toLocaleString() : '-';
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (model.value && canStop.value) refreshTimer = setTimeout(() => void reload(true), 1000);
}

async function reload(silent = false) {
  if (!props.node || !props.upid) {
    lines.value = [];
    status.value = undefined;
    return;
  }
  if (!silent) loading.value = true;
  try {
    const [logResponse, statusResponse] = await Promise.all([
      getTaskLog(props.node, props.upid, { start: 0, limit: 500, _dc: Date.now() }),
      getTaskStatus(props.node, props.upid),
    ]);
    lines.value = (logResponse.data || []).map((item) => String(item.t || ''));
    status.value = statusResponse.data;
  } finally {
    if (!silent) loading.value = false;
    scheduleRefresh();
  }
}

function confirmStop() {
  if (!props.node || !props.upid || !canStop.value) return;
  $q.dialog({
    message: gettext('Are you sure to stop the task?'),
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    stopping.value = true;
    try {
      await stopTask(props.node!, props.upid!);
      await reload();
    } finally {
      stopping.value = false;
    }
  });
}

watch(
  () => model.value,
  (visible) => {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (visible) {
      activeTab.value = 'output';
      void reload();
    }
  },
);

onBeforeUnmount(() => refreshTimer && clearTimeout(refreshTimer));
</script>

<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="dialogTitle" width="900px" :loading="loading">
      <q-tabs
        v-model="activeTab"
        class="task-tabs text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
      >
        <q-tab no-caps name="output" :label="gettext('Output')" />
        <q-tab no-caps name="status" :label="gettext('Status')" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="activeTab">
        <q-tab-panel name="output" class="q-pa-none">
          <div class="task-action-bar">
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canStop ? 'primary' : 'grey'"
              :disable="!canStop"
              :loading="stopping"
              :label="gettext('Stop')"
              @click="confirmStop"
            />
          </div>
          <q-separator />
          <q-scroll-area class="task-content task-output">
            <p v-for="(line, index) in lines" :key="index" class="task-line">{{ line }}</p>
            <p v-if="!lines.length" class="task-line">{{ gettext('No logs found') }}</p>
          </q-scroll-area>
        </q-tab-panel>
        <q-tab-panel name="status" class="q-pa-none">
          <div class="task-action-bar">
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canStop ? 'primary' : 'grey'"
              :disable="!canStop"
              :loading="stopping"
              :label="gettext('Stop')"
              @click="confirmStop"
            />
          </div>
          <q-separator />
          <div class="task-content task-status q-pa-md">
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Status') }}</div>
              <div class="col text-grey-6">
                {{ status?.status || '-' }}: {{ status?.exitstatus || '-' }}
              </div>
            </div>
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Task Type') }}</div>
              <div class="col text-grey-6">{{ status?.type || '-' }}</div>
            </div>
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Username') }}</div>
              <div class="col text-grey-6">{{ status?.user || '-' }}</div>
            </div>
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Node') }}</div>
              <div class="col text-grey-6">{{ status?.node || props.node || '-' }}</div>
            </div>
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Process ID') }}</div>
              <div class="col text-grey-6">{{ status?.pid || '-' }}</div>
            </div>
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Start Time') }}</div>
              <div class="col text-grey-6">{{ formatTime(status?.starttime) }}</div>
            </div>
            <div class="row items-center task-status-row">
              <div class="col-3 text-grey-10">{{ gettext('Unique Task ID') }}</div>
              <div class="col text-grey-6 task-value">{{ status?.upid || props.upid || '-' }}</div>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.task-tabs {
  min-height: 42px;
  padding: 0 12px;
}
.task-action-bar {
  align-items: center;
  background: #fafbfc;
  display: flex;
  min-height: 44px;
  padding: 8px 12px;
}
.task-content {
  height: 350px;
  color: #4b5563;
  font-size: 13px;
  overflow: auto;
}
.task-output {
  background: #f7f9fc;
  font-family: Consolas, 'Courier New', monospace;
  line-height: 1.6;
}
.task-line {
  border-bottom: 1px solid #edf0f4;
  margin: 0;
  padding: 4px 14px;
  white-space: pre-wrap;
}
.task-line:last-child {
  border-bottom: 0;
}
.task-status {
  background: #fff;
  padding: 10px 16px !important;
}
.task-status-row {
  border-bottom: 1px solid #edf0f4;
  min-height: 38px;
  padding: 7px 0;
}
.task-status-row:last-child {
  border-bottom: 0;
}
.task-status-row :deep(.text-grey-10) {
  color: #667085 !important;
  font-size: 12px;
}
.task-status-row :deep(.text-grey-6) {
  color: #344054 !important;
  font-size: 13px;
}
.task-value {
  overflow-wrap: anywhere;
}
</style>
