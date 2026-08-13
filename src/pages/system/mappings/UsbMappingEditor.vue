<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getNodeUsbDevices } from '@/api/host';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ id: string; node: string; nodes: { label: string; value: string; disable?: boolean }[]; map?: PveRecord | undefined; description: string; create: boolean; entryOnly: boolean; nodeLocked: boolean; }>();
const emit = defineEmits<{ submit: [value: { id: string; node: string; map: PveRecord; description: string }]; }>();
const name = shallowRef(props.id); const selectedNode = shallowRef(props.node); const comment = shallowRef(props.description);
const mode = shallowRef<'id' | 'path'>(props.map?.path ? 'path' : 'id'); const deviceValue = shallowRef(textValue(props.map?.id)); const pathValue = shallowRef(textValue(props.map?.path));
const devices = shallowRef<PveRecord[]>([]); const loading = shallowRef(false);
const rows = computed<PveRecord[]>(() => devices.value.filter(row => textValue(row.usbpath) && textValue(row.prodid) && Number(row.class) !== 9).map(row => ({ ...row, deviceKey: `${textValue(row.vendid)}:${textValue(row.prodid)}`, portKey: `${textValue(row.busnum)}-${textValue(row.usbpath)}` })));
const columns: QTableColumn<PveRecord>[] = [{ name: 'key', label: gettext('Device'), field: row => textValue(row.deviceKey || row.portKey), align: 'left' }, { name: 'manufacturer', label: gettext('Manufacturer'), field: row => textValue(row.manufacturer), align: 'left' }, { name: 'product', label: gettext('Product'), field: row => textValue(row.product), align: 'left' }];
const selectedValue = computed(() => mode.value === 'id' ? deviceValue.value : pathValue.value);
const canSubmit = computed(() => Boolean(name.value.trim() && (props.entryOnly || (selectedNode.value && selectedValue.value))));
async function loadDevices() { if (!selectedNode.value || props.entryOnly) return; loading.value = true; try { devices.value = (await getNodeUsbDevices(selectedNode.value)).data || []; } finally { loading.value = false; } }
function selectedDevice(row: PveRecord | undefined) { if (!row) return; if (mode.value === 'id') deviceValue.value = textValue(row.deviceKey); else pathValue.value = textValue(row.portKey); }
function submit() { if (!canSubmit.value) return; const row = rows.value.find(item => textValue(mode.value === 'id' ? item.deviceKey : item.portKey) === selectedValue.value); const id = mode.value === 'path' ? row ? `${textValue(row.vendid)}:${textValue(row.prodid)}` : textValue(props.map?.id) : deviceValue.value; emit('submit', { id: name.value.trim(), node: selectedNode.value, map: { node: selectedNode.value, id, ...(mode.value === 'path' ? { path: pathValue.value } : {}) }, description: comment.value.trim() }); }
watch(selectedNode, () => void loadDevices()); if (selectedNode.value) void loadDevices();
</script>
<template><div class="q-pa-md u-dense q-gutter-sm"><q-input v-model="name" dense :disable="!create" :label="gettext('Name')" /><q-select v-if="!entryOnly && !nodeLocked" v-model="selectedNode" dense emit-value map-options :options="nodes" :label="gettext('Mapping on Node')" /><q-input v-else-if="!entryOnly" :model-value="selectedNode" dense disable :label="gettext('Mapping on Node')" /><template v-if="!entryOnly"><q-radio v-model="mode" val="id" dense :label="gettext('Use USB Vendor/Device ID')" /><SelectTable v-model="deviceValue" row-key="deviceKey" :rows="rows" :columns="columns" :display-value="deviceValue" :loading="loading" :get-row-value="row => textValue(row.deviceKey)" :disable="mode !== 'id'" :label="gettext('Choose Device')" @selected="selectedDevice" /><q-radio v-model="mode" val="path" dense :label="gettext('Use USB Port')" /><SelectTable v-model="pathValue" row-key="portKey" :rows="rows" :columns="columns" :display-value="pathValue" :loading="loading" :get-row-value="row => textValue(row.portKey)" :disable="mode !== 'path'" :label="gettext('Choose Port')" @selected="selectedDevice" /></template><q-input v-if="create || entryOnly" v-model="comment" dense :label="gettext('Comment')" /><div class="row justify-end"><q-btn no-caps flat color="primary" :disable="!canSubmit" :label="create ? gettext('Create') : gettext('OK')" @click="submit" /></div></div></template>
