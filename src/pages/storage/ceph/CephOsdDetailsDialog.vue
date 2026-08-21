<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephOsdLvInfo, getCephOsdMetadata } from '@/api/ceph';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { formatBytes, textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>('visible', { default: false });
const { node, osdId } = defineProps<{ node: string; osdId: string }>();
const loading = ref(false);
const tab = ref('general');
const metadata = shallowRef<PveRecord>({});
const devices = shallowRef<PveRecord[]>([]);
const selectedDevices = shallowRef<PveRecord[]>([]);
const volumeDetails = shallowRef<PveRecord>({});
const generalRows = computed(() => Object.entries((metadata.value.osd as PveRecord) || {}).sort());
const deviceColumns: QTableColumn<PveRecord>[] = [
  { name: 'device', label: gettext('Device'), field: 'device', align: 'left' },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
  { name: 'physical_device', label: gettext('Physical Device'), field: 'physical_device', align: 'left' },
  { name: 'size', label: gettext('Size'), field: (row) => formatBytes(row.size as number), align: 'right' },
  { name: 'support_discard', label: 'Discard', field: (row) => textValue(row.support_discard) || '-', align: 'left' },
  { name: 'dev_node', label: gettext('Device node'), field: (row) => textValue(row.dev_node) || '-', align: 'left' },
];

async function loadDetails() {
  if (!visible.value || !node || !osdId) return;
  loading.value = true;
  try {
    const response = await getCephOsdMetadata(node, osdId);
    if (!visible.value) return;
    metadata.value = response.data || {};
    devices.value = Array.isArray(response.data?.devices) ? response.data.devices as PveRecord[] : [];
    const blockDevice = devices.value.find((device) => textValue(device.device) === 'block');
    selectedDevices.value = blockDevice ? [blockDevice] : [];
    if (blockDevice) await loadVolumeDetails(blockDevice);
  } finally {
    loading.value = false;
  }
}

async function loadVolumeDetails(device?: PveRecord) {
  const type = textValue(device?.device);
  if (!type || !node || !osdId) return;
  const response = await getCephOsdLvInfo(node, osdId, type);
  volumeDetails.value = response.data || {};
}

watch([visible, () => node, () => osdId], () => void loadDetails());
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow width="900px" :title="`${gettext('Details')}: OSD ${osdId}`" :loading="loading">
      <q-tabs v-model="tab" dense align="left" active-color="primary" indicator-color="primary" class="bg-grey-2 text-grey-8">
        <q-tab name="general" :label="gettext('General')" />
        <q-tab name="devices" :label="gettext('Devices')" />
      </q-tabs>
      <q-tab-panels v-model="tab">
        <q-tab-panel name="general" class="q-pa-md">
          <div v-for="[key, value] in generalRows" :key="key" class="detail-row"><span>{{ key }}</span><span>{{ textValue(value, '-') }}</span></div>
        </q-tab-panel>
        <q-tab-panel name="devices" class="q-pa-none"><q-table v-model:selected="selectedDevices" flat row-key="device" selection="single" table-header-class="u-table-header" :rows="devices" :columns="deviceColumns" :loading="loading" :rows-per-page-options="[0]" :pagination="{ rowsPerPage: 0 }" @update:selected="(selection) => void loadVolumeDetails(selection[0])" /><div v-if="selectedDevices[0]" class="volume-details"><div>{{ gettext('Volume Details for') }} {{ selectedDevices[0].device }}</div><div v-for="[key, value] in Object.entries(volumeDetails)" :key="key" class="detail-row"><span>{{ key }}</span><span>{{ textValue(value, '-') }}</span></div></div></q-tab-panel>
      </q-tab-panels>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.detail-row { display: grid; grid-template-columns: 220px 1fr; gap: 16px; min-height: 30px; }
.detail-row span:first-child { color: #666; }
</style>
