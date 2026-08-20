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
}>();
const emit = defineEmits<{ action: [name: string, row?: PveRecord]; selection: [row?: PveRecord] }>();

const loading = ref(false);
const filter = ref('');
const selectedNode = ref(props.node || '');
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const selectedRow = computed(() => selected.value[0]);

async function reload() {
  if (!selectedNode.value) {
    rows.value = [];
    return;
  }

  loading.value = true;
  try {
    rows.value = await props.loadRows(selectedNode.value);
  } finally {
    loading.value = false;
  }
}

function setSelection(value: PveRecord[]) {
  selected.value = [...value];
  emit('selection', selectedRow.value);
}

function rowClick(_: Event, row: PveRecord) {
  setSelection(selected.value[0] === row ? [] : [row]);
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
        :rows="rows"
        :columns="columns"
        :visible-columns="visibleColumns"
        :filter="filter"
        :rows-per-page-options="[10]"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :loading="loading"
        selection="single"
        :selected="selected"
        :no-data-label="gettext('no record can be found')"
      >
        @row-click="rowClick"
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
      </q-table>
    </q-card-section>
  </q-card>
</template>
