<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import FirewallAliasPage from './FirewallAliasPage.vue';
import FirewallGroupPage from './FirewallGroupPage.vue';
import FirewallIpsetPage from './FirewallIpsetPage.vue';
import FirewallOptionsPage from './FirewallOptionsPage.vue';
import FirewallRulesPage from './FirewallRulesPage.vue';

type FirewallType = 'dc' | 'node' | 'vm';

const {
  basePath = '/cluster/firewall',
  firewallType = 'dc',
  listRefsUrl,
  allowIface = false,
  showGroups = false,
  showAliases = false,
  showIpset = false,
} = defineProps<{
  basePath?: string;
  firewallType?: FirewallType;
  listRefsUrl?: string;
  allowIface?: boolean;
  showGroups?: boolean;
  showAliases?: boolean;
  showIpset?: boolean;
}>();

const tab = shallowRef('rules');
const endpoint = (name: string) => `${basePath}/${name}`;
</script>

<template>
  <q-card class="q-mt-sm no-border-radius no-shadow">
    <q-card>
      <q-tabs
        v-model="tab"
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab no-caps name="rules" :label="gettext('Rules')" />
        <q-tab no-caps name="options" :label="gettext('Options')" />
        <q-tab v-if="showGroups" no-caps name="group" :label="gettext('Security Group')" />
        <q-tab v-if="showAliases" no-caps name="alias" :label="gettext('Alias')" />
        <q-tab v-if="showIpset" no-caps name="ipset" :label="gettext('IPSet')" />
        <slot name="tabs" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="tab" animated>
        <q-tab-panel name="rules"><FirewallRulesPage :base-url="endpoint('rules')" :firewall-type="firewallType" :list-refs-url="listRefsUrl || endpoint('refs')" :allow-iface="allowIface" /></q-tab-panel>
        <q-tab-panel name="options"><FirewallOptionsPage :base-url="endpoint('options')" :fwtype="firewallType" /></q-tab-panel>
        <q-tab-panel v-if="showGroups" name="group"><FirewallGroupPage /></q-tab-panel>
        <q-tab-panel v-if="showAliases" name="alias"><FirewallAliasPage :base-url="endpoint('aliases')" /></q-tab-panel>
        <q-tab-panel v-if="showIpset" name="ipset"><FirewallIpsetPage :base-url="endpoint('ipset')" :refs-url="endpoint('refs')" /></q-tab-panel>
        <slot name="panels" />
      </q-tab-panels>
    </q-card>
  </q-card>
</template>
