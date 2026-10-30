<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { QTableColumn } from 'quasar';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { validBandwidth, validDiskSize } from '../../utils/diskController';

export interface AddDiskFormModel {
  diskBus: 'scsi' | 'virtio' | 'sata' | 'ide';
  diskDeviceId: number;
  storage: string;
  existingVolume: string;
  size: number;
  diskFormat: string;
  diskCache: string;
  diskBackup: boolean;
  diskSkipReplication: boolean;
  diskDiscard: boolean;
  diskIothread: boolean;
  diskSsd: boolean;
  diskReadOnly: boolean;
  diskAio: string;
  mbps_rd: string;
  mbps_wr: string;
  iops_rd: string;
  iops_wr: string;
  mbps_rd_max: string;
  mbps_wr_max: string;
  iops_rd_max: string;
  iops_wr_max: string;
}

const form = defineModel<AddDiskFormModel>('form', { required: true });
const advanced = defineModel<boolean>('advanced', { default: false });
const { scsiControllerLabel, storageRows, storageFormats, selectExisting, existingVolumes, busOptions, deviceValid, validationAttempted } = defineProps<{
  scsiControllerLabel: string;
  storageRows: PveRecord[];
  storageFormats: string[];
  selectExisting: boolean;
  existingVolumes: PveRecord[];
  busOptions: { label: string; value: AddDiskFormModel['diskBus'] }[];
  deviceValid: boolean;
  validationAttempted: boolean;
}>();
const storageColumns: QTableColumn<PveRecord>[] = [
  { name: 'storage', label: gettext('Storage'), field: 'storage', align: 'left' },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
];
const imageColumns: QTableColumn<PveRecord>[] = [
  { name: 'volid', label: gettext('Disk image'), field: 'volid', align: 'left' },
  { name: 'format', label: gettext('Disk Format'), field: 'format', align: 'left' },
];
const supportsIoThread = computed(
  () => form.value.diskBus === 'scsi' || form.value.diskBus === 'virtio',
);
const storageValid = computed(() =>
  storageRows.some((item) => typeof item.storage === 'string' && item.storage === form.value.storage),
);
const existingVolumeValid = computed(() =>
  existingVolumes.some((item) => {
    const volume = typeof item.volid === 'string' && item.volid ? item.volid : item.text;
    return typeof volume === 'string' && volume === form.value.existingVolume;
  }),
);
const mbpsValid = (value: string) => validBandwidth(value, 1);
const iopsValid = (value: string) => validBandwidth(value, 10, true);
const activeTab = shallowRef<'disk' | 'bandwidth'>('disk');
</script>

