<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import MetricSparkline from '@/components/MetricSparkline.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { getClusterResources } from '@/api/resources';
import { getNodeRrd, getNodeStatus, getStorageRrd, getVmCurrent, getVmRrd } from '@/api/overview';
import { gettext } from '@/locale';
import { formatBytes, textValue, usedPercent } from '@/utils/pveFormat';

const props = defineProps<{
  mode: 'computer' | 'host' | 'storage';
}>();

const loading = ref(false);
const selectedId = ref('');
const resources = shallowRef<PveRecord[]>([]);
const current = shallowRef<PveRecord>({});
const rrdRows = shallowRef<PveRecord[]>([]);

const modeType = computed(() => (props.mode === 'computer' ? 'vm' : props.mode === 'host' ? 'node' : 'storage'));
const title = computed(() => (props.mode === 'computer' ? gettext('Computer') : props.mode === 'host' ? gettext('Host') : gettext('Storage')));

const options = computed(() =>
  resources.value.map((item) => ({
    label:
      props.mode === 'computer'
        ? `${textValue(item.vmid)} / ${textValue(item.name || item.type, '-')}`
        : textValue(item.node || item.storage || item.id),
    value: resourceId(item),
  })),
);

const selectedResource = computed(() => resources.value.find((item) => resourceId(item) === selectedId.value) || resources.value[0] || {});

const statRows = computed(() => [
  { label: gettext('Name'), value: textValue(selectedResource.value.name || selectedResource.value.node || selectedResource.value.storage || selectedResource.value.id, '-') },
  { label: gettext('Status'), value: textValue(current.value.status || selectedResource.value.status, '-') },
  { label: gettext('Node'), value: textValue(selectedResource.value.node, '-') },
  { label: gettext('Uptime'), value: formatUptime(current.value.uptime) },
  { label: gettext('CPU Usage'), value: `${usedPercent(Number(current.value.cpu || selectedResource.value.cpu), 1).toFixed(2)}%` },
  { label: gettext('Memory Usage'), value: `${formatBytes(current.value.mem as number)} / ${formatBytes((current.value.maxmem || selectedResource.value.maxmem) as number)}` },
  { label: gettext('Disk Usage'), value: `${formatBytes((current.value.disk || selectedResource.value.disk) as number)} / ${formatBytes((current.value.maxdisk || selectedResource.value.maxdisk) as number)}` },
]);

const cpuValues = computed(() => rrdRows.value.map((item) => Number(item.cpu || 0) * 100));
const memoryValues = computed(() => rrdRows.value.map((item) => item.mem as number));
const networkValues = computed(() => rrdRows.value.map((item) => Number(item.netin || 0) + Number(item.netout || 0)));
const diskValues = computed(() => rrdRows.value.map((item) => Number(item.diskread || 0) + Number(item.diskwrite || 0)));

const tableColumns = computed<QTableColumn<PveRecord>[]>(() => {
  const base: QTableColumn<PveRecord>[] = [
    { name: 'name', required: true, label: gettext('Name'), align: 'left', field: (row) => row.name || row.node || row.storage || row.id || '-', sortable: true },
    { name: 'node', label: gettext('Node'), align: 'left', field: (row) => row.node || '-', sortable: true },
    { name: 'status', label: gettext('Status'), align: 'left', field: (row) => row.status || '-', sortable: true },
    { name: 'usage', label: gettext('Usage'), align: 'left', field: 'usage' },
  ];
  if (props.mode === 'computer') {
    base.splice(1, 0, { name: 'vmid', label: gettext('VMID'), align: 'left', field: (row) => row.vmid || '-', sortable: true });
  }
  return base;
});

function resourceId(row: PveRecord) {
  const fallback = `${textValue(row.node)}:${textValue(row.vmid || row.storage || row.node || row.name)}`;
  return textValue(row.id, fallback);
}

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

async function loadResources() {
  loading.value = true;
  try {
    const response = await getClusterResources({ type: modeType.value });
    resources.value = response.data || [];
    selectedId.value = resourceId(resources.value[0] || {});
    await loadSelected();
  } finally {
    loading.value = false;
  }
}

