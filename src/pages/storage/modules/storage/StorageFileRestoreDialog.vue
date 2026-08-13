<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { listStorageBackupFiles } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatBytes, textValue, timestampToTime } from '@/utils/pveFormat';
const model = defineModel<boolean>({ required: true });
const props = defineProps<{ storage: string; volume: string; vmArchive?: boolean }>();
const loading = ref(false); const rows = shallowRef<PveRecord[]>([]); const selected = ref<PveRecord[]>([]); const currentPath = ref('');
const columns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'text', label: gettext('Name'), align: 'left', field: (row) => textValue(row.text, '-'), sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => textValue(row.type, '-'), sortable: true },
  { name: 'size', label: gettext('Size'), align: 'left', field: (row) => formatBytes(row.size as number), sortable: true },
  { name: 'mtime', label: gettext('Date'), align: 'left', field: (row) => row.mtime ? timestampToTime(Number(row.mtime) * 1000) : '-', sortable: true },
]);
async function load(filepath = currentPath.value) { if (!props.storage || !props.volume) return; loading.value = true; try { rows.value = (await listStorageBackupFiles(props.storage, props.volume, filepath)).data || []; selected.value = []; currentPath.value = filepath; } finally { loading.value = false; } }
function openRow(_: Event, row: PveRecord) { if (textValue(row.type) === 'd') void load(textValue(row.filepath)); else selected.value = [row]; }
function download(tar = false) { const row = selected.value[0]; if (!row) return; const query = new URLSearchParams({ volume: props.volume, filepath: textValue(row.filepath), ...(props.vmArchive ? { archive: 'all' } : {}), ...(tar ? { tar: '1' } : {}) }); window.open(`/api2/json/nodes/localhost/storage/${encodeURIComponent(props.storage)}/file-restore/download?${query.toString()}`, '_blank', 'noopener'); }
function up() { const encoded = currentPath.value; if (!encoded) return; try { const decoded = atob(encoded); const parent = decoded.replace(/\/?[^/]+\/?$/, '') || '/'; void load(btoa(parent)); } catch { void load(''); } }
watch(model, (visible) => { if (visible) { currentPath.value = ''; void load(''); } });
</script>
<template><q-dialog v-model="model" persistent maximized><UWindow :title="`${gettext('File Restore')} - ${volume}`" width="900px" :loading="loading"><div class="q-pa-md"><div class="row q-gutter-sm q-mb-sm"><q-btn no-caps outline size="12px" :disable="!currentPath" :label="gettext('Up')" @click="up" /><q-btn no-caps outline size="12px" :disable="!selected.length" :label="gettext('Download')" @click="download(false)" /><q-btn no-caps outline size="12px" :disable="!selected.length || selected[0]?.type !== 'd'" :label="gettext('Download as archive')" @click="download(true)" /></div><q-table flat row-key="filepath" :rows="rows" :columns="columns" :loading="loading" selection="single" :selected="selected" :pagination="{ rowsPerPage: 20 }" @row-dblclick="openRow" @update:selected="selected = [...$event]" /></div><template #foot><q-btn v-close-popup no-caps flat :label="gettext('Close')" /></template></UWindow></q-dialog></template>