<template>
  <div class="add-disk-form u-dense">
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      active-color="primary"
      indicator-color="primary"
      class="hardware-nav-tabs text-grey-7"
    >
      <q-tab
        name="disk"
        :label="gettext('Hard Disk')"
      />
      <q-tab
        name="bandwidth"
        :label="gettext('Bandwidth')"
      />
    </q-tabs>
    <div
      v-show="activeTab === 'disk'"
      class="add-disk-editor"
    >
      <section class="add-disk-section">
        <h3 class="add-disk-section-title">{{ gettext('Basic Settings') }}</h3>
        <div class="add-disk-primary-row">
          <div class="add-disk-device-row">
            <q-select
              v-model="form.diskBus"
              class="q-field--with-bottom"
              dense
              options-dense
              emit-value
              map-options
              :label="`${gettext('Bus')} *`"
              :options="busOptions"
            />
            <q-input
              v-model.number="form.diskDeviceId"
              class="q-field--with-bottom"
              dense
              type="number"
              min="0"
              :label="`${gettext('Device ID')} *`"
              :error="validationAttempted && !deviceValid"
              :error-message="gettext('This device is already in use')"
            />
          </div>
          <q-select
            v-model="form.diskCache"
            class="q-field--with-bottom"
            dense
            options-dense
            emit-value
            map-options
            :label="gettext('Cache')"
            :options="[
              { label: `${gettext('Default')} (${gettext('No cache')})`, value: '__default__' },
              { label: 'No cache', value: 'none' },
              { label: 'Write through', value: 'writethrough' },
              { label: 'Write back', value: 'writeback' },
              { label: 'Direct sync', value: 'directsync' },
              { label: 'Unsafe', value: 'unsafe' },
            ]"
          />
        </div>
        <q-input
          v-if="form.diskBus === 'scsi'"
          :model-value="scsiControllerLabel"
          class="add-disk-controller q-field--with-bottom"
          dense
          readonly
          :label="gettext('SCSI Controller')"
        />
        <div class="add-disk-storage-row">
          <SelectTable
            v-model="form.storage"
            row-key="storage"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="storageRows"
            :columns="storageColumns"
            :display-value="form.storage"
            :get-row-value="(row) => String(row.storage || '')"
            :label="`${gettext('Storage')} *`"
            :error="validationAttempted && !storageValid"
            :error-message="gettext('This field is required')"
          />
          <SelectTable
            v-if="selectExisting"
            v-model="form.existingVolume"
            row-key="volid"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="existingVolumes"
            :columns="imageColumns"
            :display-value="form.existingVolume"
            :get-row-value="(row) => String(row.volid || row.text || '')"
            :label="`${gettext('Disk image')} *`"
            :error="validationAttempted && !existingVolumeValid"
            :error-message="gettext('This field is required')"
          />
          <q-input
            v-else
            v-model.number="form.size"
            class="q-field--with-bottom"
            dense
            type="number"
            min="0"
            step="1"
            :label="`${gettext('Disk Size (GiB)')} *`"
            :error="validationAttempted && !validDiskSize(form.size)"
            :error-message="gettext('Invalid Value')"
          />
          <q-select
            v-model="form.diskFormat"
            class="q-field--with-bottom"
            dense
            options-dense
            emit-value
            map-options
            :label="gettext('Disk Format')"
            :disable="storageFormats.length <= 1"
            :options="storageFormats"
          />
        </div>
        <div class="add-disk-options">
          <q-checkbox
            v-model="form.diskDiscard"
            dense
            right-label
            color="primary"
            :label="gettext('Discard')"
          />
          <q-checkbox
            v-model="form.diskIothread"
            dense
            right-label
            color="primary"
            :disable="!supportsIoThread"
            label="IO thread"
          />
        </div>
      </section>
      <section
        v-if="advanced"
        class="add-disk-section add-disk-section--advanced"
      >
        <h3 class="add-disk-section-title">{{ gettext('Advanced settings') }}</h3>
        <div class="add-disk-advanced-grid">
          <q-checkbox
            v-model="form.diskSsd"
            dense
            right-label
            color="primary"
            :disable="form.diskBus === 'virtio'"
            :label="gettext('SSD emulation')"
          />
          <q-checkbox
            v-model="form.diskReadOnly"
            dense
            right-label
            color="primary"
            :disable="!supportsIoThread"
            :label="gettext('Readonly')"
          />
          <q-checkbox
            v-model="form.diskBackup"
            dense
            right-label
            color="primary"
            :label="gettext('Backup')"
          />
          <q-checkbox
            v-model="form.diskSkipReplication"
            dense
            right-label
            color="primary"
            :label="gettext('Skip replication')"
          />
        </div>
        <q-select
          v-model="form.diskAio"
          class="add-disk-aio q-field--with-bottom"
          dense
          options-dense
          emit-value
          map-options
          :label="gettext('Async IO')"
          :options="[
            { label: `${gettext('Default')} (io_uring)`, value: '__default__' },
            { label: 'io_uring', value: 'io_uring' },
            { label: 'native', value: 'native' },
            { label: 'threads', value: 'threads' },
          ]"
        />
      </section>
    </div>
    <div
      v-show="activeTab === 'bandwidth'"
      class="add-disk-bandwidth"
    >
      <div class="row q-col-gutter-sm">
        <div class="col-6">
          <q-input
            v-model="form.mbps_rd"
            class="q-field--with-bottom"
            dense
            type="number"
            min="1"
            :label="`${gettext('Read limit')} (MB/s)`"
            :error="validationAttempted && !mbpsValid(form.mbps_rd)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_wr"
            class="q-field--with-bottom"
            dense
            type="number"
            min="1"
            :label="`${gettext('Write limit')} (MB/s)`"
            :error="validationAttempted && !mbpsValid(form.mbps_wr)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_rd"
            class="q-field--with-bottom"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Read limit')} (ops/s)`"
            :error="validationAttempted && !iopsValid(form.iops_rd)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_wr"
            class="q-field--with-bottom"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Write limit')} (ops/s)`"
            :error="validationAttempted && !iopsValid(form.iops_wr)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_rd_max"
            class="q-field--with-bottom"
            dense
            type="number"
            min="1"
            :label="`${gettext('Read max burst')} (MB)`"
            :error="validationAttempted && !mbpsValid(form.mbps_rd_max)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_wr_max"
            class="q-field--with-bottom"
            dense
            type="number"
            min="1"
            :label="`${gettext('Write max burst')} (MB)`"
            :error="validationAttempted && !mbpsValid(form.mbps_wr_max)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_rd_max"
            class="q-field--with-bottom"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Read max burst')} (ops)`"
            :error="validationAttempted && !iopsValid(form.iops_rd_max)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_wr_max"
            class="q-field--with-bottom"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Write max burst')} (ops)`"
            :error="validationAttempted && !iopsValid(form.iops_wr_max)"
            :error-message="gettext('Invalid Value')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-disk-form {
  max-height: calc(100vh - 150px);
  overflow-y: auto;
}

.hardware-nav-tabs {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 40px;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
}

.hardware-nav-tabs :deep(.q-tab) {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0 18px;
  text-transform: none;
}

.hardware-nav-tabs :deep(.q-tab__indicator) {
  height: 3px;
}

.add-disk-editor,
.add-disk-bandwidth {
  padding: 20px 24px 24px;
}

.add-disk-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  color: #333;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}

.add-disk-section-title::before {
  content: '';
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: #1976d2;
}

.add-disk-primary-row,
.add-disk-advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 24px;
}

.add-disk-advanced-grid {
  row-gap: 22px;
}

.add-disk-device-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(90px, 1fr);
  gap: 16px;
}

.add-disk-storage-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.add-disk-primary-row > *,
.add-disk-device-row > *,
.add-disk-storage-row > * {
  min-width: 0;
}

.add-disk-controller {
  width: calc(50% - 12px);
  margin-top: 8px;
}

.add-disk-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px;
  margin-top: 8px;
}

.add-disk-section--advanced {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #dfe1e6;
}

.add-disk-aio {
  margin-top: 12px;
}

.add-disk-editor :deep(.q-checkbox--dense .q-checkbox__label) {
  color: #333;
}

@media (max-width: 700px) {
  .add-disk-primary-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .add-disk-controller {
    width: 100%;
  }

  .add-disk-storage-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .add-disk-storage-row > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 500px) {
  .add-disk-editor,
  .add-disk-bandwidth {
    padding: 16px;
  }

  .add-disk-storage-row,
  .add-disk-advanced-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .add-disk-bandwidth .col-6 {
    width: 100%;
  }
}
</style>
