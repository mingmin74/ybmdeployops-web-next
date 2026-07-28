<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { createVmFirewallRule, deleteVmFirewallRule, getVmFirewallLogs, getVmFirewallOptions, getVmFirewallRules, updateVmFirewallOptions, updateVmFirewallRule } from '@/api/firewall';
import UWindow from '@/components/UWindow.vue';
import VmFirewallAliasesTab from './VmFirewallAliasesTab.vue';
import VmFirewallIpsetTab from './VmFirewallIpsetTab.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{ node: string; vmid: string }>();
const session = useSessionStore();
const loading = shallowRef(false);
const section = shallowRef<'rules' | 'options' | 'aliases' | 'ipset' | 'log'>('rules');
const rows = shallowRef<PveRecord[]>([]);
const options = shallowRef<PveRecord>({});
const selected = shallowRef<PveRecord[]>([]);
const logs = shallowRef<PveRecord[]>([]);
const dialog = shallowRef(false);
const editing = shallowRef(false);
const form = reactive<Record<string, string | number>>({ type: 'in', action: 'ACCEPT', enable: 1, macro: '', iface: '', source: '', dest: '', proto: '', sport: '', dport: '', log: 'nolog', comment: '' });
const selectedRule = computed(() => selected.value[0]);
const vmCaps = computed(() => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {});
const canConfigureFirewall = computed(() => Boolean(vmCaps.value['VM.Config.Network']));
const canViewFirewallLog = computed(() => Boolean(vmCaps.value['VM.Console']));
const columns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'enable', label: gettext('Enable'), field: 'enable', align: 'left' }, { name: 'type', label: gettext('Type'), field: 'type', align: 'left' }, { name: 'action', label: gettext('Action'), field: 'action', align: 'left' }, { name: 'macro', label: gettext('Macro'), field: 'macro', align: 'left' }, { name: 'source', label: gettext('Source'), field: 'source', align: 'left' }, { name: 'dest', label: gettext('Destination'), field: 'dest', align: 'left' }, { name: 'proto', label: gettext('Protocol'), field: 'proto', align: 'left' }, { name: 'dport', label: gettext('Dest. port'), field: 'dport', align: 'left' }, { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
]);

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const [rulesResponse, optionsResponse] = await Promise.all([getVmFirewallRules(props.node, props.vmid), getVmFirewallOptions(props.node, props.vmid)]);
    rows.value = rulesResponse.data || [];
    options.value = optionsResponse.data || {};
    selected.value = [];
  } finally { loading.value = false; }
}

function openRule(edit = false) {
  if (!canConfigureFirewall.value) return;
  editing.value = edit;
  Object.assign(form, edit && selectedRule.value ? selectedRule.value : { type: 'in', action: 'ACCEPT', enable: 1, macro: '', iface: '', source: '', dest: '', proto: '', sport: '', dport: '', log: 'nolog', comment: '' });
  dialog.value = true;
}
async function saveRule() {
  if (!canConfigureFirewall.value) return;
  loading.value = true;
  try { if (editing.value) await updateVmFirewallRule(props.node, props.vmid, String(form.pos || ''), form); else await createVmFirewallRule(props.node, props.vmid, form); dialog.value = false; await reload(); } finally { loading.value = false; }
}
function removeRule() {
  if (!canConfigureFirewall.value) return;
  const row = selectedRule.value;
  if (!row) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', String(row.pos || '')), cancel: true, persistent: true }).onOk(() => { void deleteVmFirewallRule(props.node, props.vmid, String(row.pos || ''), row.digest).then(reload); });
}
async function saveOption(key: string, value: unknown) {
  if (!canConfigureFirewall.value) return;
  loading.value = true;
  try { await updateVmFirewallOptions(props.node, props.vmid, { [key]: value, digest: options.value.digest }); await reload(); } finally { loading.value = false; }
}
async function loadLogs() { loading.value = true; try { const response = await getVmFirewallLogs(props.node, props.vmid, { start: 0, limit: 500 }); const payload = response.data; logs.value = Array.isArray(payload) ? payload : payload?.data || []; } finally { loading.value = false; } }
watch(() => [props.node, props.vmid], () => { void reload(); }, { immediate: true });
</script>

