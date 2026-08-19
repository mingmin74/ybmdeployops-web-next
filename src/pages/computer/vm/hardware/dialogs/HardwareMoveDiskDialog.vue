<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getNodeStorage } from '@/api/storageContent';
import { moveVmDisk } from '@/api/vm';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const storages = shallowRef<PveRecord[]>([]);
const form = reactive({ storage: '', format: '', deleteSource: false });
const { canMoveDisk, loading, node, notifyTask, notifyUpdated, selectedDevice, vmid } =
  useVmHardwareContext();
const storageOptions = computed(() => storages.value.map((storage) => textValue(storage.storage)).filter(Boolean));
const selectedStorage = computed(() =>
  storages.value.find((storage) => textValue(storage.storage) === form.storage)
);
const formatOptions = computed(() => {
  const storage = selectedStorage.value;
  if (!storage) return [];
  const formats = storage.formats as { supported?: unknown; default?: unknown } | undefined;
  const supported = Array.isArray(formats?.supported)
    ? formats.supported.map((v: unknown) => textValue(v)).filter(Boolean)
    : textValue(storage.format).split(/[;,\s]+/).filter(Boolean);
  return [...new Set(supported)];
});
const formatDisabled = computed(() => formatOptions.value.length <= 1);
function defaultFormat() {
  const options = formatOptions.value;
  if (options.includes('qcow2')) return 'qcow2';
  if (options.includes('raw')) return 'raw';
  const preferred = textValue((selectedStorage.value?.formats as { default?: unknown } | undefined)?.default);
  return options.includes(preferred) ? preferred : options[0] || '';
}

async function loadStorages() {
  if (!canMoveDisk.value) return;
  loading.value = true;
  try {
    const response = await getNodeStorage(node.value, 'images');
    storages.value = response.data || [];
    form.storage = '';
    form.format = '';
    form.deleteSource = false;
  } finally {
    loading.value = false;
  }
}

watch(visible, (isVisible) => {
  if (isVisible) void loadStorages();
});
watch(
  () => form.storage,
  () => {
    form.format = form.storage ? defaultFormat() : '';
  }
);

async function moveDisk() {
  const disk = selectedDevice.value;
  if (!canMoveDisk.value || !disk || !form.storage) return;
  loading.value = true;
  try {
    const response = await moveVmDisk(node.value, vmid.value, {
      disk: disk.key,
      storage: form.storage,
      ...(form.format ? { format: form.format } : {}),
      delete: form.deleteSource ? 1 : 0,
    });
    visible.value = false;
    notifyUpdated();
    const upid = textValue((response as { data?: unknown }).data ?? response);
    if (upid.startsWith('UPID:')) notifyTask(upid, gettext('Move disk'));
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
          :options="storageOptions"
          :label="gettext('Target Storage')"
        />
        <q-select
          v-model="form.format"
          dense
          square
          outlined
          :disable="formatDisabled"
          :options="formatOptions"
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
