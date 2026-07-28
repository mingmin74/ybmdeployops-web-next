<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getNodeServices, restartNodeService, startNodeService, stopNodeService, type PveService } from '@/api/host';
import { gettext } from '@/locale';

const { node } = defineProps<{ node: string }>();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const rows = shallowRef<PveService[]>([]);
const selected = shallowRef<PveService[]>([]);
const selectedService = computed(() => selected.value[0]);
const columns: QTableColumn<PveService>[] = [
  { name: 'name', label: gettext('Name'), align: 'left', field: (row) => row.service || row.name },
  { name: 'state', label: gettext('Status'), align: 'left', field: 'state' },
  { name: 'desc', label: gettext('Description'), align: 'left', field: 'desc' },
];

async function loadServices() {
  if (!node) return;
  loading.value = true;
  try {
    const response = await getNodeServices(node);
    rows.value = response.data || [];
    const name = selectedService.value?.service || selectedService.value?.name;
    selected.value = name ? rows.value.filter((row) => (row.service || row.name) === name) : [];
  } finally { loading.value = false; }
}

async function changeService(action: 'start' | 'stop' | 'restart') {
  const service = selectedService.value?.service || selectedService.value?.name;
  if (!service) return;
  actionLoading.value = true;
  try {
    if (action === 'start') await startNodeService(node, service);
    else if (action === 'stop') await stopNodeService(node, service);
    else await restartNodeService(node, service);
    await loadServices();
  } finally { actionLoading.value = false; }
}

function selectRow(_event: Event, row: PveService) { selected.value = (selectedService.value?.service || selectedService.value?.name) === (row.service || row.name) ? [] : [row]; }

watch(() => node, () => { void loadServices(); }, { immediate: true });
</script>

<template>
  <q-table flat row-key="name" selection="single" hide-selected-banner table-header-class="u-table-header" :rows="rows" :columns="columns" :loading="loading" :selected="selected" :rows-per-page-options="[0]" :no-data-label="gettext('no record can be found')" @row-click="selectRow" @update:selected="selected = [...$event]">
    <template #top><div class="row q-gutter-sm">
      <q-btn no-caps outline size="12px" class="u-button" :color="selectedService ? 'primary' : 'grey'" :disable="!selectedService" :loading="actionLoading" :label="gettext('Start')" @click="changeService('start')" />
      <q-btn no-caps outline size="12px" class="u-button" :color="selectedService ? 'red' : 'grey'" :disable="!selectedService" :loading="actionLoading" :label="gettext('Stop')" @click="changeService('stop')" />
      <q-btn no-caps outline size="12px" class="u-button" :color="selectedService ? 'primary' : 'grey'" :disable="!selectedService" :loading="actionLoading" :label="gettext('Restart')" @click="changeService('restart')" />
      <q-btn no-caps outline size="12px" color="primary" class="u-button" :loading="loading" :label="gettext('Reload')" @click="loadServices" />
    </div></template>
    <template #body-cell-state="props"><q-td :props="props"><q-badge :color="props.value === 'running' ? 'green' : 'red'" :label="props.value || '-'" /></q-td></template>
  </q-table>
</template>
