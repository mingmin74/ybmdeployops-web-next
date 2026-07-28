<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { deleteStorageContent, getStorageContent, getStorageStatus } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatBytes, formatContent, textValue, usedPercent } from '@/utils/pveFormat';

const props = defineProps<{
  node: string;
  storage: string;
  content: string;
}>();

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const status = shallowRef<PveRecord>({});
const rows = shallowRef<PveRecord[]>([]);

const usage = computed(() => usedPercent(Number(status.value.used), Number(status.value.total)));

const columns = computed<QTableColumn<PveRecord>[]>(() => [
  {
    name: 'volid',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.volid || '-',
    sortable: true,
  },
  {
    name: 'format',
    label: gettext('Format'),
    align: 'left',
    field: (row) => row.format || '-',
    sortable: true,
  },
  {
    name: 'content',
    label: gettext('Content'),
    align: 'left',
    field: (row) => formatContent(row.content),
    sortable: true,
  },
  {
    name: 'vmid',
    label: gettext('VMID'),
    align: 'left',
    field: (row) => row.vmid || '-',
    sortable: true,
  },
  {
    name: 'size',
    label: gettext('Size'),
    align: 'left',
    field: (row) => formatBytes(row.size as number),
    sortable: true,
  },
  {
    name: 'used',
    label: gettext('Used'),
    align: 'left',
    field: (row) => formatBytes(row.used as number),
    sortable: true,
  },
]);

async function refreshData() {
  if (!props.node || !props.storage || !props.content) {
    status.value = {};
    rows.value = [];
    return;
  }

  loading.value = true;
  try {
    const [statusResponse, contentResponse] = await Promise.all([
      getStorageStatus(props.node, props.storage),
      getStorageContent(props.node, props.storage, props.content),
    ]);
    status.value = statusResponse.data || {};
    rows.value = contentResponse.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = selected.value[0] === row ? [] : [row];
}

function removeSelected() {
  const row = selected.value[0];
  if (!row) return;
  const volid = textValue(row.volid);

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

watch(() => [props.node, props.storage, props.content], refreshData, { immediate: true });
</script>

<template>
  <div>
    <div class="bg-grey-3 q-py-md q-px-md text-grey-10">
      <div class="row q-ma-sm">
        <div class="col">
          {{ gettext('Storage') }}: <span class="text-grey-8">{{ storage || '-' }}</span>
        </div>
        <div class="col">
          {{ gettext('Type') }}: <span class="text-grey-8">{{ status.type || '-' }}</span>
        </div>
        <div class="col">
          {{ gettext('Content') }}:
          <span class="text-grey-8">{{ formatContent(status.content) || '-' }}</span>
        </div>
      </div>
      <div class="row q-ma-sm">
        <div class="col">
          {{ gettext('Total Size') }}:
          <span class="text-grey-8">{{ formatBytes(status.total as number) }}</span>
        </div>
        <div class="col">
          {{ gettext('Avail Size') }}:
          <span class="text-grey-8">{{ formatBytes(status.avail as number) }}</span>
        </div>
        <div class="col">
          {{ gettext('Used Size') }}:
          <span class="text-grey-8">{{ formatBytes(status.used as number) }}</span>
        </div>
      </div>
    </div>
    <div class="q-my-md">
      <UsageProgress :percent="usage" />
    </div>
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
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="refreshData"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selected.length !== 1 ? 'grey' : 'red'"
            :disable="selected.length !== 1"
            :label="gettext('Delete')"
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
  </div>
</template>
