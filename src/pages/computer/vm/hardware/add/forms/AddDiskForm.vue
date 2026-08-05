<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { gettext } from '@/locale';

export interface AddDiskFormModel {
  diskBus: 'scsi' | 'virtio' | 'sata' | 'ide';
  diskDeviceId: number;
  storage: string;
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
const { scsiControllerLabel } = defineProps<{ scsiControllerLabel: string }>();
const supportsIoThread = computed(
  () => form.value.diskBus === 'scsi' || form.value.diskBus === 'virtio',
);
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
      <q-tab name="disk" :label="gettext('Hard Disk')" />
      <q-tab name="bandwidth" :label="gettext('Bandwidth')" />
    </q-tabs>
    <div v-show="activeTab === 'disk'" class="q-pa-md bg-white add-disk-editor">
      <div class="row q-gutter-lg add-disk-editor-fields">
        <div class="col">
          <div class="row q-gutter-sm">
            <q-select
              v-model="form.diskBus"
              class="col q-field--with-bottom"
              dense
              options-dense
              emit-value
              map-options
              :label="gettext('Bus')"
              :options="[
                { label: 'SCSI', value: 'scsi' },
                { label: 'VirtIO Block', value: 'virtio' },
                { label: 'SATA', value: 'sata' },
                { label: 'IDE', value: 'ide' },
              ]"
            />
            <q-input
              v-model.number="form.diskDeviceId"
              class="q-field--with-bottom"
              dense
              type="number"
              min="0"
              style="width: 100px"
              :label="gettext('Device ID')"
            />
          </div>
          <q-input
            v-if="form.diskBus === 'scsi'"
            :model-value="scsiControllerLabel"
            class="q-field--with-bottom"
            dense
            readonly
            :label="gettext('SCSI Controller')"
          />
          <q-input
            v-model="form.storage"
            class="q-field--with-bottom"
            dense
            :label="gettext('Storage')"
            hint="local-lvm"
          />
          <q-input
            v-model.number="form.size"
            class="q-field--with-bottom"
            dense
            type="number"
            min="0"
            step="1"
            :label="gettext('Disk Size (GiB)')"
          />
          <q-select
            v-model="form.diskFormat"
            class="q-field--with-bottom"
            dense
            options-dense
            emit-value
            map-options
            :label="gettext('Disk Format')"
            :options="[
              { label: 'raw', value: 'raw' },
              { label: 'qcow2', value: 'qcow2' },
              { label: 'vmdk', value: 'vmdk' },
            ]"
          />
        </div>
        <div class="col">
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
          <q-field borderless>
            <q-checkbox
              v-model="form.diskDiscard"
              class="checkboxClass"
              dense
              right-label
              color="primary"
              :label="gettext('Discard')"
            />
          </q-field>
          <q-field borderless>
            <q-checkbox
              v-model="form.diskIothread"
              class="q-field--with-bottom checkboxClass"
              dense
              right-label
              color="primary"
              :disable="!supportsIoThread"
              label="IO thread"
            />
          </q-field>
        </div>
      </div>
      <div v-if="advanced" class="u-border-dotted-blue q-px-md q-py-sm bg-white q-mt-sm">
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-field borderless dense>
              <q-checkbox
                v-model="form.diskSsd"
                dense
                right-label
                color="primary"
                :disable="form.diskBus === 'virtio'"
                :label="gettext('SSD emulation')"
              />
            </q-field>
          </div>
          <div class="col-6">
            <q-field borderless dense>
              <q-checkbox
                v-model="form.diskReadOnly"
                dense
                right-label
                color="primary"
                :disable="!supportsIoThread"
                :label="gettext('Readonly')"
              />
            </q-field>
          </div>
          <div class="col-6">
            <q-field borderless dense>
              <q-checkbox
                v-model="form.diskBackup"
                dense
                right-label
                color="primary"
                :label="gettext('Backup')"
              />
            </q-field>
          </div>
          <div class="col-6">
            <q-field borderless dense>
              <q-checkbox
                v-model="form.diskSkipReplication"
                dense
                right-label
                color="primary"
                :label="gettext('Skip replication')"
              />
            </q-field>
          </div>
          <div class="col-12">
            <q-select
              v-model="form.diskAio"
              class="q-field--with-bottom"
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
          </div>
        </div>
      </div>
    </div>
    <div v-show="activeTab === 'bandwidth'" class="q-pt-md">
      <div class="row q-col-gutter-sm">
        <div class="col-6">
          <q-input
            v-model="form.mbps_rd"
            class="q-field--with-bottom"
            dense
            type="number"
            min="1"
            :label="`${gettext('Read limit')} (MB/s)`"
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
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hardware-nav-tabs {
  min-height: 34px;
  /* padding: 0 6px; */
  background: #f5f7fa;
  border: 1px solid #d8e0ea;
  border-radius: 3px 3px 0 0;
}

.hardware-nav-tabs :deep(.q-tabs__content) {
  align-items: flex-end;
}

.hardware-nav-tabs :deep(.q-tab) {
  min-height: 34px;
  padding: 0 14px;
  text-transform: none;
}

.hardware-nav-tabs :deep(.q-tab__label) {
  font-size: 12px;
  line-height: 1.2;
}

.hardware-nav-tabs :deep(.q-tab--active) {
  background: #fff;
}

.hardware-nav-tabs :deep(.q-tab__indicator) {
  height: 2px;
}

.add-disk-editor {
  margin-top: 8px;
}

.add-disk-editor :deep(.q-checkbox--dense .q-checkbox__label) {
  color: #333;
}

.checkboxClass {
  color: #333 !important;
}
</style>
