<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { Dialog } from 'quasar';
import type { QTableColumn } from 'quasar';
import type { PveRecord } from '@/api/resources';
import { deleteSdnVnet, deleteSdnVnetSubnet, getSdnVnetSubnets, getSdnVnets } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import VnetEditor from './vnets/VnetEditor.vue';
import SubnetEditor from './vnets/SubnetEditor.vue';

defineOptions({ name: 'CtVnetsPage' });

const loading = ref(false);
const subnetLoading = ref(false);
const selectedVnet = ref<PveRecord[]>([]);
const selectedSubnet = ref<PveRecord[]>([]);
const vnets = shallowRef<PveRecord[]>([]);
const subnets = shallowRef<PveRecord[]>([]);

const vnetEditorVisible = ref(false);
const subnetEditorVisible = ref(false);
const vnetEditorProps = shallowRef<{ vnetId?: string }>({});
const subnetEditorProps = shallowRef<{ vnet: string; subnetId?: string }>({ vnet: '' });

function pendingValue(row: PveRecord, key: string): unknown {
  const pending = (row.pending as PveRecord) || {};
  return pending[key] ?? row[key];
}

function displayValue(row: PveRecord, key: string): string {
  const v = pendingValue(row, key);
  if (v === undefined || v === null || v === '') return '-';
  if (typeof v === 'boolean') return v ? gettext('Yes') : '-';
  return textValue(v);
}

const selectedVnetRow = computed(() => selectedVnet.value[0]);
const selectedVnetDeleted = computed(() => textValue(selectedVnetRow.value?.state) === 'deleted');
const canEditOrRemoveVnet = computed(
  () => selectedVnet.value.length === 1 && !selectedVnetDeleted.value,
);

const selectedSubnetRow = computed(() => selectedSubnet.value[0]);
const selectedSubnetDeleted = computed(
  () => textValue(selectedSubnetRow.value?.state) === 'deleted',
);
const canEditOrRemoveSubnet = computed(
  () => selectedSubnet.value.length === 1 && !selectedSubnetDeleted.value,
);

const hasSelectedVnet = computed(() => selectedVnet.value.length === 1);

const vnetColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'vnet',
    required: true,
    label: 'VNet',
    align: 'left',
    field: (row) => displayValue(row, 'vnet'),
    sortable: true,
  },
  {
    name: 'alias',
    label: gettext('Alias'),
    align: 'left',
    field: (row) => displayValue(row, 'alias'),
    sortable: true,
  },
  {
    name: 'zone',
    label: gettext('Zone'),
    align: 'left',
    field: (row) => displayValue(row, 'zone'),
    sortable: true,
  },
  {
    name: 'tag',
    label: 'Tag',
    align: 'left',
    field: (row) => displayValue(row, 'tag'),
    sortable: true,
  },
  {
    name: 'vlanaware',
    label: 'VLAN aware',
    align: 'left',
    field: (row) => displayValue(row, 'vlanaware'),
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('State'),
    align: 'left',
    field: (row) => displayValue(row, 'state'),
    sortable: true,
  },
];

const subnetColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'cidr',
    required: true,
    label: gettext('Subnet'),
    align: 'left',
    field: (row) => displayValue(row, 'cidr'),
    sortable: true,
  },
  {
    name: 'gateway',
    label: gettext('Gateway'),
    align: 'left',
    field: (row) => displayValue(row, 'gateway'),
    sortable: true,
  },
  {
    name: 'snat',
    label: 'SNAT',
    align: 'left',
    field: (row) => displayValue(row, 'snat'),
    sortable: true,
  },
  {
    name: 'dnszoneprefix',
    label: gettext('DNS Prefix'),
    align: 'left',
    field: (row) => displayValue(row, 'dnszoneprefix'),
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('State'),
    align: 'left',
    field: (row) => displayValue(row, 'state'),
    sortable: true,
  },
];

async function refreshVnets() {
  loading.value = true;
  try {
    const response = await getSdnVnets();
    vnets.value = [...(response.data || [])].sort((a, b) =>
      textValue(a.vnet).localeCompare(textValue(b.vnet)),
    );
    selectedVnet.value = [];
    subnets.value = [];
  } finally {
    loading.value = false;
  }
}

