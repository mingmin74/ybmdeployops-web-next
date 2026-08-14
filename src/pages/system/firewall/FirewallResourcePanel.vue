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
  allowIface = false,
  showGroups = false,
  showAliases = false,
  showIpset = false,
} = defineProps<{
  basePath?: string;
  firewallType?: FirewallType;
  allowIface?: boolean;
  showGroups?: boolean;
  showAliases?: boolean;
  showIpset?: boolean;
}>();

const tab = shallowRef('rules');
const endpoint = (name: string) => `${basePath}/${name}`;
</script>

<template>
  <div class="bg-white">
    <q-tabs v-model="tab" dense active-color="primary" indicator-color="primary" align="left" class="bg-grey-2 text-grey-8">
      <q-tab name="rules" :label="gettext('Rules')" />
      <q-tab name="options" :label="gettext('Options')" />
      <q-tab v-if="showGroups" name="group" :label="gettext('Security Group')" />
      <q-tab v-if="showAliases" name="alias" :label="gettext('Alias')" />
      <q-tab v-if="showIpset" name="ipset" :label="gettext('IPSet')" />
    </q-tabs>
    <q-separator />
    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="rules"><FirewallRulesPage :base-url="endpoint('rules')" :firewall-type="firewallType" :list-refs-url="endpoint('refs')" :allow-iface="allowIface" /></q-tab-panel>
      <q-tab-panel name="options"><FirewallOptionsPage :base-url="endpoint('options')" :fwtype="firewallType" /></q-tab-panel>
      <q-tab-panel v-if="showGroups" name="group"><FirewallGroupPage /></q-tab-panel>
      <q-tab-panel v-if="showAliases" name="alias"><FirewallAliasPage :base-url="endpoint('aliases')" /></q-tab-panel>
      <q-tab-panel v-if="showIpset" name="ipset"><FirewallIpsetPage :base-url="endpoint('ipset')" :refs-url="endpoint('refs')" /></q-tab-panel>
    </q-tab-panels>
  </div>
</template>
