<script setup lang="ts">
import { ref } from 'vue';
import FirewallAliasPage from './firewall/FirewallAliasPage.vue';
import FirewallGroupPage from './firewall/FirewallGroupPage.vue';
import FirewallIpsetPage from './firewall/FirewallIpsetPage.vue';
import FirewallOptionsPage from './firewall/FirewallOptionsPage.vue';
import FirewallRulesPage from './firewall/FirewallRulesPage.vue';
import { gettext } from '@/locale';

const tab = ref('rules');
</script>

<template>
  <div class="q-ma-md bg-white">
    <q-tabs v-model="tab" dense active-color="primary" indicator-color="primary" align="left" class="bg-grey-2 text-grey-8">
      <q-tab name="rules" :label="gettext('Rules')" />
      <q-tab name="options" :label="gettext('Options')" />
      <q-tab name="group" :label="gettext('Security Group')" />
      <q-tab name="alias" :label="gettext('Alias')" />
      <q-tab name="ipset" :label="gettext('IPSet')" />
    </q-tabs>
    <q-separator />
    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="rules"><FirewallRulesPage /></q-tab-panel>
      <q-tab-panel name="options"><FirewallOptionsPage /></q-tab-panel>
      <q-tab-panel name="group"><FirewallGroupPage /></q-tab-panel>
      <q-tab-panel name="alias"><FirewallAliasPage /></q-tab-panel>
      <q-tab-panel name="ipset"><FirewallIpsetPage /></q-tab-panel>
    </q-tab-panels>
  </div>
</template>