async function refreshSubnets() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  if (!vnet) {
    subnets.value = [];
    selectedSubnet.value = [];
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

function openVnetCreate() {
  vnetEditorProps.value = {};
  vnetEditorVisible.value = true;
}

function openVnetEdit() {
  const row = selectedVnetRow.value;
  if (!row) return;
  const vnet = textValue(row.vnet);
  if (!vnet) return;
  vnetEditorProps.value = { vnetId: vnet };
  vnetEditorVisible.value = true;
}

function onVnetRowDblClick(_evt: unknown, row: PveRecord) {
  const vnet = textValue(row.vnet);
  if (!vnet || textValue(row.state) === 'deleted') return;
  vnetEditorProps.value = { vnetId: vnet };
  vnetEditorVisible.value = true;
}

function removeVnet() {
  const row = selectedVnetRow.value;
  if (!row) return;
  const vnet = textValue(row.vnet);
  if (!vnet) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', vnet),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      loading.value = true;
      try {
        await deleteSdnVnet(vnet);
        await refreshVnets();
      } finally {
        loading.value = false;
      }
    })();
  });
}

function openSubnetCreate() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  if (!vnet) return;
  subnetEditorProps.value = { vnet };
  subnetEditorVisible.value = true;
}

function openSubnetEdit() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  const subnet = textValue(selectedSubnetRow.value?.subnet);
  if (!vnet || !subnet) return;
  subnetEditorProps.value = { vnet, subnetId: subnet };
  subnetEditorVisible.value = true;
}

function onSubnetRowDblClick(_evt: unknown, row: PveRecord) {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  const subnet = textValue(row.subnet);
  if (!vnet || !subnet || textValue(row.state) === 'deleted') return;
  subnetEditorProps.value = { vnet, subnetId: subnet };
  subnetEditorVisible.value = true;
}

function removeSubnet() {
  const vnet = textValue(selectedVnet.value[0]?.vnet);
  const subnet = textValue(selectedSubnetRow.value?.subnet);
  if (!vnet || !subnet) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', subnet),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      subnetLoading.value = true;
      try {
        await deleteSdnVnetSubnet(vnet, subnet);
        await refreshSubnets();
      } finally {
        subnetLoading.value = false;
      }
    })();
  });
}

watch(selectedVnet, refreshSubnets);
onMounted(refreshVnets);
</script>

<template>
  <div class="sdn-page row q-col-gutter-md">
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
        @row-dblclick="onVnetRowDblClick"
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Create')"
              @click="openVnetCreate"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="canEditOrRemoveVnet ? 'primary' : 'grey'"
              class="u-button"
              :disable="!canEditOrRemoveVnet"
              :label="gettext('Edit')"
              @click="openVnetEdit"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="canEditOrRemoveVnet ? 'red' : 'grey'"
              class="u-button"
              :disable="!canEditOrRemoveVnet"
              :label="gettext('Remove')"
              @click="removeVnet"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshVnets"
            />
          </div>
        </template>
        <template #body-cell-state="scope">
          <q-td :props="scope">
            <q-badge
              v-if="textValue(pendingValue(scope.row, 'state'))"
              :color="
                textValue(pendingValue(scope.row, 'state')) === 'deleted' ? 'negative' : 'warning'
              "
              :label="textValue(pendingValue(scope.row, 'state'))"
            />
            <span v-else>-</span>
          </q-td>
        </template>
      </q-table>
    </div>
    <div class="col-6">
      <q-table
        flat
        row-key="subnet"
        table-header-class="u-table-header"
        selection="single"
        :rows="subnets"
        :columns="subnetColumns"
        :selected="selectedSubnet"
        :loading="subnetLoading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @update:selected="selectedSubnet = [...$event]"
        @row-dblclick="onSubnetRowDblClick"
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              :color="hasSelectedVnet ? 'primary' : 'grey'"
              class="u-button"
              :disable="!hasSelectedVnet"
              :label="gettext('Create')"
              @click="openSubnetCreate"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="canEditOrRemoveSubnet ? 'primary' : 'grey'"
              class="u-button"
              :disable="!canEditOrRemoveSubnet"
              :label="gettext('Edit')"
              @click="openSubnetEdit"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="canEditOrRemoveSubnet ? 'red' : 'grey'"
              class="u-button"
              :disable="!canEditOrRemoveSubnet"
              :label="gettext('Remove')"
              @click="removeSubnet"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshSubnets"
            />
          </div>
        </template>
        <template #body-cell-state="scope">
          <q-td :props="scope">
            <q-badge
              v-if="textValue(pendingValue(scope.row, 'state'))"
              :color="
                textValue(pendingValue(scope.row, 'state')) === 'deleted' ? 'negative' : 'warning'
              "
              :label="textValue(pendingValue(scope.row, 'state'))"
            />
            <span v-else>-</span>
          </q-td>
        </template>
      </q-table>
    </div>
    <VnetEditor v-model="vnetEditorVisible" v-bind="vnetEditorProps" @saved="refreshVnets" />
    <SubnetEditor
      v-model="subnetEditorVisible"
      v-bind="subnetEditorProps"
      @saved="refreshSubnets"
    />
  </div>
</template>

<style scoped>
.sdn-page {
  margin: 16px;
  background: #fff;
}
</style>
