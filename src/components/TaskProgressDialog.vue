<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { getTaskStatus } from '@/api/maintenance';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  node: string;
  upid: string;
  title: string;
}>();
const emit = defineEmits<{
  finished: [success: boolean];
  details: [];
}>();

const state = shallowRef<'running' | 'success' | 'failed'>('running');
const error = shallowRef('');
const dialogTitle = computed(() => `${gettext('Task')}: ${props.title}`);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimers() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (closeTimer) clearTimeout(closeTimer);
  refreshTimer = undefined;
  closeTimer = undefined;
}

async function refreshStatus() {
  if (!visible.value || !props.node || !props.upid) return;
  const upid = props.upid;
  try {
    const response = await getTaskStatus(props.node, upid);
    if (!visible.value || props.upid !== upid) return;
    const status = response.data;
    if (status?.status === 'stopped') {
      const success = status.exitstatus === 'OK';
      state.value = success ? 'success' : 'failed';
      error.value = success ? '' : status.exitstatus || gettext('Task failed');
      emit('finished', success);
      if (success)
        closeTimer = setTimeout(() => {
          visible.value = false;
        }, 1000);
      return;
    }
    refreshTimer = setTimeout(() => void refreshStatus(), 1000);
  } catch (cause) {
    if (!visible.value || props.upid !== upid) return;
    state.value = 'failed';
    error.value = cause instanceof Error ? cause.message : gettext('Task failed');
  }
}

function showDetails() {
  visible.value = false;
  emit('details');
}

watch(visible, (isVisible) => {
  clearTimers();
  if (!isVisible) return;
  state.value = 'running';
  error.value = '';
  void refreshStatus();
});

onBeforeUnmount(clearTimers);
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="dialogTitle"
      width="360px"
    >
      <div class="q-pa-md">
        <q-linear-progress
          :indeterminate="state === 'running'"
          :value="state === 'success' ? 1 : 0"
          :color="state === 'failed' ? 'negative' : 'primary'"
          size="12px"
        />
        <div
          class="q-mt-sm"
          :class="{ 'text-negative': state === 'failed' }"
        >
          {{
            state === 'running'
              ? gettext('running...')
              : state === 'success'
                ? gettext('Finish')
                : error
          }}
        </div>
      </div>
      <template #foot>
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Details')"
          @click="showDetails"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
