<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephOsdLvInfo, getCephOsdMetadata } from '@/api/ceph';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { formatBytes, textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>('visible', { default: false });
const { node, osdId } = defineProps<{ node: string; osdId: string }>();
const loading = ref(false);
const tab = ref('general');
const metadata = shallowRef<PveRecord>({});
const devices = shallowRef<PveRecord[]>([]);
const selectedDevices = shallowRef<PveRecord[]>([]);
const volumeDetails = shallowRef<PveRecord>({});
const generalRows = computed(() => Object.entries((metadata.value.osd as PveRecord) || {}).sort());
const deviceColumns: QTableColumn<PveRecord>[] = [
  { name: 'device', label: gettext('Device'), field: 'device', align: 'left' },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
  {
    name: 'physical_device',
    label: gettext('Physical Device'),
    field: 'physical_device',
    align: 'left',
  },
  {
    name: 'size',
    label: gettext('Size'),
    field: (row) => formatBytes(row.size as number),
    align: 'right',
  },
  {
    name: 'support_discard',
    label: 'Discard',
    field: (row) => textValue(row.support_discard) || '-',
    align: 'left',
  },
  {
    name: 'dev_node',
    label: gettext('Device node'),
    field: (row) => textValue(row.dev_node) || '-',
    align: 'left',
  },
];

async function loadDetails() {
  if (!visible.value || !node || !osdId) return;
  loading.value = true;
  try {
    const response = await getCephOsdMetadata(node, osdId);
    if (!visible.value) return;
    metadata.value = response.data || {};
    devices.value = Array.isArray(response.data?.devices)
      ? (response.data.devices as PveRecord[])
      : [];
    const blockDevice = devices.value.find((device) => textValue(device.device) === 'block');
    selectedDevices.value = blockDevice ? [blockDevice] : [];
    if (blockDevice) await loadVolumeDetails(blockDevice);
  } finally {
    loading.value = false;
  }
}

async function loadVolumeDetails(device?: PveRecord) {
  const type = textValue(device?.device);
  if (!type || !node || !osdId) return;
  const response = await getCephOsdLvInfo(node, osdId, type);
  volumeDetails.value = response.data || {};
}

watch([visible, () => node, () => osdId], () => void loadDetails());
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      class="osd-detail-window"
      width="920px"
      height="min(720px, 85vh)"
      :title="`${gettext('Details')}: OSD ${osdId}`"
      :loading="loading"
    >
      <div class="osd-identity">
        <div class="osd-identity-icon">
          <q-icon
            name="storage"
            size="24px"
          />
        </div>
        <div class="osd-identity-text">
          <div class="osd-identity-name">osd.{{ osdId }}</div>
          <div class="osd-identity-meta">
            <q-icon
              name="dns"
              size="14px"
            />
            <span>{{ node }}</span>
          </div>
        </div>
        <div class="osd-identity-count">
          <span>{{ devices.length }}</span>
          {{ gettext('Devices') }}
        </div>
      </div>
      <q-tabs
        v-model="tab"
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="osd-detail-tabs"
      >
        <q-tab
          name="general"
          icon="tune"
          :label="gettext('General')"
        />
        <q-tab
          name="devices"
          icon="storage"
          :label="gettext('Devices')"
        />
      </q-tabs>
      <q-separator />
      <q-tab-panels
        v-model="tab"
        class="osd-detail-panels"
      >
        <q-tab-panel
          name="general"
          class="osd-detail-panel"
        >
          <section class="detail-section">
            <div class="detail-panel-heading">
              <q-icon
                name="list_alt"
                color="primary"
                size="18px"
              />
              <span>{{ gettext('General') }}</span>
            </div>
            <div class="detail-list">
              <div
                v-for="[key, value] in generalRows"
                :key="key"
                class="detail-row"
              >
                <span class="detail-key">{{ key }}</span>
                <span class="detail-value">{{ textValue(value, '-') }}</span>
              </div>
              <div
                v-if="!generalRows.length"
                class="detail-empty"
              >
                {{ gettext('No details available') }}
              </div>
            </div>
          </section>
        </q-tab-panel>
        <q-tab-panel
          name="devices"
          class="osd-detail-panel"
        >
          <section class="detail-section">
            <div class="detail-panel-heading">
              <q-icon
                name="storage"
                color="primary"
                size="18px"
              />
              <span>{{ gettext('Devices') }}</span>
              <span class="detail-panel-count">{{ devices.length }}</span>
            </div>
            <q-table
              v-model:selected="selectedDevices"
              flat
              dense
              hide-bottom
              row-key="device"
              selection="single"
              table-header-class="u-table-header"
              class="device-table"
              :rows="devices"
              :columns="deviceColumns"
              :loading="loading"
              :rows-per-page-options="[0]"
              :pagination="{ rowsPerPage: 0 }"
              :no-data-label="gettext('no record can be found')"
              @update:selected="(selection) => void loadVolumeDetails(selection[0])"
            >
              <template #body-cell-device="props">
                <q-td :props="props">
                  <div class="device-name">
                    <q-icon
                      name="storage"
                      color="primary"
                      size="17px"
                    />
                    <span>{{ props.value }}</span>
                  </div>
                </q-td>
              </template>
            </q-table>
          </section>

          <section
            v-if="selectedDevices[0]"
            class="detail-section volume-details"
          >
            <div class="volume-heading">
              <q-icon
                name="database"
                color="primary"
                size="18px"
              />
              <span>{{ gettext('Volume Details') }}</span>
              <span class="volume-device">{{ selectedDevices[0].device }}</span>
            </div>
            <div class="detail-list">
              <div
                v-for="[key, value] in Object.entries(volumeDetails)"
                :key="key"
                class="detail-row"
              >
                <span class="detail-key">{{ key }}</span>
                <span class="detail-value">{{ textValue(value, '-') }}</span>
              </div>
              <div
                v-if="!Object.keys(volumeDetails).length"
                class="detail-empty"
              >
                {{ gettext('No details available') }}
              </div>
            </div>
          </section>
        </q-tab-panel>
      </q-tab-panels>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Close')"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.osd-detail-window {
  display: flex;
  flex-direction: column;
}
.osd-detail-window :deep(.u-hidden-error) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.osd-identity {
  align-items: center;
  background: #ffffff;
  border-bottom: 1px solid #dfe1e6;
  display: flex;
  min-height: 64px;
  padding: 10px 16px;
}
.osd-identity-icon {
  align-items: center;
  background: #1976d2;
  color: #ffffff;
  display: flex;
  height: 38px;
  justify-content: center;
  width: 38px;
}
.osd-identity-text {
  margin-left: 12px;
}
.osd-identity-name {
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
}
.osd-identity-meta {
  align-items: center;
  color: #667085;
  display: flex;
  font-size: 12px;
  gap: 5px;
  margin-top: 3px;
}
.osd-identity-count {
  color: #667085;
  font-size: 12px;
  margin-left: auto;
}
.osd-identity-count span {
  color: #1976d2;
  font-size: 16px;
  font-weight: 600;
  margin-right: 3px;
}
.osd-detail-tabs {
  background: #f8fafc;
  color: #475467;
  flex: 0 0 auto;
  min-height: 36px;
}
.osd-detail-tabs :deep(.q-tab) {
  min-height: 40px;
  padding: 0 18px;
}
.osd-detail-tabs :deep(.q-tab--active) {
  background: #ffffff;
}
.osd-detail-panels {
  background: #ffffff;
  color: #333333;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.osd-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0;
}
.detail-section {
  background: #ffffff;
}
.detail-panel-heading,
.volume-heading {
  align-items: center;
  border-bottom: 1px solid #dfe1e6;
  color: #344054;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
  min-height: 42px;
  padding: 0 16px;
}
.detail-panel-count {
  background: #e6f1fc;
  color: #155a9c;
  font-size: 11px;
  font-weight: 500;
  margin-left: 2px;
  min-width: 22px;
  padding: 1px 6px;
  text-align: center;
}
.detail-list {
  padding: 6px 16px 14px;
}
.detail-row {
  display: grid;
  font-size: 12px;
  gap: 24px;
  grid-template-columns: minmax(180px, 30%) minmax(0, 1fr);
  line-height: 1.5;
  min-height: 36px;
  padding: 9px 10px;
}
.detail-row:nth-child(even) {
  background: #f8fafc;
}
.detail-row:hover {
  background: #eef6ff;
}
.detail-key {
  color: #475467;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.detail-value {
  color: #1f2937;
  font-family: Consolas, 'Courier New', monospace;
  overflow-wrap: anywhere;
  user-select: text;
}
.detail-empty {
  color: #999999;
  font-size: 12px;
  padding: 24px 0;
  text-align: center;
}
.device-table {
  max-width: 100%;
}
.device-name {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}
.device-table :deep(tbody tr.q-tr--selected) {
  background: #e6f1fc;
}
.volume-details {
  border-top: 1px solid #dfe1e6;
  flex: 0 0 auto;
}
.volume-heading {
  border-bottom-color: #e5e7eb;
}
.volume-device {
  background: #eef6ff;
  color: #155a9c;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 11px;
  font-weight: 500;
  margin-left: 4px;
  padding: 2px 7px;
}
</style>
