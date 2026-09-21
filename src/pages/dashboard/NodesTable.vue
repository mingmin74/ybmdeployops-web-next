<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { getNodes } from '@/api/host';
import type { PveNode } from '@/api/resources';
import UsageProgress from '@/components/UsageProgress.vue';
import { gettext } from '@/locale';
import { usagePercent } from '@/utils/format';

type NodeRow = PveNode & { id?: string; maxcpu?: number; uptime?: number };

const loading = shallowRef(false);
const nodes = shallowRef<NodeRow[]>([]);
let refreshTimer: number | undefined;
let loadingNodes = false;

const nodeColumns: QTableColumn<NodeRow>[] = [
  {
    name: 'node',
    required: true,
    label: gettext('Name'),
    field: 'node',
    align: 'left',
    sortable: true,
  },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
  {
    name: 'disk',
    label: gettext('Local Disk Usage'),
    field: (row) => usagePercent(row.disk, row.maxdisk),
    align: 'left',
  },
  {
    name: 'memory',
    label: gettext('Memory Usage'),
    field: (row) => usagePercent(row.mem, row.maxmem),
    align: 'left',
  },
  {
    name: 'cpu',
    label: gettext('CPU Usage'),
    field: (row) => `${(Number(row.cpu || 0) * 100).toFixed(2)}%`,
    align: 'left',
  },
  {
    name: 'uptime',
    label: gettext('Uptime'),
    field: (row) => formatUptime(row.uptime),
    align: 'left',
  },
];

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!seconds || !Number.isFinite(seconds)) return '-';
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor(
    (seconds % 3600) / 60
  )}m`;
}

async function loadNodes(showLoading = false) {
  if (loadingNodes) return;
  loadingNodes = true;
  if (showLoading) loading.value = true;
  try {
    const response = await getNodes();
    nodes.value = [...(response.data || [])]
      .sort((left, right) => left.node.localeCompare(right.node))
      .map((node) => node as NodeRow);
  } finally {
    if (showLoading) loading.value = false;
    loadingNodes = false;
  }
}

onMounted(() => {
  void loadNodes(true);
  refreshTimer = window.setInterval(() => void loadNodes(), 3000);
});
onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <q-card
    flat
    bordered
    class="nodes-card"
  >
    <q-card-section class="nodes-card__header">
      <div class="row items-center justify-between">
        <div class="nodes-card__title">{{ gettext('节点') }}</div>

        <q-btn
          flat
          dense
          round
          size="sm"
          icon="chevron_right"
          color="grey-6"
        />
      </div>
    </q-card-section>

    <q-separator />

    <q-table
      flat
      dense
      row-key="node"
      table-header-class="u-table-header"
      class="nodes-card__table"
      :rows="nodes"
      :columns="nodeColumns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 0 }"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('no record can be found')"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="props.value === 'online' ? 'green' : props.value === 'offline' ? 'red' : 'grey'"
            :label="props.value || '-'"
          />
        </q-td>
      </template>
      <template #body-cell-disk="props">
        <q-td :props="props"><UsageProgress :percent="props.value" /></q-td>
      </template>
      <template #body-cell-memory="props">
        <q-td :props="props"><UsageProgress :percent="props.value" /></q-td>
      </template>
    </q-table>
  </q-card>
</template>

<style scoped>
.nodes-card {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

.nodes-card__header {
  padding: 10px 14px;
  flex: 0 0 auto;
}

.nodes-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

.nodes-card__table {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
}
</style>
