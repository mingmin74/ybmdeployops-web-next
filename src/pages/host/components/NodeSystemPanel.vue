<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getNodeDns, getNodeHosts, getNodeNetwork, getNodeTime, type PveNodeDns, type PveNodeTime } from '@/api/host';
import { getNodeConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { getSystemJournal } from '@/api/maintenance';
import { gettext } from '@/locale';
import NodeServicesPanel from './NodeServicesPanel.vue';

const { node } = defineProps<{ node: string }>();
const splitter = shallowRef(146);
const activeTab = shallowRef('services');
const loading = shallowRef(false);
const dns = shallowRef<PveNodeDns>({});
const hosts = shallowRef('');
const options = shallowRef<PveRecord>({});
const time = shallowRef<PveNodeTime>({});
const networkRows = shallowRef<PveRecord[]>([]);
const logs = shallowRef<string[]>([]);
const sections = [
  { name: 'services', label: gettext('Service'), icon: 'settings' },
  { name: 'network', label: gettext('Network'), icon: 'swap_horiz' },
  { name: 'dns', label: 'DNS', icon: 'public' },
  { name: 'hosts', label: gettext('Hosts'), icon: 'computer' },
  { name: 'options', label: gettext('Options'), icon: 'tune' },
  { name: 'time', label: gettext('Time'), icon: 'access_time' },
  { name: 'syslog', label: gettext('System Log'), icon: 'view_list' },
];
const networkColumns: QTableColumn<PveRecord>[] = [
  { name: 'iface', label: gettext('Name'), align: 'left', field: 'iface' },
  { name: 'type', label: gettext('Type'), align: 'left', field: 'type' },
  { name: 'address', label: gettext('Address'), align: 'left', field: 'address' },
  { name: 'gateway', label: gettext('Gateway'), align: 'left', field: 'gateway' },
  { name: 'active', label: gettext('Status'), align: 'left', field: 'active' },
  { name: 'comments', label: gettext('Description'), align: 'left', field: 'comments' },
];
const dnsRows = computed(() => [
  { label: gettext('Search domain'), value: dns.value.search || '-' },
  { label: `${gettext('DNS server')} 1`, value: dns.value.dns1 || '-' },
  { label: `${gettext('DNS server')} 2`, value: dns.value.dns2 || '-' },
  { label: `${gettext('DNS server')} 3`, value: dns.value.dns3 || '-' },
]);
const optionRows = computed(() => [
  { label: gettext('Start on boot delay'), value: String(options.value['startall-onboot-delay'] || '-') },
  { label: gettext('MAC address for Wake on LAN'), value: String(options.value.wakeonlan || '-') },
  { label: gettext('RAM usage target for ballooning'), value: String(options.value['ballooning-target'] || '-') },
]);
const timeRows = computed(() => [
  { label: gettext('Timezone'), value: time.value.timezone || '-' },
  { label: gettext('Server Time'), value: time.value.time ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(time.value.time * 1000)) : '-' },
]);

async function loadSystemData() {
  if (!node) return;
  loading.value = true;
  try {
    const [dnsResponse, hostsResponse, optionsResponse, timeResponse, networkResponse, logsResponse] = await Promise.all([
      getNodeDns(node), getNodeHosts(node), getNodeConfig(node), getNodeTime(node), getNodeNetwork(node), getSystemJournal(node, { start: 0, limit: 200, since: '', until: '' }),
    ]);
    dns.value = dnsResponse.data || {};
    hosts.value = hostsResponse.data?.data || '';
    options.value = optionsResponse.data || {};
    time.value = timeResponse.data || {};
    networkRows.value = networkResponse.data || [];
    logs.value = (logsResponse.data || []).map((item) => String(item));
  } finally { loading.value = false; }
}

watch(() => node, () => { void loadSystemData(); }, { immediate: true });
</script>

<template>
  <section class="node-system-panel">
    <q-splitter v-model="splitter" unit="px" :limits="[126, 220]">
      <template #before><q-tabs v-model="activeTab" vertical dense inline-label align="left" active-bg-color="blue-1" active-color="primary" class="node-system-tabs"><q-tab v-for="section in sections" :key="section.name" :name="section.name" :label="section.label" :icon="section.icon" /></q-tabs></template>
      <template #after><q-tab-panels v-model="activeTab" class="bg-transparent">
        <q-tab-panel name="services" class="q-pa-none"><NodeServicesPanel :node="node" /></q-tab-panel>
        <q-tab-panel name="network" class="q-pa-sm"><q-table flat row-key="iface" table-header-class="u-table-header" :rows="networkRows" :columns="networkColumns" :loading="loading" :rows-per-page-options="[0]" :no-data-label="gettext('no record can be found')"><template #body-cell-active="props"><q-td :props="props"><q-badge :color="props.value ? 'green' : 'grey'" :label="props.value ? gettext('Active') : '-'" /></q-td></template></q-table></q-tab-panel>
        <q-tab-panel name="dns" class="q-pa-md"><div v-for="item in dnsRows" :key="item.label" class="system-info-row"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></q-tab-panel>
        <q-tab-panel name="hosts" class="q-pa-md"><pre class="hosts-output">{{ hosts || '-' }}</pre></q-tab-panel>
        <q-tab-panel name="options" class="q-pa-md"><div v-for="item in optionRows" :key="item.label" class="system-info-row"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></q-tab-panel>
        <q-tab-panel name="time" class="q-pa-md"><div v-for="item in timeRows" :key="item.label" class="system-info-row"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></q-tab-panel>
        <q-tab-panel name="syslog" class="q-pa-md"><pre class="hosts-output">{{ logs.join('\n') || '-' }}</pre></q-tab-panel>
      </q-tab-panels></template>
    </q-splitter>
  </section>
</template>

<style scoped>
.node-system-panel { min-height: calc(100vh - 272px); background: #fff; }
.node-system-panel :deep(.q-splitter__before) { background: #f7f9fc; border-right: 1px solid #e6ebf2; }
.node-system-tabs { padding: 10px 8px; }
.node-system-tabs :deep(.q-tab) { min-height: 36px; justify-content: flex-start; margin: 0 0 3px; padding: 0 10px 0 9px; border-left: 3px solid transparent; border-radius: 0 5px 5px 0; color: #5e6b7c; }
.node-system-tabs :deep(.q-tab--active) { border-left-color: #1976d2; font-weight: 600; }
.node-system-tabs :deep(.q-tab__label) { margin-left: 7px; font-size: 13px; }
.node-system-tabs :deep(.q-tab__icon) { width: 14px; height: 14px; font-size: 14px; }
.node-system-tabs :deep(.q-tab__indicator) { display: none; }
.node-system-tabs :deep(.q-tab:hover:not(.q-tab--active)) { background: #edf1f6; color: #334155; }
.system-info-row { display: flex; justify-content: space-between; gap: 24px; min-height: 44px; padding: 11px 0; border-bottom: 1px solid #eef1f6; font-size: 12px; }
.system-info-row span { color: #666; }.system-info-row strong { color: #333; font-weight: 600; text-align: right; }
.hosts-output { max-height: 520px; margin: 0; padding: 12px; overflow: auto; border: 1px solid #dfe1e6; background: #f7f9fb; color: #333; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
</style>
