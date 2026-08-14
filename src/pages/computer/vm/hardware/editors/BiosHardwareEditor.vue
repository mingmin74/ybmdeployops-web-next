<script setup lang="ts">
import { computed, reactive } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';
import { getGuestArchitecture } from '../vmHardwareUtils';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();
const isArm = computed(() => getGuestArchitecture(config.value) === 'aarch64');
const form = reactive({
  bios: textValue(config.value.bios) || (isArm.value ? 'ovmf' : ''),
});
const needsEfiDisk = computed(() => form.bios === 'ovmf' && config.value.efidisk0 === undefined);

const biosOptions = computed(() =>
  isArm.value
    ? [{ label: 'OVMF (UEFI)', value: 'ovmf' }]
    : [
        { label: `${gettext('Default')} (SeaBIOS)`, value: '' },
        { label: 'SeaBIOS', value: 'seabios' },
        { label: 'OVMF (UEFI)', value: 'ovmf' },
      ],
);

async function save() {
  if (!canEditRow(device)) return;
  await updateConfig(form.bios ? { bios: form.bios } : { delete: 'bios' });
}
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-lg hardware-special-editor__fields">
      <div class="col-12">
        <q-select
          v-model="form.bios"
          dense
          options-dense
          emit-value
          map-options
          :options="biosOptions"
          :label="gettext('BIOS')"
        />
      </div>
      <div v-if="needsEfiDisk" class="col-12 hardware-editor-hint">
        {{ gettext('For OVMF (UEFI), an EFI Disk is recommended.') }}
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
.hardware-editor-hint {
  padding: 8px 10px;
  border: 1px solid #f0d38a;
  background: #fff8e1;
  color: #7a5713;
  font-size: 12px;
  line-height: 1.5;
}
</style>
