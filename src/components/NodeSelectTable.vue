<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { getNodes, type PveNode, type PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import { gettext } from '@/locale';
import { usagePercent } from '@/utils/format';

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    disableOffline?: boolean;
    width?: string;
    label?: string;
    fieldStyle?: 'outlined' | 'standard';
    error?: boolean;
    errorMessage?: string;
    autoSelect?: boolean;
  }>(),
  {
    disableOffline: false,
    width: '580px',
    label: '',
    fieldStyle: 'outlined',
    error: false,
    errorMessage: '',
    autoSelect: true,
  }
);

const emit = defineEmits<{
  selected: [node: PveNode | undefined];
  loaded: [nodes: PveNode[]];
}>();

const loading = shallowRef(false);
const nodes = shallowRef<PveNode[]>([]);

const selectedNode = computed(() => nodes.value.find((item) => item.node === model.value));
const displayNode = computed(() => selectedNode.value?.node || model.value || '');
const displayStatus = computed(() => nodeStatusText(selectedNode.value?.status));

const columns: QTableColumn<PveRecord>[] = [
  { name: 'node', label: gettext('Name'), field: 'node', align: 'left', sortable: true },
  {
    name: 'diskUsage',
    label: gettext('Disk Usage'),
    field: (row) => usagePercent(row.disk, row.maxdisk),
    align: 'left',
    sortable: true,
  },
  {
    name: 'memoryUsage',
    label: gettext('Memory Usage'),
    field: (row) => usagePercent(row.mem, row.maxmem),
    align: 'left',
    sortable: true,
  },
  {
    name: 'cpuUsage',
    label: gettext('CPU Usage'),
    field: (row) => (Number.isFinite(Number(row.cpu)) ? Number(row.cpu) * 100 : 0),
    align: 'left',
    sortable: true,
  },
  {
    name: 'status',
    label: gettext('Status'),
    field: (row) => nodeStatusText(row.status as string | undefined),
    align: 'left',
  },
];

function nodeStatusText(status?: string) {
  const normalized = status || 'unknown';
  const statusMap: Record<string, string> = {
    online: gettext('Online'),
    offline: gettext('Offline'),
    unknown: gettext('Unknown'),
  };

  return statusMap[normalized] || gettext(normalized);
}

function nodeStatusColor(status?: string) {
  if (status === 'online') return 'green';
  if (status === 'offline') return 'red';
  return 'grey';
}

function isUsageColumn(name: string) {
  return name === 'diskUsage' || name === 'memoryUsage' || name === 'cpuUsage';
}

function canSelect(row: PveNode) {
  return !props.disableOffline || row.status === 'online';
}

function sortNodes(items: PveNode[]) {
  return [...items].sort((left, right) => left.node.localeCompare(right.node));
}

function ensureSelectedNode() {
  const selected = nodes.value.find((item) => item.node === model.value);
  if (selected && canSelect(selected)) return;
  if (model.value) model.value = '';
  if (!props.autoSelect) return;

  const candidate =
    (props.disableOffline ? nodes.value.find((item) => item.status === 'online') : undefined) ||
    nodes.value.find((item) => canSelect(item)) ||
    nodes.value[0];

  model.value = candidate?.node || '';
}

async function loadNodes() {
  loading.value = true;
  try {
    const response = await getNodes();
    nodes.value = sortNodes(response.data || []);
    ensureSelectedNode();
    emit('loaded', nodes.value);
  } finally {
    loading.value = false;
  }
}

watch(selectedNode, (node) => {
  emit('selected', node);
});

onMounted(() => {
  void loadNodes();
});
</script>

<template>
  <SelectTable
    v-model="model"
    row-key="node"
    class="node-select-table"
    :rows="nodes"
    :columns="columns"
    :display-value="displayNode"
    :loading="loading"
    :width="width"
    :label="label"
    :field-style="fieldStyle"
    :error="error"
    :error-message="errorMessage"
    :get-row-value="(row) => String(row.node || '')"
    :can-select="(row) => canSelect(row as PveNode)"
  >
    <template #selected>
      <span class="q-mr-xs">{{ displayNode }}</span>
      <span v-if="displayNode">: {{ displayStatus }}</span>
    </template>

    <template #body-cell="scope">
      <UsageProgress
        v-if="isUsageColumn(scope.col.name)"
        :percent="Number(scope.value)"
      />
      <q-badge
        v-else-if="scope.col.name === 'status'"
        :color="nodeStatusColor(scope.row.status as string | undefined)"
        :label="scope.value"
      />
      <template v-else>{{ scope.value }}</template>
    </template>
  </SelectTable>
</template>

<style scoped>
.node-select-table {
  min-width: 160px;
}
</style>
