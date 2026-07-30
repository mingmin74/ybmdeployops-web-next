<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const sourceStorages = shallowRef<string[]>([]);
const targetStorages = shallowRef<string[]>([]);
const files = shallowRef<PveRecord[]>([]);
const form = reactive({ sourceStorage: '', sourceVolume: '', targetStorage: '' });
const { hasVmCapability, loading, node, nextDeviceKey, updateConfig } = useVmHardwareContext();

async function loadFiles() {
  form.sourceVolume = '';
  files.value = [];
  if (!form.sourceStorage) return;
  const response = await getStorageContent(node.value, form.sourceStorage, 'import');
  files.value = (response.data || []).filter((item) =>
    ['qcow2', 'vmdk', 'raw'].includes(textValue(item.format).toLowerCase()),
  );
}

async function initialize() {
  if (!hasVmCapability('VM.Config.Disk')) return;
  loading.value = true;
  try {
    const [sourceResponse, targetResponse] = await Promise.all([
      getNodeStorage(node.value, 'import'),
      getNodeStorage(node.value, 'images'),
    ]);
    sourceStorages.value = (sourceResponse.data || []).map((item) => textValue(item.storage)).filter(Boolean);
    targetStorages.value = (targetResponse.data || []).map((item) => textValue(item.storage)).filter(Boolean);
    form.sourceStorage = sourceStorages.value[0] || '';
    form.targetStorage = targetStorages.value[0] || '';
    await loadFiles();
  } finally {
    loading.value = false;
  }
}

watch(visible, (isVisible) => {
  if (isVisible) void initialize();
});

async function importDisk() {
  if (!hasVmCapability('VM.Config.Disk') || !form.sourceVolume || !form.targetStorage) return;
  await updateConfig({
    [nextDeviceKey('scsi')]: `${form.targetStorage}:0,import-from=${form.sourceVolume}`,
  });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Import Hard Disk')" width="520px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-select v-model="form.sourceStorage" dense square outlined :options="sourceStorages" :label="gettext('Import Storage')" @update:model-value="loadFiles" />
        <q-select v-model="form.sourceVolume" dense square outlined emit-value map-options :options="files.map((file) => ({ label: String(file.volid || file.text || ''), value: String(file.volid || file.text || '') }))" :label="gettext('Select Image')" />
        <q-select v-model="form.targetStorage" dense square outlined :options="targetStorages" :label="gettext('Target Storage')" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!form.sourceVolume || !form.targetStorage" :label="gettext('Import')" @click="importDisk" />
      </template>
    </UWindow>
  </q-dialog>
</template>
