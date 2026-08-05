<script setup lang="ts">
import { computed, reactive } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();
const form = reactive({
  scsihw: textValue(config.value.scsihw),
});
const scsiOptions = computed(() => [
  { label: gettext('Default'), value: '' },
  { label: 'VirtIO SCSI single', value: 'virtio-scsi-single' },
  { label: 'VirtIO SCSI', value: 'virtio-scsi-pci' },
  { label: 'LSI 53C895A', value: 'lsi' },
  { label: 'LSI 53C810', value: 'lsi53c810' },
  { label: 'MegaRAID SAS 8708EM2', value: 'megasas' },
  { label: 'VMware PVSCSI', value: 'pvscsi' },
]);

async function save() {
  if (!canEditRow(device)) return;
  await updateConfig(form.scsihw ? { scsihw: form.scsihw } : { delete: 'scsihw' });
}
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-select
          v-model="form.scsihw"
          dense
          options-dense
          emit-value
          map-options
          :options="scsiOptions"
          :label="gettext('Type')"
        />
      </div>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-end">
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
