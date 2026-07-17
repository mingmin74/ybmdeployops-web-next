<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { getNodes, type PveNode } from '@/api/resources';
import UsageProgress from '@/components/UsageProgress.vue';
import { gettext } from '@/locale';
import { usagePercent } from '@/utils/format';

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    disableOffline?: boolean;
    width?: string;
  }>(),
  {
    disableOffline: false,
    width: '580px',
  },
);

const emit = defineEmits<{
  selected: [node: PveNode | undefined];
  loaded: [nodes: PveNode[]];
}>();

const popupRef = useTemplateRef<{ hide: () => void }>('popup');
const loading = shallowRef(false);
const filter = shallowRef('');
const nodes = shallowRef<PveNode[]>([]);

const selectedNode = computed(() => nodes.value.find((item) => item.node === model.value));
const displayNode = computed(() => selectedNode.value?.node || model.value || '');
const displayStatus = computed(() => nodeStatusText(selectedNode.value?.status));

const columns: QTableColumn<PveNode>[] = [
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
    field: (row) => nodeStatusText(row.status),
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
  return !props.disableOffline || row.status !== 'offline';
}

function selectRow(_: Event, row: PveNode) {
  if (!canSelect(row)) return;
  model.value = row.node;
  filter.value = '';
  popupRef.value?.hide();
}

function sortNodes(items: PveNode[]) {
  return [...items].sort((left, right) => left.node.localeCompare(right.node));
}

function ensureSelectedNode() {
  if (model.value && nodes.value.some((item) => item.node === model.value)) return;

  const candidate =
    nodes.value.find((item) => item.status === 'online') ||
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
  <div class="u-hidden-error node-select-table">
    <q-select
      v-model="model"
      square
      outlined
      dense
      map-options
      color="grey-8"
      options-dense
      class="u-dense node-select-table__field"
      :display-value="displayNode"
      :loading="loading"
      :options="[]"
    >
      <template #selected>
        <span class="text-primary text-weight-medium q-mr-xs">{{ displayNode }}</span>
        <span v-if="displayNode">: {{ displayStatus }}</span>
      </template>

      <q-popup-proxy ref="popup" transition-show="jump-down" transition-hide="jump-up">
        <div class="q-px-sm u-border-bottom bg-grey-2 text-grey">
          <q-input
            v-model="filter"
            borderless
            dense
            debounce="300"
            class="u-dense-m"
            input-class="bg-grey-2 text-grey q-py-none"
            :placeholder="gettext('Search')"
          >
            <template #append>
              <q-icon name="search" size="20px" class="text-grey" />
            </template>
          </q-input>
        </div>
        <q-scroll-area class="node-select-table__scroll" :style="{ width }">
          <q-table
            flat
            dense
            hide-bottom
            row-key="node"
            table-header-class="u-table-header"
            :rows="nodes"
            :columns="columns"
            :filter="filter"
            :pagination="{ rowsPerPage: 0 }"
            :loading="loading"
            :no-data-label="gettext('no record can be found')"
            @row-click="selectRow"
          >
            <template #body-cell="scope">
              <q-td
                :props="scope"
                class="text-grey-8"
                :class="{ 'node-select-table__disabled': !canSelect(scope.row) }"
              >
                <UsageProgress
                  v-if="isUsageColumn(scope.col.name)"
                  :percent="Number(scope.value)"
                />
                <q-badge
                  v-else-if="scope.col.name === 'status'"
                  :color="nodeStatusColor(scope.row.status)"
                  :label="scope.value"
                />
                <template v-else>{{ scope.value }}</template>
              </q-td>
            </template>

            <template #no-data="{ message }">
              <div class="full-width row flex-center text-accent q-gutter-sm">
                <span class="text-grey-6">{{ message }}</span>
              </div>
            </template>
          </q-table>
        </q-scroll-area>
      </q-popup-proxy>
    </q-select>
  </div>
</template>

<style scoped>
.node-select-table {
  min-width: 160px;
}

.node-select-table :deep(.node-select-table__field .q-field__control),
.node-select-table :deep(.node-select-table__field .q-field__marginal) {
  height: 28px !important;
  min-height: 28px !important;
}

.node-select-table :deep(.node-select-table__field .q-field__native),
.node-select-table :deep(.node-select-table__field .q-field__input) {
  min-height: 28px !important;
  line-height: 28px;
  padding-top: 0;
  padding-bottom: 0;
}

.node-select-table :deep(.node-select-table__field.q-field--outlined .q-field__control::before),
.node-select-table :deep(.node-select-table__field.q-field--outlined .q-field__control::after) {
  border: 1px solid #cccccc !important;
}

.node-select-table
  :deep(.node-select-table__field.q-field--outlined.q-field--highlighted .q-field__control::after) {
  transform: scale3d(1, 1, 1);
}

.node-select-table__scroll {
  min-height: 150px;
  height: 250px;
}

.node-select-table__disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
