<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef, watch } from 'vue';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';

type MediaType = 'iso' | 'cdrom' | 'none';

const { device } = defineProps<{ device: HardwareRow }>();
const { node, config, canEditRow, updateConfig } = useVmHardwareContext();
const storageRows = shallowRef<PveRecord[]>([]);
const isoRows = shallowRef<PveRecord[]>([]);
const form = reactive<{ mediaType: MediaType; storage: string; volid: string }>({
  mediaType: 'iso',
  storage: '',
  volid: '',
});

function parseCdrom(value: unknown): { mediaType: MediaType; storage: string; volid: string } {
  const raw = textValue(value);
  if (raw === 'cdrom,media=cdrom') return { mediaType: 'cdrom', storage: '', volid: '' };
  if (raw === 'none,media=cdrom') return { mediaType: 'none', storage: '', volid: '' };
  const volid = raw.split(',')[0] || '';
  return {
    mediaType: 'iso',
    storage: volid.includes(':') ? volid.split(':')[0] || '' : '',
    volid,
  };
}

Object.assign(form, parseCdrom(config.value[device.key]));

const storageOptions = computed(() =>
  storageRows.value.map((row) => ({
    label: textValue(row.storage),
    value: textValue(row.storage),
  })).filter((row) => row.value)
);
const isoOptions = computed(() =>
  isoRows.value.map((row) => {
    const volid = textValue(row.volid);
    return {
      label: volid.replace(/^.*:(.*\/)?/, ''),
      value: volid,
    };
  }).filter((row) => row.value)
);
const canSave = computed(() => form.mediaType !== 'iso' || Boolean(form.volid));

async function loadStorages() {
  storageRows.value = (await getNodeStorage(node.value, 'iso')).data || [];
  if (!form.storage && storageRows.value[0]?.storage) form.storage = textValue(storageRows.value[0].storage);
}

async function loadIsoImages(selectFirst = false) {
  if (!form.storage) {
    isoRows.value = [];
    form.volid = '';
    return;
  }
  isoRows.value = (await getStorageContent(node.value, form.storage, 'iso')).data || [];
  if (selectFirst || !isoRows.value.some((row) => textValue(row.volid) === form.volid)) {
    form.volid = textValue(isoRows.value[0]?.volid);
  }
}

function cdromValue() {
  if (form.mediaType === 'cdrom') return 'cdrom,media=cdrom';
  if (form.mediaType === 'none') return 'none,media=cdrom';
  return `${form.volid},media=cdrom`;
}

async function save() {
  if (!canEditRow(device) || !canSave.value) return;
  await updateConfig({ [device.key]: cdromValue() });
}

watch(
  () => form.storage,
  () => {
    if (form.mediaType === 'iso') void loadIsoImages(true);
  },
);

watch(
  () => form.mediaType,
  (mediaType) => {
    if (mediaType === 'iso' && form.storage) void loadIsoImages(false);
  },
);

onMounted(async () => {
  await loadStorages();
  if (form.mediaType === 'iso') await loadIsoImages(false);
});
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-radio v-model="form.mediaType" dense val="iso" :label="gettext('Use CD/DVD disc image file (iso)')" />
      </div>
      <div class="col-12 q-pl-lg">
        <q-select
          v-model="form.storage"
          dense
          options-dense
          emit-value
          map-options
          :disable="form.mediaType !== 'iso'"
          :options="storageOptions"
          :label="gettext('Storage')"
        />
      </div>
      <div class="col-12 q-pl-lg">
        <q-select
          v-model="form.volid"
          dense
          options-dense
          emit-value
          map-options
          :disable="form.mediaType !== 'iso'"
          :options="isoOptions"
          :label="gettext('ISO image')"
        />
      </div>
      <div class="col-12">
        <q-radio v-model="form.mediaType" dense val="cdrom" :label="gettext('Use physical CD/DVD Drive')" />
      </div>
      <div class="col-12">
        <q-radio v-model="form.mediaType" dense val="none" :label="gettext('Do not use any media')" />
      </div>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-end">
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :disable="!canSave"
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
