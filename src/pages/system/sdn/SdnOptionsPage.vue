<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  deleteSdnController,
  deleteSdnDns,
  deleteSdnIpam,
  getSdnControllers,
  getSdnDns,
  getSdnIpams,
} from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type Section = 'controllers' | 'ipams' | 'dns';

const loading = ref(false);
const selected = ref<Record<Section, PveRecord[]>>({ controllers: [], ipams: [], dns: [] });
const controllers = shallowRef<PveRecord[]>([]);
const ipams = shallowRef<PveRecord[]>([]);
const dnsRows = shallowRef<PveRecord[]>([]);

const columns: QTableColumn<PveRecord>[] = [
  { name: 'id', required: true, label: 'ID', align: 'left', field: (row) => row.id || row.name || '-', sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => row.type || '-', sortable: true },
  { name: 'zone', label: gettext('Zone'), align: 'left', field: (row) => row.zone || '-', sortable: true },
  { name: 'server', label: gettext('Server'), align: 'left', field: (row) => row.server || row.url || '-', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: (row) => row.comment || '-', sortable: true },
];

async function refreshData() {
  loading.value = true;
  try {
    const [controllerResponse, ipamResponse, dnsResponse] = await Promise.all([
      getSdnControllers(),
      getSdnIpams(),
      getSdnDns(),
    ]);
    controllers.value = controllerResponse.data || [];
    ipams.value = ipamResponse.data || [];
    dnsRows.value = dnsResponse.data || [];
  } finally {
    loading.value = false;
  }
}

function removeSelected(section: Section) {
  const row = selected.value[section][0];
  const id = textValue(row?.id || row?.name);
  if (!id) return;
  const remover = section === 'controllers' ? deleteSdnController : section === 'ipams' ? deleteSdnIpam : deleteSdnDns;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', id), cancel: true, persistent: true }).onOk(() => void remover(id).then(refreshData));
}

onMounted(refreshData);
</script>

<template>
  <div class="q-ma-md column q-gutter-md">
    <q-table flat row-key="id" table-header-class="u-table-header" selection="single" :title="gettext('Controller')" :rows="controllers" :columns="columns" :selected="selected.controllers" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" @update:selected="selected.controllers = [...$event]">
      <template #top><div class="text-subtitle2">{{ gettext('Controller') }}</div><q-space /><q-btn no-caps outline size="12px" :color="selected.controllers.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selected.controllers.length !== 1" :label="gettext('Remove')" @click="removeSelected('controllers')" /></template>
    </q-table>
    <q-table flat row-key="id" table-header-class="u-table-header" selection="single" :title="gettext('IPAM')" :rows="ipams" :columns="columns" :selected="selected.ipams" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" @update:selected="selected.ipams = [...$event]">
      <template #top><div class="text-subtitle2">IPAM</div><q-space /><q-btn no-caps outline size="12px" :color="selected.ipams.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selected.ipams.length !== 1" :label="gettext('Remove')" @click="removeSelected('ipams')" /></template>
    </q-table>
    <q-table flat row-key="id" table-header-class="u-table-header" selection="single" :title="gettext('DNS')" :rows="dnsRows" :columns="columns" :selected="selected.dns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" @update:selected="selected.dns = [...$event]">
      <template #top><div class="text-subtitle2">DNS</div><q-space /><q-btn no-caps outline size="12px" :color="selected.dns.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selected.dns.length !== 1" :label="gettext('Remove')" @click="removeSelected('dns')" /></template>
    </q-table>
    <q-btn no-caps outline size="12px" color="primary" class="u-button self-start" :label="gettext('Refresh')" @click="refreshData" />
  </div>
</template>
