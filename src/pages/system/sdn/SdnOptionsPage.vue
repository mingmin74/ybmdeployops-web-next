<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { deleteSdnController, deleteSdnDns, deleteSdnIpam, getSdnControllers, getSdnDns, getSdnIpams } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import ControllerEditor, { type ControllerType } from './options/ControllerEditor.vue';
import DnsEditor from './options/DnsEditor.vue';
import IpamEditor, { type IpamType } from './options/IpamEditor.vue';

type Section = 'controllers' | 'ipams' | 'dns';
const loading = ref(false);
const selected = ref<Record<Section, PveRecord[]>>({ controllers: [], ipams: [], dns: [] });
const controllers = shallowRef<PveRecord[]>([]);
const ipams = shallowRef<PveRecord[]>([]);
const dnsRows = shallowRef<PveRecord[]>([]);
const controllerEditorVisible = ref(false);
const ipamEditorVisible = ref(false);
const dnsEditorVisible = ref(false);
const controllerType = shallowRef<ControllerType>('evpn');
const ipamType = shallowRef<IpamType>('netbox');
const editingController = shallowRef<PveRecord>();
const editingIpam = shallowRef<PveRecord>();
const editingDns = shallowRef<PveRecord>();

function pendingValue(row: PveRecord, key: string) { return (row.pending as PveRecord)?.[key] ?? row[key]; }
function controllerId(row?: PveRecord) { return textValue(row?.controller); }
function resourceId(section: Section, row?: PveRecord) { return section === 'controllers' ? controllerId(row) : textValue(row?.[section === 'ipams' ? 'ipam' : 'dns']); }
function displayValue(value: unknown) { return textValue(value) || '-'; }
const controllerColumns: QTableColumn<PveRecord>[] = [
  { name: 'controller', required: true, label: 'ID', align: 'left', field: (row) => displayValue(pendingValue(row, 'controller')), sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => displayValue(pendingValue(row, 'type')), sortable: true },
  { name: 'node', label: gettext('Node'), align: 'left', field: (row) => displayValue(pendingValue(row, 'node')), sortable: true },
  { name: 'state', label: gettext('State'), align: 'left', field: (row) => displayValue(pendingValue(row, 'state')), sortable: true },
];
const ipamColumns: QTableColumn<PveRecord>[] = [
  { name: 'ipam', required: true, label: 'ID', align: 'left', field: (row) => displayValue(row.ipam), sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => ({ netbox: 'Netbox', phpipam: 'PhpIpam', pve: 'PVE' })[textValue(row.type)] || displayValue(row.type), sortable: true },
  { name: 'url', label: 'url', align: 'left', field: (row) => displayValue(row.url), sortable: true },
];
const dnsColumns: QTableColumn<PveRecord>[] = [
  { name: 'dns', required: true, label: 'ID', align: 'left', field: (row) => displayValue(row.dns), sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => textValue(row.type) === 'powerdns' ? 'PowerDNS' : displayValue(row.type), sortable: true },
  { name: 'url', label: 'url', align: 'left', field: (row) => displayValue(row.url), sortable: true },
];
const controllerIdForEditor = computed(() => controllerId(editingController.value) || undefined);
const ipamIdForEditor = computed(() => textValue(editingIpam.value?.ipam) || undefined);
const dnsIdForEditor = computed(() => textValue(editingDns.value?.dns) || undefined);
async function refreshData() { loading.value = true; try { const [controllerResponse, ipamResponse, dnsResponse] = await Promise.all([getSdnControllers(), getSdnIpams(false), getSdnDns(false)]); controllers.value = [...(controllerResponse.data || [])].sort((a, b) => controllerId(a).localeCompare(controllerId(b))); ipams.value = [...(ipamResponse.data || [])].sort((a, b) => textValue(a.ipam).localeCompare(textValue(b.ipam))); dnsRows.value = [...(dnsResponse.data || [])].sort((a, b) => textValue(a.dns).localeCompare(textValue(b.dns))); selected.value = { controllers: [], ipams: [], dns: [] }; } finally { loading.value = false; } }
function addController(type: ControllerType) { controllerType.value = type; editingController.value = undefined; controllerEditorVisible.value = true; }
function editController(row = selected.value.controllers[0]) { if (!row) return; controllerType.value = textValue(row.type).toLowerCase() as ControllerType; editingController.value = row; controllerEditorVisible.value = true; }
function addIpam(type: IpamType) { ipamType.value = type; editingIpam.value = undefined; ipamEditorVisible.value = true; }
function editIpam(row = selected.value.ipams[0]) { if (!row) return; const type = textValue(row.type).toLowerCase(); if (type !== 'netbox' && type !== 'phpipam' && type !== 'pve') return; ipamType.value = type; editingIpam.value = row; ipamEditorVisible.value = true; }
function addDns() { editingDns.value = undefined; dnsEditorVisible.value = true; }
function editDns(row = selected.value.dns[0]) { if (!row) return; editingDns.value = row; dnsEditorVisible.value = true; }
function removeSelected(section: Section) { const row = selected.value[section][0]; const id = resourceId(section, row); if (!id) return; const remover = section === 'controllers' ? deleteSdnController : section === 'ipams' ? deleteSdnIpam : deleteSdnDns; Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', id), cancel: true, persistent: true }).onOk(() => void remover(id).then(refreshData)); }
onMounted(() => void refreshData());
</script>
<template><div class="sdn-page column q-gutter-md">
  <q-table flat row-key="controller" table-header-class="u-table-header" selection="single" :rows="controllers" :columns="controllerColumns" :selected="selected.controllers" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" @row-dblclick="(_, row) => editController(row)" @update:selected="selected.controllers = [...$event]"><template #top><div class="text-subtitle2">{{ gettext('Controller') }}</div><q-space /><q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')"><q-list dense><q-item v-close-popup clickable @click="addController('evpn')"><q-item-section>EVPN</q-item-section></q-item><q-item v-close-popup clickable @click="addController('bgp')"><q-item-section>BGP</q-item-section></q-item><q-item v-close-popup clickable @click="addController('isis')"><q-item-section>ISIS</q-item-section></q-item></q-list></q-btn-dropdown><q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" :disable="selected.controllers.length !== 1" :label="gettext('Edit')" @click="editController()" /><q-btn no-caps outline size="12px" :color="selected.controllers.length !== 1 ? 'grey' : 'red'" class="u-button q-ml-sm" :disable="selected.controllers.length !== 1" :label="gettext('Remove')" @click="removeSelected('controllers')" /></template></q-table>
  <q-table flat row-key="ipam" table-header-class="u-table-header" selection="single" :rows="ipams" :columns="ipamColumns" :selected="selected.ipams" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" @row-dblclick="(_, row) => editIpam(row)" @update:selected="selected.ipams = [...$event]"><template #top><div class="text-subtitle2">IPAM</div><q-space /><q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')"><q-list dense><q-item v-close-popup clickable @click="addIpam('netbox')"><q-item-section>Netbox</q-item-section></q-item><q-item v-close-popup clickable @click="addIpam('phpipam')"><q-item-section>PhpIpam</q-item-section></q-item></q-list></q-btn-dropdown><q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" :disable="selected.ipams.length !== 1 || !['netbox', 'phpipam', 'pve'].includes(textValue(selected.ipams[0]?.type).toLowerCase())" :label="gettext('Edit')" @click="editIpam()" /><q-btn no-caps outline size="12px" :color="selected.ipams.length !== 1 ? 'grey' : 'red'" class="u-button q-ml-sm" :disable="selected.ipams.length !== 1" :label="gettext('Remove')" @click="removeSelected('ipams')" /></template></q-table>
  <q-table flat row-key="dns" table-header-class="u-table-header" selection="single" :rows="dnsRows" :columns="dnsColumns" :selected="selected.dns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" @row-dblclick="(_, row) => editDns(row)" @update:selected="selected.dns = [...$event]"><template #top><div class="text-subtitle2">DNS</div><q-space /><q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')"><q-list dense><q-item v-close-popup clickable @click="addDns"><q-item-section>PowerDNS</q-item-section></q-item></q-list></q-btn-dropdown><q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" :disable="selected.dns.length !== 1" :label="gettext('Edit')" @click="editDns()" /><q-btn no-caps outline size="12px" :color="selected.dns.length !== 1 ? 'grey' : 'red'" class="u-button q-ml-sm" :disable="selected.dns.length !== 1" :label="gettext('Remove')" @click="removeSelected('dns')" /></template></q-table>
  <q-btn no-caps outline size="12px" color="primary" class="u-button self-start" :label="gettext('Refresh')" @click="refreshData" />
  <ControllerEditor v-model="controllerEditorVisible" :type="controllerType" :controller-id="controllerIdForEditor" @saved="refreshData" /><IpamEditor v-model="ipamEditorVisible" :type="ipamType" :ipam-id="ipamIdForEditor" @saved="refreshData" /><DnsEditor v-model="dnsEditorVisible" :dns-id="dnsIdForEditor" @saved="refreshData" />
</div></template>

<style scoped>
.sdn-page {
  margin: 16px;
  background: #fff;
}
</style>
