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
  <div class="network-page">
    <section class="network-page__filters">
      <div class="network-page__heading">{{ gettext('Network') }}</div>
      <div class="network-page__toolbar">
        <div class="network-page__filter">
          <div class="network-page__filter-label">{{ gettext('Node') }}</div>
          <NodeSelectTable
            v-model="selectedNode"
            disable-offline
            class="network-page__node"
          />
        </div>
        <div class="network-page__filter">
          <div class="network-page__filter-label">{{ gettext('Zone') }}</div>
          <q-select
            v-model="selectedZone"
            square
            outlined
            dense
            options-dense
            emit-value
            map-options
            class="u-dense u-size-12 network-page__zone"
            :loading="loadingZones"
            :options="zoneOptions"
          />
        </div>
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
    </section>
    <section class="network-page__workspace">
      <q-tabs
        v-model="activeTab"
        class="network-page__tabs text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
        no-caps
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
        class="network-page__panels"
      >
        <q-tab-panel
          name="content"
          class="network-page__panel"
        >
          <SdnZoneContentPanel
            :node="selectedNode"
            :zone="selectedZone"
          />
        </q-tab-panel>
        <q-tab-panel
          v-if="canModifyPermissions"
          name="permissions"
          class="network-page__panel"
        >
          <section
            v-if="zonePermissionPath"
            class="network-page__permission-panel"
          >
            <RulesPage :resource-path="zonePermissionPath" />
          </section>
        </q-tab-panel>
        <q-tab-panel
          name="bridges"
          class="network-page__panel"
        >
          <SdnZoneBridgesPanel
            :node="selectedNode"
            :zone="selectedZone"
          />
        </q-tab-panel>
      </q-tab-panels>
    </section>
  </div>
</template>

<style scoped>
.network-page {
  display: grid;
  gap: 16px;
  margin: 16px;
}

.network-page__filters,
.network-page__workspace {
  min-width: 0;
  border: 1px solid #dfe1e6;
  background: #ffffff;
}

.network-page__filters {
  padding: 16px;
}

.network-page__heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  color: #333333;
  font-weight: 600;
}

.network-page__heading::before {
  content: '';
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: #1976d2;
}

.network-page__toolbar {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.network-page__filter {
  display: grid;
  gap: 6px;
  width: 260px;
  max-width: 100%;
}

.network-page__filter-label {
  color: #666666;
}

.network-page__node,
.network-page__zone {
  width: 100%;
}

.network-page__tabs {
  padding: 0 12px;
}

.network-page__panel {
  padding: 16px;
  background: #f7f9fc;
}

.network-page__panel :deep(.network-panels) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.network-page__panel :deep(.network-panel),
.network-page__permission-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid #dfe1e6;
  background: #ffffff;
}

.network-page__panel :deep(.network-panel__heading) {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.network-page__panel :deep(.network-panel__title) {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #333333;
  font-weight: 600;
}

.network-page__panel :deep(.network-panel__title::before) {
  content: '';
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: #1976d2;
}

.network-page__zone :deep(.q-field__control),
.network-page__zone :deep(.q-field__marginal) {
  height: 28px !important;
  min-height: 28px !important;
}

.network-page__zone :deep(.q-field__native),
.network-page__zone :deep(.q-field__input) {
  line-height: 28px;
  min-height: 28px !important;
  padding-bottom: 0;
  padding-top: 0;
}

.network-page__zone :deep(.q-field--outlined .q-field__control::before),
.network-page__zone :deep(.q-field--outlined .q-field__control::after) {
  border: 1px solid #cccccc !important;
}

@media (max-width: 599px) {
  .network-page {
    margin: 8px;
  }

  .network-page__filter {
    width: 100%;
  }
}

@media (max-width: 1200px) {
  .network-page__panel :deep(.network-panels) {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
