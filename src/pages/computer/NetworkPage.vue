<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue';
import { getSdnZones } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import { gettext } from '@/locale';
import SdnZoneBridgesPanel from './network/SdnZoneBridgesPanel.vue';
import SdnZoneContentPanel from './network/SdnZoneContentPanel.vue';
import RulesPage from '@/pages/system/permission/RulesPage.vue';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

const session = useSessionStore();
const selectedNode = shallowRef('');
const selectedZone = shallowRef('');
const zones = shallowRef<PveRecord[]>([]);
const loadingZones = shallowRef(false);
const activeTab = shallowRef('content');

const canModifyPermissions = computed(() =>
  Boolean((session.caps.sdn as Record<string, unknown> | undefined)?.['Permissions.Modify'])
);
const zoneOptions = computed(() =>
  zones.value.map((zone) => {
    const id = textValue(zone.zone);
    const type = textValue((zone.pending as PveRecord | undefined)?.type || zone.type);
    return { label: type ? `${id} (${type})` : id, value: id };
  })
);
const zonePermissionPath = computed(() =>
  selectedZone.value ? `/sdn/zones/${selectedZone.value}` : ''
);

async function loadZones() {
  loadingZones.value = true;
  try {
    const response = await getSdnZones();
    const configuredZones = response.data || [];
    const localNetwork = configuredZones.some((zone) => textValue(zone.zone) === 'localnetwork')
      ? []
      : [{ zone: 'localnetwork', type: gettext('Local Network') }];
    zones.value = [...configuredZones, ...localNetwork].sort((left, right) =>
      textValue(left.zone).localeCompare(textValue(right.zone))
    );
    if (!zoneOptions.value.some((option) => option.value === selectedZone.value)) {
      selectedZone.value = zoneOptions.value[0]?.value || '';
    }
  } finally {
    loadingZones.value = false;
  }
}

watch(canModifyPermissions, (allowed) => {
  if (!allowed && activeTab.value === 'permissions') activeTab.value = 'content';
});
onMounted(() => void loadZones());
</script>

<template>
  <div class="q-ma-md network-page">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-card-section class="q-pb-none">
        <div class="row items-center q-gutter-md">
          <NodeSelectTable
            v-model="selectedNode"
            disable-offline
            field-style="standard"
            :label="gettext('Node')"
          />
          <q-select
            v-model="selectedZone"
            dense
            options-dense
            emit-value
            map-options
            class="network-page__zone q-field--with-bottom"
            :loading="loadingZones"
            :options="zoneOptions"
            :label="gettext('Zone')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="loadZones"
          />
        </div>
      </q-card-section>
      <q-tabs
        v-model="activeTab"
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab
          name="content"
          :label="gettext('Content')"
        />
        <q-tab
          v-if="canModifyPermissions"
          name="permissions"
          :label="gettext('Permissions')"
        />
        <q-tab
          name="bridges"
          :label="gettext('Bridges')"
        />
      </q-tabs>
      <q-separator />
      <q-tab-panels
        v-model="activeTab"
        animated
      >
        <q-tab-panel
          name="content"
          class="q-pa-md"
        >
          <SdnZoneContentPanel
            :node="selectedNode"
            :zone="selectedZone"
          />
        </q-tab-panel>
        <q-tab-panel
          v-if="canModifyPermissions"
          name="permissions"
          class="q-pa-md"
        >
          <RulesPage
            v-if="zonePermissionPath"
            :resource-path="zonePermissionPath"
          />
        </q-tab-panel>
        <q-tab-panel
          name="bridges"
          class="q-pa-md"
        >
          <SdnZoneBridgesPanel
            :node="selectedNode"
            :zone="selectedZone"
          />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </div>
</template>

<style scoped>
.network-page__zone {
  width: 260px;
}
</style>
