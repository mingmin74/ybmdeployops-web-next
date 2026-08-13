<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import StorageDownloadUrlDialog from './StorageDownloadUrlDialog.vue';
import StorageUploadDialog from './StorageUploadDialog.vue';
import type { PveRecord } from '@/api/resources';
import { deleteStorageContent, downloadContainerTemplate, getContainerTemplates, getStorageContent, pullOciRegistryImage, queryOciRepositoryTags } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatContentDate, formatContentSize, formatStorageContent, textValue } from '@/utils/pveFormat';
import { Dialog } from 'quasar';

const props = defineProps<{ node: string; storage: string; active?: boolean }>();
const loading = ref(false);
const filter = ref('');
const rows = shallowRef<PveRecord[]>([]);
const selected = ref<PveRecord[]>([]);
const templates = shallowRef<PveRecord[]>([]);
const templateFilter = ref('');
const selectedTemplate = ref<PveRecord>();
const templatesVisible = ref(false);
const ociVisible = ref(false);
const taskVisible = ref(false);
const taskUpid = ref('');
const uploadVisible = ref(false);
const downloadVisible = ref(false);
const oci = reactive({ reference: '', tag: '', filename: '' });
const ociTags = shallowRef<string[]>([]);
const selectedRow = computed(() => selected.value[0]);
const templateColumns: QTableColumn<PveRecord>[] = [
  { name: 'type', label: gettext('Type'), align: 'left', field: 'type', sortable: true },
  { name: 'package', label: gettext('Name'), align: 'left', field: 'package', sortable: true },
  { name: 'version', label: gettext('Version'), align: 'left', field: 'version', sortable: true },
  { name: 'architecture', label: gettext('Architecture'), align: 'left', field: (row) => textValue(row.architecture, gettext('unknown')), sortable: true },
  { name: 'headline', label: gettext('Description'), align: 'left', field: 'headline', sortable: true },
];
const contentColumns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'name', label: gettext('Name'), align: 'left', field: (row) => formatStorageContent(row.volid), sortable: true, sort: (a, b) => textValue(a).localeCompare(textValue(b), undefined, { numeric: true }) },
  { name: 'date', label: gettext('Date'), align: 'left', field: formatContentDate, sortable: true },
  { name: 'format', label: gettext('Format'), align: 'left', field: (row) => textValue(row.format, '-'), sortable: true },
  { name: 'size', label: gettext('Size'), align: 'left', field: formatContentSize, sortable: true },
]);
async function reload() {
  if (!props.node || !props.storage) { rows.value = []; return; }
  loading.value = true;
  try { rows.value = (await getStorageContent(props.node, props.storage, 'vztmpl')).data || []; selected.value = []; }
  finally { loading.value = false; }
}
async function openTemplates() {
  loading.value = true;
  try { templates.value = (await getContainerTemplates(props.node)).data || []; selectedTemplate.value = undefined; templatesVisible.value = true; }
  finally { loading.value = false; }
}
function templateRowClick(_: Event, row: PveRecord) { selectedTemplate.value = row; }
async function downloadTemplate() {
  const template = textValue(selectedTemplate.value?.template);
  if (!template) return;
  loading.value = true;
  try { taskUpid.value = String((await downloadContainerTemplate(props.node, props.storage, template)).data || ''); templatesVisible.value = false; taskVisible.value = !!taskUpid.value; await reload(); }
  finally { loading.value = false; }
}
async function queryTags() {
  if (!oci.reference.trim()) return;
  loading.value = true;
  try { ociTags.value = (await queryOciRepositoryTags(props.node, oci.reference.trim())).data || []; }
  finally { loading.value = false; }
}
async function pullOci() {
  if (!oci.reference.trim() || !oci.tag.trim()) return;
  loading.value = true;
  try { taskUpid.value = String((await pullOciRegistryImage(props.node, props.storage, { reference: `${oci.reference.trim()}:${oci.tag.trim()}`, ...(oci.filename.trim() ? { filename: oci.filename.trim() } : {}) })).data || ''); ociVisible.value = false; taskVisible.value = !!taskUpid.value; await reload(); }
  finally { loading.value = false; }
}
function remove() {
  if (!selectedRow.value) return;
  const volid = textValue(selectedRow.value.volid);
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', volid), cancel: true, persistent: true }).onOk(() => void deleteStorageContent(props.node, props.storage, volid).then(reload));
}
watch(() => props.active, (active) => { if (active) void reload(); }, { immediate: true });
</script>

<template>
  <q-table flat row-key="volid" table-header-class="u-table-header" selection="single" :rows="rows" :columns="contentColumns" :selected="selected" :filter="filter" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :loading="loading" :no-data-label="gettext('no record can be found')" @row-click="(_, row) => selected = selected[0] === row ? [] : [row]" @update:selected="selected = [...$event]">
    <template #top><div class="row q-gutter-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Templates')" @click="openTemplates" /><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Pull from OCI Registry')" @click="ociVisible = true" /><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Upload')" @click="uploadVisible = true" /><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Download from URL')" @click="downloadVisible = true" /><q-btn no-caps outline size="12px" class="u-button" :color="selectedRow ? 'red' : 'grey'" :disable="!selectedRow" :label="gettext('Remove')" @click="remove" /></div><q-space /><q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input></template>
  </q-table>
  <q-dialog v-model="templatesVisible" persistent><UWindow :title="gettext('Templates')" width="900px" :loading="loading"><div class="q-pa-md"><q-input v-model="templateFilter" outlined dense class="q-mb-sm" :placeholder="gettext('Search')" /><q-table flat dense row-key="template" :rows="templates" :columns="templateColumns" :filter="templateFilter" :pagination="{ rowsPerPage: 10 }" @row-click="templateRowClick" /></div><template #foot><q-btn v-close-popup no-caps flat :label="gettext('Cancel')" /><q-btn no-caps flat color="primary" :disable="!selectedTemplate" :label="gettext('Download')" @click="downloadTemplate" /></template></UWindow></q-dialog>
  <q-dialog v-model="ociVisible" persistent><UWindow :title="gettext('Pull from OCI Registry')" width="450px" :loading="loading"><div class="q-pa-md q-gutter-md"><div class="row no-wrap q-gutter-sm"><q-input v-model="oci.reference" dense outlined class="col" :label="gettext('Reference')" /><q-btn no-caps outline :label="gettext('Query Tags')" @click="queryTags" /></div><q-select v-model="oci.tag" dense outlined use-input input-debounce="0" :options="ociTags" :label="gettext('Tag')" /><q-input v-model="oci.filename" dense outlined :label="gettext('File name')" /></div><template #foot><q-btn v-close-popup no-caps flat :label="gettext('Cancel')" /><q-btn no-caps flat color="primary" :disable="!oci.reference.trim() || !oci.tag.trim()" :label="gettext('Download')" @click="pullOci" /></template></UWindow></q-dialog>
  <TaskOutputDialog v-model="taskVisible" :node="node" :upid="taskUpid" :title="gettext('Download')" />
  <StorageUploadDialog v-model="uploadVisible" :node="node" :storage="storage" content="vztmpl" @done="reload" />
  <StorageDownloadUrlDialog v-model="downloadVisible" :node="node" :storage="storage" content="vztmpl" @task="(upid) => { taskUpid = upid; taskVisible = !!upid }" @done="reload" />
</template>
