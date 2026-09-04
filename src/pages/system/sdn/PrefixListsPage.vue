<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import {
  deleteSdnPrefixList,
  deleteSdnPrefixListEntry,
  getSdnPrefixListEntries,
  getSdnPrefixLists,
} from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import PrefixListEditor from './PrefixListEditor.vue';
import PrefixListEntryEditor from './PrefixListEntryEditor.vue';

const loading = ref(false);
const entriesLoading = ref(false);
const selectedPrefixList = ref<PveRecord[]>([]);
const selectedEntry = ref<PveRecord[]>([]);
const prefixLists = shallowRef<PveRecord[]>([]);
const entries = shallowRef<PveRecord[]>([]);

const editorVisible = ref(false);
const editing = shallowRef<PveRecord>();

const entryEditorVisible = ref(false);
const editingEntry = shallowRef<PveRecord>();

function plValue(row: PveRecord, key: string) {
  return ((row.pending as PveRecord) || {})[key] ?? row[key];
}

function entryValue(row: PveRecord, key: string) {
  return row[key];
}

const prefixListColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => textValue(plValue(row, 'id')) || '-',
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('State'),
    align: 'left',
    field: (row) => textValue(plValue(row, 'state')) || '-',
    sortable: true,
  },
];

const entryColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'seq',
    required: true,
    label: gettext('Sequence Nr.'),
    align: 'left',
    field: (row) => textValue(entryValue(row, 'seq')) || '-',
    sortable: true,
  },
  {
    name: 'action',
    label: gettext('Action'),
    align: 'left',
    field: (row) => textValue(entryValue(row, 'action')) || '-',
    sortable: true,
  },
  {
    name: 'prefix',
    label: gettext('Prefix'),
    align: 'left',
    field: (row) => textValue(entryValue(row, 'prefix')) || '-',
    sortable: true,
  },
  {
    name: 'le',
    label: gettext('Prefix <='),
    align: 'left',
    field: (row) => {
      const v = entryValue(row, 'le');
      return v !== undefined && v !== null ? textValue(v) : '-';
    },
    sortable: true,
  },
  {
    name: 'ge',
    label: gettext('Prefix >='),
    align: 'left',
    field: (row) => {
      const v = entryValue(row, 'ge');
      return v !== undefined && v !== null ? textValue(v) : '-';
    },
    sortable: true,
  },
];

const hasSelectedPrefixList = computed(() => selectedPrefixList.value.length === 1);

const selectedPrefixListId = computed(() =>
  selectedPrefixList.value[0] ? textValue(plValue(selectedPrefixList.value[0], 'id')) : undefined,
);

const entryEmptyLabel = computed(() =>
  hasSelectedPrefixList.value
    ? gettext('Prefix list has no entries configured.')
    : gettext('No prefix list selected'),
);

async function reloadPrefixLists() {
  loading.value = true;
  try {
    const response = await getSdnPrefixLists();
    prefixLists.value = response.data || [];
    selectedEntry.value = [];
    entries.value = [];
    if (selectedPrefixListId.value) {
      const stillExists = prefixLists.value.some(
        (row) => textValue(plValue(row, 'id')) === selectedPrefixListId.value,
      );
      if (!stillExists) {
        selectedPrefixList.value = [];
      } else {
        void reloadEntries();
      }
    }
  } finally {
    loading.value = false;
  }
}

async function reloadEntries() {
  const id = selectedPrefixListId.value;
  if (!id) {
    entries.value = [];
    return;
  }
  entriesLoading.value = true;
  try {
    const response = await getSdnPrefixListEntries(id);
    entries.value = (response.data || []).sort(
      (a, b) => Number(entryValue(a, 'seq')) - Number(entryValue(b, 'seq')),
    );
    selectedEntry.value = [];
  } finally {
    entriesLoading.value = false;
  }
}

function addPrefixList() {
  editing.value = undefined;
  editorVisible.value = true;
}

function removePrefixList() {
  const id = selectedPrefixListId.value;
  if (!id) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure you want to remove prefix list %s?').replace('%s', id),
    cancel: true,
    persistent: true,
  }).onOk(() => void deleteSdnPrefixList(id).then(reloadPrefixLists));
}

function addEntry() {
  if (!selectedPrefixListId.value) return;
  editingEntry.value = undefined;
  entryEditorVisible.value = true;
}

function editEntry(row?: PveRecord) {
  const target = row ?? selectedEntry.value[0];
  if (!target) return;
  selectedEntry.value = [target];
  editingEntry.value = target;
  entryEditorVisible.value = true;
}

function removeEntry() {
  const id = selectedPrefixListId.value;
  const row = selectedEntry.value[0];
  const seq = row ? entryValue(row, 'seq') : undefined;
  if (!id || seq === undefined || seq === null) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure you want to remove entry with sequence %s?').replace(
      '%s',
      textValue(seq),
    ),
    cancel: true,
    persistent: true,
  }).onOk(() => void deleteSdnPrefixListEntry(id, textValue(seq)).then(reloadEntries));
}

watch(selectedPrefixList, reloadEntries);
onMounted(() => void reloadPrefixLists());
</script>

<template>
  <div class="sdn-page row q-col-gutter-md">
    <div class="col-6">
      <q-table
        flat
        row-key="id"
        table-header-class="u-table-header"
        selection="single"
        :rows="prefixLists"
        :columns="prefixListColumns"
        :selected="selectedPrefixList"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        :no-data-label="gettext('No prefix list configured')"
        @update:selected="selectedPrefixList = [...$event]"
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
              @click="addPrefixList"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="hasSelectedPrefixList ? 'red' : 'grey'"
              class="u-button"
              :disable="!hasSelectedPrefixList"
              :label="gettext('Remove')"
              @click="removePrefixList"
            />
            <q-space />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Reload')"
              @click="reloadPrefixLists"
            />
          </div>
        </template>
        <template #body-cell-state="scope">
          <q-td :props="scope">
            <q-badge
              v-if="scope.value && scope.value !== '-'"
              :color="scope.value === 'deleted' ? 'negative' : 'warning'"
              :label="scope.value"
            />
            <span v-else>{{ scope.value }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
    <div class="col-6">
      <q-table
        flat
        row-key="seq"
        table-header-class="u-table-header"
        selection="single"
        :rows="entries"
        :columns="entryColumns"
        :selected="selectedEntry"
        :loading="entriesLoading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        :no-data-label="entryEmptyLabel"
        @row-dblclick="(_, row) => editEntry(row)"
        @update:selected="selectedEntry = [...$event]"
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!hasSelectedPrefixList"
              :label="gettext('Add')"
              @click="addEntry"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="selectedEntry.length !== 1"
              :label="gettext('Edit')"
              @click="editEntry()"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="selectedEntry.length !== 1 ? 'grey' : 'red'"
              class="u-button"
              :disable="selectedEntry.length !== 1"
              :label="gettext('Remove')"
              @click="removeEntry"
            />
          </div>
        </template>
      </q-table>
    </div>
    <PrefixListEditor
      v-model="editorVisible"
      :prefix-list-id="editing ? textValue(plValue(editing, 'id')) : undefined"
      @saved="reloadPrefixLists"
    />
    <PrefixListEntryEditor
      v-model="entryEditorVisible"
      :prefix-list-id="selectedPrefixListId || ''"
      :seq="
        editingEntry ? (entryValue(editingEntry, 'seq') as string | number | undefined) : undefined
      "
      :entry-data="editingEntry"
      @saved="reloadEntries"
    />
  </div>
</template>

<style scoped>
.sdn-page {
  margin: 16px;
  background: #fff;
}
</style>