<template>
  <div class="vm-firewall-tab q-pa-md">
    <q-tabs v-model="section" dense align="left" active-color="primary" indicator-color="primary"><q-tab name="rules" :label="gettext('Rules')" /><q-tab name="options" :label="gettext('Options')" /><q-tab name="aliases" :label="gettext('Alias')" /><q-tab name="ipset" :label="gettext('IPSet')" /><q-tab v-if="canViewFirewallLog" name="log" :label="gettext('Log')" @click="loadLogs" /></q-tabs><q-separator />
    <q-tab-panels v-model="section" animated>
      <q-tab-panel name="rules" class="q-pa-sm"><q-table v-model:selected="selected" flat bordered square dense row-key="pos" selection="single" :rows="rows" :columns="columns" :loading="loading" :pagination="{ rowsPerPage: 0 }" hide-bottom class="u-compact-table"><template #top><q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!canConfigureFirewall" :label="gettext('Add')" @click="openRule()" /><q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" :disable="!canConfigureFirewall || !selectedRule" :label="gettext('Edit')" @click="openRule(true)" /><q-btn no-caps outline size="12px" color="negative" class="u-button q-ml-sm" :disable="!canConfigureFirewall || !selectedRule" :label="gettext('Remove')" @click="removeRule" /><q-space /><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Refresh')" @click="reload" /></template><template #body-cell-enable="scope"><q-td :props="scope"><q-badge :color="scope.value ? 'positive' : 'negative'" :label="scope.value ? gettext('Enabled') : gettext('Disabled')" /></q-td></template></q-table></q-tab-panel>
      <q-tab-panel name="options" class="q-pa-sm"><q-markup-table flat><tbody><tr><td>{{ gettext('Firewall') }}</td><td class="text-right"><q-toggle :model-value="Number(options.enable)" :true-value="1" :false-value="0" :disable="!canConfigureFirewall" color="primary" @update:model-value="saveOption('enable', $event)" /></td></tr><tr><td>log_level_in</td><td class="text-right"><q-popup-edit :model-value="String(options.log_level_in || 'nolog')" :disable="!canConfigureFirewall" buttons @save="saveOption('log_level_in', $event)" v-slot="scope"><q-select v-model="scope.value" dense square outlined :options="['nolog','emerg','alert','crit','err','warning','notice','info','debug']" /></q-popup-edit>{{ options.log_level_in || gettext('Default') }}</td></tr><tr><td>log_level_out</td><td class="text-right"><q-popup-edit :model-value="String(options.log_level_out || 'nolog')" :disable="!canConfigureFirewall" buttons @save="saveOption('log_level_out', $event)" v-slot="scope"><q-select v-model="scope.value" dense square outlined :options="['nolog','emerg','alert','crit','err','warning','notice','info','debug']" /></q-popup-edit>{{ options.log_level_out || gettext('Default') }}</td></tr></tbody></q-markup-table></q-tab-panel>
      <q-tab-panel name="aliases" class="q-pa-sm"><VmFirewallAliasesTab :node="node" :vmid="vmid" :editable="canConfigureFirewall" /></q-tab-panel>
      <q-tab-panel name="ipset" class="q-pa-sm"><VmFirewallIpsetTab :node="node" :vmid="vmid" :editable="canConfigureFirewall" /></q-tab-panel>
      <q-tab-panel name="log" class="q-pa-sm"><div class="row justify-end q-mb-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Refresh')" @click="loadLogs" /></div><q-markup-table flat bordered dense class="full-width"><thead><tr><th class="text-left">{{ gettext('Time') }}</th><th class="text-left">{{ gettext('Log') }}</th></tr></thead><tbody><tr v-for="(item, index) in logs" :key="index"><td>{{ item.time || '-' }}</td><td class="firewall-log-line">{{ item.t || item.msg || item }}</td></tr></tbody></q-markup-table></q-tab-panel>
    </q-tab-panels>
    <q-dialog v-model="dialog" persistent><UWindow :title="gettext(editing ? 'Edit Rule' : 'Add Rule')" width="620px" :loading="loading"><div class="q-pa-md row q-col-gutter-md"><q-select v-model="form.type" class="col-6" dense square outlined emit-value map-options :label="gettext('Direction')" :options="[{ label: gettext('In'), value: 'in' }, { label: gettext('Out'), value: 'out' }]" /><q-select v-model="form.action" class="col-6" dense square outlined :label="gettext('Action')" :options="['ACCEPT','DROP','REJECT']" /><q-input v-model="form.macro" class="col-6" dense square outlined :label="gettext('Macro')" /><q-input v-model="form.iface" class="col-6" dense square outlined :label="gettext('Interface')" /><q-input v-model="form.source" class="col-6" dense square outlined :label="gettext('Source')" /><q-input v-model="form.dest" class="col-6" dense square outlined :label="gettext('Destination')" /><q-input v-model="form.proto" class="col-4" dense square outlined :label="gettext('Protocol')" /><q-input v-model="form.sport" class="col-4" dense square outlined :label="gettext('Source port')" /><q-input v-model="form.dport" class="col-4" dense square outlined :label="gettext('Dest. port')" /><q-input v-model="form.comment" class="col-12" dense square outlined :label="gettext('Comment')" /><q-checkbox v-model="form.enable" class="col-12" :true-value="1" :false-value="0" :label="gettext('Enable')" /></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Save')" @click="saveRule" /></template></UWindow></q-dialog>
  </div>
</template>

<style scoped>.u-compact-table :deep(tbody td) { height: 40px; font-size: 12px; }</style>
