<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog, Notify } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import StorageDownloadUrlDialog from '@/pages/storage/modules/storage/StorageDownloadUrlDialog.vue';
import StorageUploadDialog from '@/pages/storage/modules/storage/StorageUploadDialog.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import type { PveRecord } from '@/api/resources';
import { deleteStorageContent, getStorageContent, getVmResources } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatContentDate, formatContentSize, formatStorageContent, textValue } from '@/utils/pveFormat';

const props = defineProps<{
  node: string;
  storage: string;
  content: string;
  shared?: boolean;
  active?: boolean;
}>();

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const guests = shallowRef<Record<string, PveRecord>>({});
const uploadVisible = ref(false);
const downloadVisible = ref(false);
const taskVisible = ref(false);
const taskUpid = ref('');

const isBackup = computed(() => props.content === 'backup');
const isImage = computed(() => props.content === 'images' || props.content === 'rootdir');
const canRemove = computed(() => {
  const row = selected.value[0];
  return !!row && !(isBackup.value && Boolean(row.protected));
});
const supportsTransfer = computed(() => ['iso', 'vztmpl', 'import'].includes(props.content));

const columns = computed<QTableColumn<PveRecord>[]>(() => [
  {
    name: 'volid',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => formatStorageContent(row.volid),
    sortable: true,
    sort: (left, right) => textValue(left).localeCompare(textValue(right), undefined, { numeric: true }),
  },
  {
    name: 'date',
    label: gettext('Date'),
    align: 'left',
    field: formatContentDate,
    sortable: true,
    sort: (left, right) => textValue(left).localeCompare(textValue(right), undefined, { numeric: true }),
  },
  {
    name: 'format',
    label: gettext('Format'),
    align: 'left',
    field: (row) => row.format || '-',
    sortable: true,
  },
  {
    name: 'size',
    label: gettext('Size'),
    align: 'left',
    field: formatContentSize,
    sortable: true,
  },
]);

async function refreshData() {
  if (!props.node || !props.storage || !props.content) {
    rows.value = [];
    return;
  }

  loading.value = true;
  try {
    const contentResponse = await getStorageContent(props.node, props.storage, props.content);
    rows.value = contentResponse.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadGuests() {
  if (!isImage.value) return;
  const response = await getVmResources();
  guests.value = Object.fromEntries((response.data || [])
    .filter((item) => item.vmid !== undefined)
    .map((item) => [textValue(item.vmid), item]));
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = selected.value[0] === row ? [] : [row];
}

function removeSelected() {
  const row = selected.value[0];
  if (!row || !canRemove.value) return;
  const volid = textValue(row.volid);
  const guest = guests.value[textValue(row.vmid)];
  if (isImage.value && guest && (props.shared || textValue(guest.node) === props.node)) {
    Notify.create({ type: 'negative', message: gettext("Cannot remove image, a guest with VMID '%s' exists!").replace('%s', textValue(row.vmid)) });
    return;
  }

  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', volid),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteStorageContent(props.node, props.storage, volid)
      .then(() => refreshData())
      .finally(() => {
        loading.value = false;
      });
  });
}

watch(() => props.active, (active) => {
  if (active) {
    void refreshData();
    void loadGuests();
  }
}, { immediate: true });
</script>

<template>
  <div>
    <q-table
      flat
      row-key="volid"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :filter="filter"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      @row-click="rowClick"
      @update:selected="selected = [...$event]"
    >
      <template #top>
        <div class="row q-gutter-sm">
          <q-btn v-if="supportsTransfer" no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Upload')" @click="uploadVisible = true" />
          <q-btn v-if="supportsTransfer" no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Download from URL')" @click="downloadVisible = true" />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="canRemove ? 'red' : 'grey'"
            :disable="!canRemove"
            :label="gettext('Remove')"
            @click="removeSelected"
          />
        </div>
        <q-space />
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')">
          <template #append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>
    </q-table>
    <StorageUploadDialog v-if="supportsTransfer" v-model="uploadVisible" :node="node" :storage="storage" :content="content" @done="refreshData" />
    <StorageDownloadUrlDialog v-if="supportsTransfer" v-model="downloadVisible" :node="node" :storage="storage" :content="content" @task="(upid) => { taskUpid = upid; taskVisible = !!upid }" @done="refreshData" />
    <TaskOutputDialog v-model="taskVisible" :node="node" :upid="taskUpid" :title="gettext('Download')" />
  </div>
</template>
