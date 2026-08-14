<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();
const form = reactive({
  memory: Number(config.value.memory || 512),
  ballooning: Number(config.value.balloon ?? config.value.memory ?? 512) !== 0,
  balloon: Number(config.value.balloon || config.value.memory || 512),
  shares: textValue(config.value.shares),
  allowKsm: Number(config.value['allow-ksm'] ?? 1) === 1,
});
const advanced = shallowRef(
  Boolean(
    config.value.balloon !== undefined ||
    config.value.shares ||
    config.value['allow-ksm'] !== undefined,
  ),
);

async function save() {
  if (!canEditRow(device)) return;
  const data: Record<string, string | number> = {
    memory: form.memory,
    'allow-ksm': form.allowKsm ? 1 : 0,
  };
  const deleted: string[] = [];
  data.balloon = form.balloon;
  if (!form.ballooning) {
    data.balloon = 0;
    if (config.value.shares !== undefined) deleted.push('shares');
  } else if (form.balloon === form.memory) {
    delete data.balloon;
    if (config.value.balloon !== undefined) deleted.push('balloon');
    if (config.value.shares !== undefined) deleted.push('shares');
  } else if (form.shares.trim()) {
    data.shares = form.shares.trim();
  } else if (config.value.shares !== undefined) {
    deleted.push('shares');
  }

  if (form.allowKsm) {
    if (config.value['allow-ksm'] !== undefined) deleted.push('allow-ksm');
    delete data['allow-ksm'];
  }

  if (deleted.length) data.delete = deleted.join(',');
  await updateConfig(data);
}

watch(
  () => form.memory,
  (memory, previousMemory) => {
    if (form.balloon === previousMemory) form.balloon = memory;
  },
);
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-input
          v-model.number="form.memory"
          dense
          :label="gettext('Memory (MiB)')"
          type="number"
          min="1"
          step="32"
        />
      </div>
      <template v-if="advanced">
        <div class="col-12">
          <q-input
            v-model.number="form.balloon"
            dense
            :disable="!form.ballooning"
            :label="`${gettext('Minimum memory')} (MiB)`"
            type="number"
            min="1"
            :max="form.memory"
            step="32"
          />
        </div>
        <div class="col-12">
          <q-input
            v-model="form.shares"
            dense
            :disable="!form.ballooning || form.balloon === form.memory"
            :label="gettext('Shares')"
            type="number"
            min="0"
            max="50000"
            step="10"
            :placeholder="`${gettext('Default')} (1000)`"
          />
        </div>
        <div class="col-12">
          <q-checkbox
            v-model="form.ballooning"
            dense
            color="primary"
            :label="gettext('Ballooning Device')"
          />
        </div>
        <div class="col-12">
          <q-checkbox v-model="form.allowKsm" dense color="primary" :label="gettext('Allow KSM')" />
        </div>
      </template>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :label="gettext('Save')"
        @click="save"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.hardware-special-editor {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}
.hardware-special-editor__fields {
  flex: 1 1 auto;
  align-content: flex-start;
}
.hardware-special-editor__footer {
  min-height: 52px;
  margin: auto -8px -8px;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
</style>