async function loadSelected() {
  const row = selectedResource.value;
  if (!Object.keys(row).length) {
    current.value = {};
    rrdRows.value = [];
    return;
  }

  loading.value = true;
  try {
    if (props.mode === 'computer') {
      const type = row.type === 'lxc' ? 'lxc' : 'qemu';
      const [statusResponse, rrdResponse] = await Promise.all([
        getVmCurrent(textValue(row.node), textValue(row.vmid), type),
        getVmRrd(textValue(row.node), textValue(row.vmid), 'hour', 'AVERAGE', type),
      ]);
      current.value = statusResponse.data || {};
      rrdRows.value = rrdResponse.data || [];
    } else if (props.mode === 'host') {
      const [statusResponse, rrdResponse] = await Promise.all([
        getNodeStatus(textValue(row.node)),
        getNodeRrd(textValue(row.node), 'hour', 'AVERAGE'),
      ]);
      current.value = statusResponse.data || {};
      rrdRows.value = rrdResponse.data || [];
    } else {
      const rrdResponse = await getStorageRrd(textValue(row.node, 'localhost'), textValue(row.storage), 'hour', 'AVERAGE');
      current.value = row;
      rrdRows.value = rrdResponse.data || [];
    }
  } finally {
    loading.value = false;
  }
}

watch(selectedId, () => {
  void loadSelected();
});

onMounted(loadResources);
</script>

<template>
  <div class="q-ma-md">
    <div class="bg-white q-pa-sm row items-center q-gutter-sm">
      <q-select v-model="selectedId" square outlined dense emit-value map-options options-dense class="resource-select" :options="options" :label="title" />
      <q-btn no-caps outline size="12px" color="primary" class="u-button" :loading="loading" :label="gettext('Refresh')" @click="loadResources" />
    </div>

    <div class="row q-col-gutter-md q-mt-sm">
      <div class="col-12 col-md-4">
        <q-card flat bordered class="overview-card">
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">{{ gettext('Status') }}</div>
            <div v-for="item in statRows" :key="item.label" class="row q-py-xs">
              <div class="col text-grey-7">{{ item.label }}</div>
              <div class="col text-right text-grey-9">{{ item.value }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-8">
        <q-table flat row-key="id" table-header-class="u-table-header" :rows="resources" :columns="tableColumns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 8 }" :rows-per-page-options="[8]" :no-data-label="gettext('no record can be found')" @row-click="(_, row) => { selectedId = resourceId(row); }">
          <template #body-cell-usage="scope">
            <q-td :props="scope">
              <UsageProgress :percent="usedPercent(Number(scope.row.mem || scope.row.disk), Number(scope.row.maxmem || scope.row.maxdisk))" />
            </q-td>
          </template>
        </q-table>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-sm">
      <div class="col-12 col-md-6"><q-card flat bordered><q-card-section><div class="text-subtitle2 q-mb-sm">{{ gettext('CPU Usage') }}</div><MetricSparkline :values="cpuValues" /></q-card-section></q-card></div>
      <div class="col-12 col-md-6"><q-card flat bordered><q-card-section><div class="text-subtitle2 q-mb-sm">{{ gettext('Memory Usage') }}</div><MetricSparkline :values="memoryValues" color="#2e7d32" /></q-card-section></q-card></div>
      <div class="col-12 col-md-6"><q-card flat bordered><q-card-section><div class="text-subtitle2 q-mb-sm">{{ gettext('Network Traffic') }}</div><MetricSparkline :values="networkValues" color="#00838f" /></q-card-section></q-card></div>
      <div class="col-12 col-md-6"><q-card flat bordered><q-card-section><div class="text-subtitle2 q-mb-sm">{{ props.mode === 'storage' ? gettext('Disk Usage') : gettext('Disk IO') }}</div><MetricSparkline :values="diskValues" color="#ef6c00" /></q-card-section></q-card></div>
    </div>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.resource-select {
  min-width: 260px;
}

.overview-card {
  min-height: 278px;
}
</style>
