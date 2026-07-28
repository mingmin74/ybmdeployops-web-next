<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getTaskLog } from '@/api/maintenance';
import { gettext } from '@/locale';

const model = defineModel<boolean>({ required: true });
const props = defineProps<{
  node?: string;
  upid?: string;
  title?: string;
}>();

const loading = ref(false);
const lines = ref<string[]>([]);
const dialogTitle = computed(() => props.title || gettext('Task'));

async function reload() {
  if (!props.node || !props.upid) {
    lines.value = [];
    return;
  }
  loading.value = true;
  try {
    const response = await getTaskLog(props.node, props.upid, {
      start: 0,
      limit: 500,
      _dc: Date.now(),
    });
    lines.value = (response.data || []).map((item) => String(item.t || ''));
  } finally {
    loading.value = false;
  }
}

watch(
  () => model.value,
  (visible) => {
    if (visible) void reload();
  },
);
</script>

<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="dialogTitle" width="900px" :loading="loading">
      <div class="q-pa-sm">
        <pre class="task-output">{{ lines.join('\n') || gettext('No logs found') }}</pre>
      </div>
      <template #foot>
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Refresh')"
          @click="reload"
        />
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Close')"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.task-output {
  height: 520px;
  margin: 0;
  overflow: auto;
  border: 1px solid #cccccc;
  background: #ffffff;
  color: #333333;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
</style>
