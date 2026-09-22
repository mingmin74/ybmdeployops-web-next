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
  leftNavigation = false,
} = defineProps<{
  basePath?: string;
  firewallType?: FirewallType;
  listRefsUrl?: string;
  allowIface?: boolean;
  showGroups?: boolean;
  showAliases?: boolean;
  showIpset?: boolean;
  leftNavigation?: boolean;
}>();

const tab = shallowRef('rules');
const endpoint = (name: string) => `${basePath}/${name}`;
</script>

<template>
  <q-card
    class="firewall-resource-panel no-border-radius no-shadow"
    :class="{
      'q-mt-sm': !leftNavigation,
      'firewall-resource-panel--left': leftNavigation,
    }"
  >
    <q-card class="no-border-radius no-shadow firewall-resource-panel__card">
      <q-tabs
        v-model="tab"
        :vertical="leftNavigation"
        :inline-label="leftNavigation"
        class="text-grey"
        :class="{ 'firewall-resource-panel__tabs': leftNavigation }"
        active-color="primary"
        :active-bg-color="leftNavigation ? 'blue-1' : undefined"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab
          no-caps
          name="rules"
          :label="gettext('Rules')"
          :icon="leftNavigation ? 'gavel' : undefined"
        />
        <q-tab
          no-caps
          name="options"
          :label="gettext('Options')"
          :icon="leftNavigation ? 'tune' : undefined"
        />
        <q-tab
          v-if="showGroups"
          no-caps
          name="group"
          :label="gettext('Security Group')"
        />
        <q-tab
          v-if="showAliases"
          no-caps
          name="alias"
          :label="gettext('Alias')"
          :icon="leftNavigation ? 'label' : undefined"
        />
        <q-tab
          v-if="showIpset"
          no-caps
          name="ipset"
          :label="gettext('IPSet')"
          :icon="leftNavigation ? 'format_list_bulleted' : undefined"
        />
        <slot name="tabs" />
      </q-tabs>
      <q-separator :vertical="leftNavigation" />
      <q-tab-panels
        v-model="tab"
        animated
        class="firewall-resource-panel__content"
      >
        <q-tab-panel name="rules">
          <FirewallRulesPage
            :base-url="endpoint('rules')"
            :firewall-type="firewallType"
            :list-refs-url="listRefsUrl || endpoint('refs')"
            :allow-iface="allowIface"
          />
        </q-tab-panel>
        <q-tab-panel name="options">
          <FirewallOptionsPage
            :base-url="endpoint('options')"
            :fwtype="firewallType"
          />
        </q-tab-panel>
        <q-tab-panel
          v-if="showGroups"
          name="group"
        >
          <FirewallGroupPage />
        </q-tab-panel>
        <q-tab-panel
          v-if="showAliases"
          name="alias"
        >
          <FirewallAliasPage :base-url="endpoint('aliases')" />
        </q-tab-panel>
        <q-tab-panel
          v-if="showIpset"
          name="ipset"
        >
          <FirewallIpsetPage
            :base-url="endpoint('ipset')"
            :refs-url="endpoint('refs')"
          />
        </q-tab-panel>
        <slot name="panels" />
      </q-tab-panels>
    </q-card>
  </q-card>
</template>

<style scoped>
.firewall-resource-panel--left {
  min-height: calc(100vh - 272px);
  background: #fff;
}

.firewall-resource-panel--left .firewall-resource-panel__card {
  display: grid;
  grid-template-columns: 146px 1px minmax(0, 1fr);
  min-height: inherit;
}

.firewall-resource-panel__tabs {
  align-self: stretch;
  padding: 10px 8px;
  background: #f7f9fc;
}

.firewall-resource-panel__tabs :deep(.q-tab) {
  min-height: 36px;
  justify-content: flex-start;
  margin: 0 0 3px;
  padding: 0 10px 0 9px;
  border-left: 3px solid transparent;
  border-radius: 0 5px 5px 0;
  color: #5e6b7c;
}

.firewall-resource-panel__tabs :deep(.q-tab--active) {
  border-left-color: #1976d2;
  font-weight: 600;
}

.firewall-resource-panel__tabs :deep(.q-tab__label) {
  margin-left: 7px;
  font-size: 13px;
}

.firewall-resource-panel__tabs :deep(.q-tab__icon) {
  width: 14px;
  height: 14px;
  font-size: 14px;
}

.firewall-resource-panel__tabs :deep(.q-tab__indicator) {
  display: none;
}

.firewall-resource-panel__tabs :deep(.q-tab:hover:not(.q-tab--active)) {
  background: #edf1f6;
  color: #334155;
}

.firewall-resource-panel--left .firewall-resource-panel__content {
  min-width: 0;
  background: transparent;
}
</style>
