<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import { getNodeStorage } from '@/api/storageContent';
import { moveVmDisk } from '@/api/vm';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const storages = shallowRef<string[]>([]);
const form = reactive({ storage: '', format: '', deleteSource: false });
const { hasVmCapability, loading, node, notifyUpdated, selectedDevice, vmid } =
  useVmHardwareContext();

async function loadStorages() {
  if (!hasVmCapability('VM.Config.Disk') || selectedDevice.value?.type !== 'disk') return;
  loading.value = true;
  try {
    const response = await getNodeStorage(node.value, 'images');
    storages.value = (response.data || []).map((item) => textValue(item.storage)).filter(Boolean);
    form.storage = storages.value[0] || '';
    form.format = '';
    form.deleteSource = false;
  } finally {
    loading.value = false;
  }
}

watch(visible, (isVisible) => {
  if (isVisible) void loadStorages();
});

async function moveDisk() {
  const disk = selectedDevice.value;
  if (!hasVmCapability('VM.Config.Disk') || disk?.type !== 'disk' || !form.storage) return;
  loading.value = true;
  try {
    await moveVmDisk(node.value, vmid.value, {
      disk: disk.key,
      storage: form.storage,
      ...(form.format ? { format: form.format } : {}),
      delete: form.deleteSource ? 1 : 0,
    });
    visible.value = false;
    notifyUpdated();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Move disk')" width="460px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-select
          v-model="form.storage"
          dense
          square
          outlined
          :options="storages"
          :label="gettext('Target Storage')"
        />
        <q-select
          v-model="form.format"
          dense
          square
          outlined
          clearable
          :options="['raw', 'qcow2', 'vmdk']"
          :label="gettext('Disk Format')"
        />
        <q-checkbox v-model="form.deleteSource" :label="gettext('Delete source')" />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!form.storage"
          :label="gettext('Move disk')"
          @click="moveDisk"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
