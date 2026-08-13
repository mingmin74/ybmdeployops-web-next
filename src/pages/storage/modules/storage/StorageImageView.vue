<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog, Notify } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import type { PveRecord } from '@/api/resources';
import { deleteStorageContent, getStorageContent, getVmResources } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatContentDate, formatContentSize, formatStorageContent, textValue } from '@/utils/pveFormat';

const props = defineProps<{ node: string; storage: string; content: 'images' | 'rootdir'; shared?: boolean; active?: boolean }>();
const router = useRouter();
const loading = ref(false);
const filter = ref('');
const rows = shallowRef<PveRecord[]>([]);
const selected = ref<PveRecord[]>([]);
const guests = shallowRef<Record<string, PveRecord>>({});
const taskVisible = ref(false);
const taskUpid = ref('');
const selectedRow = computed(() => selected.value[0]);
const selectedGuest = computed(() => guests.value[textValue(selectedRow.value?.vmid)]);
const columns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'name', label: gettext('Name'), align: 'left', field: (row) => formatStorageContent(row.volid), sortable: true, sort: (a, b) => textValue(a).localeCompare(textValue(b), undefined, { numeric: true }) },
  { name: 'guest', label: gettext('Guest'), align: 'left', field: (row) => guestLabel(row), sortable: true },
  { name: 'date', label: gettext('Date'), align: 'left', field: formatContentDate, sortable: true },
  { name: 'format', label: gettext('Format'), align: 'left', field: (row) => textValue(row.format, '-'), sortable: true },
  { name: 'size', label: gettext('Size'), align: 'left', field: formatContentSize, sortable: true },
]);
function guestLabel(row: PveRecord) {
  const vmid = textValue(row.vmid);
  const guest = guests.value[vmid];
  return vmid ? `${vmid}${textValue(guest?.name) ? ` (${textValue(guest?.name)})` : ''}` : '-';
}
async function reload() {
  if (!props.node || !props.storage) { rows.value = []; return; }
  loading.value = true;
  try {
    const [content, resources] = await Promise.all([getStorageContent(props.node, props.storage, props.content), getVmResources()]);
    rows.value = content.data || [];
    guests.value = Object.fromEntries((resources.data || []).filter((item) => item.vmid !== undefined).map((item) => [textValue(item.vmid), item]));
    selected.value = [];
  } finally { loading.value = false; }
}
function rowClick(_: Event, row: PveRecord) { selected.value = selected.value[0] === row ? [] : [row]; }
function goToGuest() {
  const guest = selectedGuest.value;
  if (!guest) return;
  void router.push({ name: guest.type === 'qemu' ? 'computer-vm-detail' : 'computer-ct-container-detail', params: { node: textValue(guest.node), vmid: textValue(guest.vmid) }, query: { tab: guest.type === 'qemu' ? 'hardware' : 'resources', volid: textValue(selectedRow.value?.volid) } });
}
function remove() {
  const row = selectedRow.value;
  if (!row) return;
  const guest = selectedGuest.value;
  if (guest && (props.shared || textValue(guest.node) === props.node)) {
    Notify.create({ type: 'negative', message: `${gettext("Cannot remove image, a guest with VMID '%s' exists!").replace('%s', textValue(row.vmid))} ${gettext("You can delete the image from the guest's hardware pane")}` });
    return;
  }
  Dialog.create({ title: gettext("Destroy '%s'").replace('%s', textValue(row.volid)), message: gettext('This action cannot be undone.'), cancel: true, persistent: true }).onOk(() => {
    loading.value = true;
    void deleteStorageContent(props.node, props.storage, textValue(row.volid)).then((response) => {
      taskUpid.value = String(response.data || '');
      taskVisible.value = !!taskUpid.value;
      return reload();
    }).finally(() => { loading.value = false; });
  });
}
watch(() => props.active, (active) => { if (active) void reload(); }, { immediate: true });
</script>

<template>
  <q-table flat row-key="volid" table-header-class="u-table-header" selection="single" :rows="rows" :columns="columns" :selected="selected" :filter="filter" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :loading="loading" :no-data-label="gettext('no record can be found')" @row-click="rowClick" @update:selected="selected = [...$event]">
    <template #top>
      <div class="row q-gutter-sm"><q-btn no-caps outline size="12px" class="u-button" :disable="!selectedGuest" :label="gettext('Go to Guest')" @click="goToGuest" /><q-btn no-caps outline size="12px" class="u-button" :color="selectedRow ? 'red' : 'grey'" :disable="!selectedRow" :label="gettext('Remove')" @click="remove" /></div>
      <q-space /><q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input>
    </template>
  </q-table>
  <TaskOutputDialog v-model="taskVisible" :node="node" :upid="taskUpid" :title="gettext('Destroy')" />
</template>
