<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const storage = shallowRef('');
const { config, hasVmCapability, loading, nextDeviceKey, updateConfig } = useVmHardwareContext();
const hasCloudInitDrive = computed(() =>
  Object.entries(config.value).some(
    ([key, value]) => /^(ide|scsi|sata)\d+$/.test(key) && textValue(value).includes('cloudinit'),
  ),
);

watch(visible, (isVisible) => {
  if (isVisible) storage.value = '';
});

async function addCloudInitDrive() {
  if (
    !hasVmCapability('VM.Config.CDROM') ||
    !hasVmCapability('VM.Config.Cloudinit') ||
    hasCloudInitDrive.value ||
    !storage.value.trim()
  )
    return;
  await updateConfig({ [nextDeviceKey('ide', 4)]: `${storage.value.trim()}:cloudinit,media=cdrom` });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Add Cloud-Init Drive')" width="440px" :loading="loading">
      <div class="q-pa-md">
        <q-input v-model="storage" dense square outlined :label="gettext('Storage')" hint="local-lvm" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!storage.trim()"
          :label="gettext('Add')"
          @click="addCloudInitDrive"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
