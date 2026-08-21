<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

export interface NodeDiskTableAction {
  name: string;
  label: string;
  color?: string;
  requiresSelection?: boolean;
}

const props = defineProps<{
  columns: QTableColumn<PveRecord>[];
  loadRows: (node: string) => Promise<PveRecord[]>;
  rowKey: string;
  visibleColumns?: string[];
  embedded?: boolean;
  node?: string | undefined;
  actions?: NodeDiskTableAction[];
  tree?: boolean;
}>();
const emit = defineEmits<{ action: [name: string, row?: PveRecord]; selection: [row?: PveRecord]; rowDblclick: [row: PveRecord] }>();

const loading = ref(false);
const filter = ref('');
const selectedNode = ref(props.node || '');
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const expanded = shallowRef<Set<string>>(new Set());
const selectedRow = computed(() => selected.value[0]);
const displayRows = computed(() => {
  if (!props.tree) return rows.value;
  const result: PveRecord[] = [];
  const append = (items: PveRecord[], level: number) => items.forEach((item) => {
    const key = String(item[props.rowKey]);
    const children = Array.isArray(item.children) ? item.children as PveRecord[] : [];
    result.push({ ...item, __treeLevel: level, __treeChildren: children.length });
    if (children.length && expanded.value.has(key)) append(children, level + 1);
  });
  append(rows.value, 0);
  return result;
});

async function reload() {
  if (!selectedNode.value) {
    rows.value = [];
    return;
  }

  loading.value = true;
  try {
    rows.value = await props.loadRows(selectedNode.value);
    expanded.value = new Set(rows.value.map((item) => String(item[props.rowKey])));
    selected.value = [];
    emit('selection');
  } finally {
    loading.value = false;
  }
}

function setSelection(value: readonly PveRecord[]) {
  selected.value = [...value];
  emit('selection', selectedRow.value);
}

function rowClick(_: Event, row: PveRecord) {
  setSelection(selected.value[0] === row ? [] : [row]);
}

function rowDblclick(_: Event, row: PveRecord) {
  setSelection([row]);
  emit('rowDblclick', row);
}

function toggleTree(row: PveRecord) {
  const key = String(row[props.rowKey]);
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  expanded.value = next;
}

defineExpose({ reload });

watch(
  () => props.node,
  (node) => {
    if (node !== undefined) selectedNode.value = node;
  },
  { immediate: true },
);

watch(
  selectedNode,
  () => {
    void reload();
  },
  { immediate: true },
);
</script>

<template>
  <q-card
    class="no-border-radius no-shadow"
    :class="props.embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'"
  >
    <q-card-section :class="props.embedded ? 'q-pa-none' : undefined">
      <q-table
        flat
        :row-key="rowKey"
        table-header-class="u-table-header"
        :rows="displayRows"
        :columns="columns"
        :visible-columns="visibleColumns"
        :filter="filter"
        :rows-per-page-options="[0]"
        :pagination="{ page: 1, rowsPerPage: 0 }"
        :loading="loading"
        selection="single"
        :selected="selected"
        :no-data-label="gettext('no record can be found')"
        @row-click="rowClick"
        @row-dblclick="rowDblclick"
        @update:selected="setSelection"
      >
        <template #top>
          <div class="row q-gutter-sm items-center">
            <NodeSelectTable v-if="!props.node" v-model="selectedNode" />
            <q-btn
              v-for="action in props.actions"
              :key="action.name"
              no-caps
              outline
              size="12px"
              :color="action.color || 'primary'"
              class="u-button"
              :disable="action.requiresSelection && !selectedRow"
              :label="action.label"
              @click="emit('action', action.name, selectedRow)"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="reload"
            />
          </div>
          <q-space />
          <q-input
            v-model="filter"
            borderless
            dense
            debounce="300"
            :placeholder="gettext('Search')"
          >
            <template #append>
              <q-icon name="search" />
            </template>
          </q-input>
        </template>

        <template #no-data="{ message }">
          <div class="full-width row flex-center text-accent q-gutter-sm">
            <span class="text-grey-6">{{ message }}</span>
          </div>
        </template>
        <template v-if="props.tree" #body-cell-name="scope">
          <q-td :props="scope">
            <div class="row items-center no-wrap" :style="{ paddingLeft: `${Number(scope.row.__treeLevel || 0) * 18}px` }">
              <q-btn v-if="Number(scope.row.__treeChildren || 0)" flat dense round size="sm" :icon="expanded.has(String(scope.row[rowKey])) ? 'expand_more' : 'chevron_right'" @click.stop="toggleTree(scope.row)" />
              <span v-else class="node-disk-tree-spacer" />
              {{ scope.value }}
            </div>
          </q-td>
        </template>
        <template #body-cell-usage="scope"><slot name="body-cell-usage" v-bind="scope"><q-td :props="scope">{{ scope.value }}</q-td></slot></template>
      </q-table>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.node-disk-tree-spacer { width: 28px; }
</style>
