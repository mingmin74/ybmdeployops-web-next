<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { createVmFirewallAlias, deleteVmFirewallAlias, getVmFirewallAliases, updateVmFirewallAlias } from '@/api/firewall';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const props = defineProps<{ node: string; vmid: string; editable: boolean }>();
const loading = shallowRef(false);
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const filter = shallowRef('');
const visible = shallowRef(false);
const editing = shallowRef(false);
const originalName = shallowRef('');
const form = reactive<Record<string, string>>({ name: '', cidr: '', comment: '' });
const selectedAlias = computed(() => selected.value[0]);
const columns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  { name: 'cidr', label: 'CIDR', field: 'cidr', align: 'left', sortable: true },
  { name: 'ipversion', label: gettext('IP Version'), field: 'ipversion', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
]);

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const response = await getVmFirewallAliases(props.node, props.vmid);
    rows.value = response.data || [];
    selected.value = [];
  } finally { loading.value = false; }
}

function openDialog(edit = false) {
  if (!props.editable) return;
  editing.value = edit;
  const value = edit ? selectedAlias.value || {} : {};
  form.name = String(value.name || '');
  form.cidr = String(value.cidr || '');
  form.comment = String(value.comment || '');
  originalName.value = form.name;
  visible.value = true;
}

async function save() {
  if (!props.editable) return;
  loading.value = true;
  try {
    if (editing.value) await updateVmFirewallAlias(props.node, props.vmid, originalName.value, form);
    else await createVmFirewallAlias(props.node, props.vmid, form);
    visible.value = false;
    await reload();
  } finally { loading.value = false; }
}

function remove() {
  if (!props.editable) return;
  const name = String(selectedAlias.value?.name || '');
  if (!name) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', name), cancel: true, persistent: true }).onOk(() => { void deleteVmFirewallAlias(props.node, props.vmid, name).then(reload); });
}

watch(() => [props.node, props.vmid], () => { void reload(); }, { immediate: true });
</script>

<template>
  <q-table v-model:selected="selected" flat bordered square dense row-key="name" selection="single" :rows="rows" :columns="columns" :filter="filter" :loading="loading" :pagination="{ rowsPerPage: 0 }" hide-bottom class="u-compact-table">
    <template #top><q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!editable" :label="gettext('Add')" @click="openDialog()" /><q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" :disable="!editable || !selectedAlias" :label="gettext('Edit')" @click="openDialog(true)" /><q-btn no-caps outline size="12px" color="negative" class="u-button q-ml-sm" :disable="!editable || !selectedAlias" :label="gettext('Remove')" @click="remove" /><q-space /><q-input v-model="filter" dense borderless debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input><q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" :label="gettext('Refresh')" @click="reload" /></template>
  </q-table>
  <q-dialog v-model="visible" persistent><UWindow :title="gettext(editing ? 'Edit' : 'Add')" width="480px" :loading="loading"><div class="q-pa-md q-gutter-sm"><q-input v-model="form.name" dense square outlined :disable="editing" :label="gettext('Name')" /><q-input v-model="form.cidr" dense square outlined label="CIDR" /><q-input v-model="form.comment" dense square outlined :label="gettext('Comment')" /></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Save')" @click="save" /></template></UWindow></q-dialog>
</template>

<style scoped>.u-compact-table :deep(tbody td) { height: 40px; font-size: 12px; }</style>
