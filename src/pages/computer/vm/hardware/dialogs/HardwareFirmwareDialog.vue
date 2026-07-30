<script setup lang="ts">
import { reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const { kind = 'efi' } = defineProps<{ kind?: 'efi' | 'tpm' }>();
const form = reactive({ storage: '', preEnrolledKeys: true, tpmVersion: 'v2.0' });
const { config, hasVmCapability, loading, updateConfig } = useVmHardwareContext();

watch(visible, (isVisible) => {
  if (!isVisible) return;
  Object.assign(form, { storage: '', preEnrolledKeys: true, tpmVersion: 'v2.0' });
});

async function addFirmware() {
  const key = kind === 'efi' ? 'efidisk0' : 'tpmstate0';
  if (!hasVmCapability('VM.Config.Disk') || !form.storage || config.value[key]) return;
  await updateConfig({
    [key]: kind === 'efi'
      ? `${form.storage}:1,efitype=4m,pre-enrolled-keys=${form.preEnrolledKeys ? 1 : 0}`
      : `${form.storage}:1,version=${form.tpmVersion}`,
  });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext(kind === 'efi' ? 'EFI Disk' : 'TPM State')" width="440px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-input
          v-model="form.storage"
          dense
          square
          outlined
          :label="gettext(kind === 'efi' ? 'EFI Storage' : 'TPM Storage')"
        />
        <q-checkbox v-if="kind === 'efi'" v-model="form.preEnrolledKeys" :label="gettext('Pre-Enroll keys')" />
        <q-select
          v-else
          v-model="form.tpmVersion"
          dense
          square
          outlined
          :options="['v1.2', 'v2.0']"
          :label="gettext('Version')"
        />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!form.storage"
          :label="gettext('Add')"
          @click="addFirmware"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
