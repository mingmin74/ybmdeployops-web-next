<script setup lang="ts">
import { gettext } from '@/locale';
import NodeFirewallLogsPanel from './NodeFirewallLogsPanel.vue';
import FirewallResourcePanel from '@/pages/system/firewall/FirewallResourcePanel.vue';

const { node } = defineProps<{ node: string }>();
const basePath = `/nodes/${encodeURIComponent(node)}/firewall`;
</script>

<template>
  <FirewallResourcePanel
    :base-path="basePath"
    firewall-type="node"
    list-refs-url="/cluster/firewall/refs"
    allow-iface
  >
    <template #tabs>
      <q-tab no-caps name="log" :label="gettext('Log')" />
    </template>
    <template #panels>
      <q-tab-panel name="log">
        <NodeFirewallLogsPanel :node="node" />
      </q-tab-panel>
    </template>
  </FirewallResourcePanel>
</template>
