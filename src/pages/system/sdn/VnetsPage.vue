<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { deleteSdnVnet, deleteSdnVnetSubnet, getSdnVnetSubnets, getSdnVnets } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const subnetLoading = ref(false);
const selectedVnet = ref<PveRecord[]>([]);
const selectedSubnet = ref<PveRecord[]>([]);
const vnets = shallowRef<PveRecord[]>([]);
const subnets = shallowRef<PveRecord[]>([]);

const vnetColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'vnet',
    required: true,
    label: 'VNet',
    align: 'left',
    field: (row) => row.vnet || '-',
    sortable: true,
  },
  {
    name: 'alias',
    label: gettext('Alias'),
    align: 'left',
    field: (row) => row.alias || '-',
    sortable: true,
  },
  {
    name: 'zone',
    label: gettext('Zone'),
    align: 'left',
    field: (row) => row.zone || '-',
    sortable: true,
  },
  { name: 'tag', label: 'Tag', align: 'left', field: (row) => row.tag || '-', sortable: true },
  {
    name: 'vlanaware',
    label: 'VLAN aware',
    align: 'left',
    field: (row) => row.vlanaware || '-',
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.state || '-',
    sortable: true,
  },
];

const subnetColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'subnet',
    required: true,
    label: gettext('Subnet'),
    align: 'left',
    field: (row) => row.subnet || row.cidr || row.id || '-',
    sortable: true,
  },
  {
    name: 'gateway',
    label: gettext('Gateway'),
    align: 'left',
    field: (row) => row.gateway || '-',
    sortable: true,
  },
  { name: 'snat', label: 'SNAT', align: 'left', field: (row) => row.snat || '-', sortable: true },
  {
    name: 'dnszoneprefix',
    label: gettext('DNS Prefix'),
    align: 'left',
    field: (row) => row.dnszoneprefix || '-',
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.state || '-',
    sortable: true,
  },
];

async function refreshVnets() {
  loading.value = true;
  try {
    const response = await getSdnVnets();
    vnets.value = response.data || [];
    selectedVnet.value = vnets.value[0] ? [vnets.value[0]] : [];
  } finally {
    loading.value = false;
  }
}

async function refreshSubnets() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  if (!vnet) {
    subnets.value = [];
    return;
  }
  subnetLoading.value = true;
  try {
    const response = await getSdnVnetSubnets(vnet);
    subnets.value = response.data || [];
    selectedSubnet.value = [];
  } finally {
    subnetLoading.value = false;
  }
}

function removeVnet() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  if (!vnet) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', vnet),
    cancel: true,
    persistent: true,
  }).onOk(() => void deleteSdnVnet(vnet).then(refreshVnets));
}

function removeSubnet() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  const subnet = textValue(selectedSubnet.value[0]?.id || selectedSubnet.value[0]?.subnet);
  if (!vnet || !subnet) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', subnet),
    cancel: true,
    persistent: true,
  }).onOk(() => void deleteSdnVnetSubnet(vnet, subnet).then(refreshSubnets));
}

watch(selectedVnet, refreshSubnets);
onMounted(refreshVnets);
</script>

<template>
  <div class="q-ma-md row q-col-gutter-md">
    <div class="col-6">
      <q-table
        flat
        row-key="vnet"
        table-header-class="u-table-header"
        selection="single"
        :rows="vnets"
        :columns="vnetColumns"
        :selected="selectedVnet"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @update:selected="selectedVnet = [...$event]"
        ><template #top
          ><div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshVnets"
            /><q-btn
              no-caps
              outline
              size="12px"
              :color="selectedVnet.length !== 1 ? 'grey' : 'red'"
              class="u-button"
              :disable="selectedVnet.length !== 1"
              :label="gettext('Remove')"
              @click="removeVnet"
            /></div></template
      ></q-table>
    </div>
    <div class="col-6">
      <q-table
        flat
        row-key="id"
        table-header-class="u-table-header"
        selection="single"
        :rows="subnets"
        :columns="subnetColumns"
        :selected="selectedSubnet"
        :loading="subnetLoading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @update:selected="selectedSubnet = [...$event]"
        ><template #top
          ><div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshSubnets"
            /><q-btn
              no-caps
              outline
              size="12px"
              :color="selectedSubnet.length !== 1 ? 'grey' : 'red'"
              class="u-button"
              :disable="selectedSubnet.length !== 1"
              :label="gettext('Remove')"
              @click="removeSubnet"
            /></div></template
      ></q-table>
    </div>
  </div>
</template>
