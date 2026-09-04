<script setup lang="ts">
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, state, resources, errors, options, disks, derived } = useCreateVmWizardContext();
const { advanced, activeDiskId, activeDiskTab, diskSplitter } = state;
const { importStorageRows, importImageRows } = resources;
const { validationErrors } = errors;
const {
  diskBusOptions,
  diskBusSlotLimits,
  cacheOptions,
  aioOptions,
  isoStorageColumns,
  importImageColumns,
} = options;
const {
  extraDisks,
  primaryDiskKey,
  diskCount,
  diskAddDisabled,
  diskValidation,
  addExtraDisk,
  addImportDisk,
  removeExtraDisk,
  removePrimaryDisk,
  loadImportImages,
  diskFormatOptions,
  diskFormatDisabled,
} = disks;
const { diskStorageRows, scsiControllerLabel, stepContentHeight } = derived;
</script>

<template>
  <q-scroll-area class="q-pa-sm" :style="{ height: stepContentHeight('disks') }">
    <q-splitter v-model="diskSplitter" unit="%" class="u-border-dotted-blue bg-white vm-disk-panel">
      <template #before>
        <div class="q-pa-sm vm-disk-nav">
          <div class="q-mb-sm vm-disk-actions">
            <q-btn
              no-caps
              flat
              size="sm"
              :disable="diskAddDisabled"
              class="bg-primary text-grey-1 u-button vm-disk-action"
              @click="addExtraDisk"
            >
              <q-icon name="add_circle" size="14px" /><span class="q-ml-xs">{{
                gettext('Add')
              }}</span>
            </q-btn>
            <q-btn
              no-caps
              flat
              size="sm"
              :disable="diskAddDisabled"
              class="bg-primary text-grey-1 u-button vm-disk-action"
              @click="addImportDisk"
            >
              <q-icon name="cloud_upload" size="14px" /><span class="q-ml-xs">{{
                gettext('Import')
              }}</span>
            </q-btn>
          </div>
          <q-list dense bordered separator class="vm-disk-list">
            <q-item
              dense
              clickable
              :active="activeDiskId === 'primary'"
              active-class="bg-blue-1 text-primary"
              @click="activeDiskId = 'primary'"
            >
              <q-item-section>
                <div class="flex items-center">
                  {{ primaryDiskKey }}
                  <q-icon v-if="!diskValidation.primary" name="warning" class="warning q-ml-xs" />
                </div>
              </q-item-section>
              <q-item-section v-if="diskCount > 1" side avatar>
                <q-icon
                  name="remove_circle"
                  class="text-grey-8 vm-disk-remove"
                  @click.stop="removePrimaryDisk"
                />
              </q-item-section>
            </q-item>
            <q-item
              v-for="disk in extraDisks"
              :key="disk.id"
              clickable
              :active="activeDiskId === disk.id"
              active-class="bg-blue-1 text-primary"
              @click="activeDiskId = disk.id"
            >
              <q-item-section>
                <div class="flex items-center">
                  {{ disk.bus }}{{ disk.slot }}
                  <q-icon
                    v-if="!diskValidation.extras[disk.id]"
                    name="warning"
                    class="warning q-ml-xs"
                  />
                </div>
              </q-item-section>
              <q-item-section v-if="diskCount > 1" side avatar>
                <q-icon
                  name="remove_circle"
                  class="text-grey-8 vm-disk-remove"
                  @click.stop="removeExtraDisk(disk.id)"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </template>
      <template #after>
        <div class="q-pa-sm vm-disk-detail">
          <q-tabs
            v-model="activeDiskTab"
            dense
            align="left"
            active-color="primary"
            indicator-color="primary"
            class="text-grey-7"
          >
            <q-tab name="disk" :label="gettext('Hard Disk')" />
            <q-tab name="bandwidth" :label="gettext('Bandwidth')" />
          </q-tabs>
          <q-separator />
          <div class="q-pa-md bg-white vm-disk-editor">
            <template v-if="activeDiskId === 'primary'">
              <div v-show="activeDiskTab === 'disk'" class="row q-gutter-lg vm-disk-editor-fields">
                <div class="col">
                  <div class="row q-gutter-sm">
                    <q-select
                      v-model="form.diskBus"
                      dense
                      options-dense
                      emit-value
                      map-options
                      class="col q-field--with-bottom"
                      :options="diskBusOptions"
                      :label="gettext('Bus')"
                    />
                    <q-input
                      v-model.number="form.diskSlot"
                      :error="Boolean(validationErrors.diskSlot)"
                      :error-message="validationErrors.diskSlot"
                      dense
                      class="q-field--with-bottom"
                      type="number"
                      min="0"
                      style="width: 100px"
                      :max="diskBusSlotLimits[form.diskBus] - 1"
                      :label="gettext('Device ID')"
                    />
                  </div>
                  <q-input
                    v-if="form.diskBus === 'scsi'"
                    :model-value="scsiControllerLabel"
                    dense
                    class="q-field--with-bottom"
                    readonly
                    :label="gettext('SCSI Controller')"
                  />
                  <SelectTable
                    v-model="form.storage"
                    row-key="storage"
                    field-style="standard"
                    width="500px"
                    :error="Boolean(validationErrors.storage)"
                    :error-message="validationErrors.storage || ''"
                    :rows="diskStorageRows"
                    :columns="isoStorageColumns"
                    :display-value="form.storage"
                    :get-row-value="(row) => textValue(row.storage)"
                    :label="gettext('Storage')"
                    class="q-field--with-bottom"
                  />
                  <q-input
                    v-model.number="form.diskSize"
                    :error="Boolean(validationErrors.diskSize)"
                    :error-message="validationErrors.diskSize"
                    dense
                    type="number"
                    min="1"
                    class="q-field--with-bottom"
                    :label="`${gettext('Disk size')} (${gettext('GiB')})`"
                  />
                  <q-select
                    v-model="form.format"
                    :error="Boolean(validationErrors.diskFormat)"
                    :error-message="validationErrors.diskFormat"
                    dense
                    options-dense
                    emit-value
                    map-options
                    class="q-field--with-bottom"
                    :disable="diskFormatDisabled(form.storage)"
                    :options="diskFormatOptions(form.storage)"
                    :label="gettext('Format')"
                  />
                </div>
                <div class="col">
                  <q-select
                    v-model="form.cache"
                    dense
                    options-dense
                    emit-value
                    map-options
                    class="q-field--with-bottom"
                    :label="gettext('Cache')"
                    :options="cacheOptions"
                  />
                  <q-field borderless>
                    <q-checkbox
                      v-model="form.discard"
                      dense
                      right-label
                      color="primary"
                      :label="gettext('Discard')"
                      class="checkboxClass"
                    />
                  </q-field>
                  <q-field borderless>
                    <q-checkbox
                      v-model="form.iothread"
                      dense
                      right-label
                      color="primary"
                      class="q-field--with-bottom checkboxClass"
                      :disable="form.diskBus !== 'scsi' && form.diskBus !== 'virtio'"
                      label="IO thread"
                    />
                  </q-field>
                </div>
              </div>
              <div
                v-if="advanced"
                v-show="activeDiskTab === 'disk'"
                class="u-border-dotted-blue q-px-md q-py-sm bg-white q-mt-md vm-disk-advanced"
              >
                <div class="row q-gutter-lg">
                  <div class="col">
                    <q-field borderless dense>
                      <q-checkbox
                        v-model="form.ssd"
                        dense
                        right-label
                        color="primary"
                        :disable="form.diskBus === 'virtio'"
                        :label="gettext('SSD emulation')"
                        class="checkboxClass"
                      />
                    </q-field>
                    <q-field borderless dense>
                      <q-checkbox
                        v-model="form.readOnly"
                        dense
                        right-label
                        color="primary"
                        :disable="form.diskBus !== 'scsi' && form.diskBus !== 'virtio'"
                        :label="gettext('Readonly')"
                        class="checkboxClass"
                      />
                    </q-field>
                  </div>
                  <div class="col">
                    <q-field borderless dense>
                      <q-checkbox
                        v-model="form.backup"
                        dense
                        right-label
                        color="primary"
                        :label="gettext('Backup')"
                        class="checkboxClass"
                      />
                    </q-field>
                    <q-field borderless dense>
                      <q-checkbox
                        v-model="form.skipReplication"
                        dense
                        right-label
                        color="primary"
                        :label="gettext('Skip replication')"
                        class="checkboxClass"
                      />
                    </q-field>
                    <q-select
                      v-model="form.aio"
                      dense
                      options-dense
                      emit-value
                      map-options
                      class="q-field--with-bottom"
                      :label="gettext('Async IO')"
                      :options="aioOptions"
                    />
                  </div>
                </div>
              </div>
              <div v-show="activeDiskTab === 'bandwidth'" class="q-pt-sm vm-disk-bandwidth">
                <div class="row q-col-gutter-sm">
                  <div class="col-6">
                    <q-input
                      v-model="form.mbpsRead"
                      dense
                      type="number"
                      min="1"
                      class="q-field--with-bottom"
                      :label="`${gettext('Read limit')} (MB/s)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.mbpsWrite"
                      dense
                      type="number"
                      min="1"
                      class="q-field--with-bottom"
                      :label="`${gettext('Write limit')} (MB/s)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.iopsRead"
                      dense
                      type="number"
                      min="10"
                      class="q-field--with-bottom"
                      :label="`${gettext('Read limit')} (ops/s)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.iopsWrite"
                      dense
                      type="number"
                      min="10"
                      class="q-field--with-bottom"
                      :label="`${gettext('Write limit')} (ops/s)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.mbpsReadMax"
                      dense
                      type="number"
                      min="1"
                      class="q-field--with-bottom"
                      :label="`${gettext('Read max burst')} (MB)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.mbpsWriteMax"
                      dense
                      type="number"
                      min="1"
                      class="q-field--with-bottom"
                      :label="`${gettext('Write max burst')} (MB)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.iopsReadMax"
                      dense
                      type="number"
                      min="10"
                      class="q-field--with-bottom"
                      :label="`${gettext('Read max burst')} (ops)`"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="form.iopsWriteMax"
                      dense
                      type="number"
                      min="10"
                      class="q-field--with-bottom"
                      :label="`${gettext('Write max burst')} (ops)`"
                    />
                  </div>
                </div>
              </div>
            </template>
            <template v-for="disk in extraDisks" :key="disk.id"
              ><template v-if="activeDiskId === disk.id"
                ><div v-show="activeDiskTab === 'disk'" class="row q-col-gutter-lg">
                  <template v-if="disk.isImport">
                    <div class="col-12 col-sm-6">
                      <SelectTable
                        v-model="disk.importSourceStorage"
                        row-key="storage"
                        field-style="standard"
                        width="500px"
                        :rows="importStorageRows"
                        :columns="isoStorageColumns"
                        :display-value="disk.importSourceStorage"
                        :get-row-value="(row) => textValue(row.storage)"
                        :error="Boolean(validationErrors[`disk-${disk.id}-import-storage`])"
                        :error-message="validationErrors[`disk-${disk.id}-import-storage`] || ''"
                        :label="gettext('Import Storage')"
                        @update:model-value="
                          (storage) => {
                            disk.importFrom = '';
                            if (typeof storage === 'string') loadImportImages(storage);
                          }
                        "
                      />
                    </div>
                    <div class="col-12 col-sm-6">
                      <SelectTable
                        v-model="disk.importFrom"
                        row-key="volid"
                        field-style="standard"
                        fixed-layout
                        width="500px"
                        :rows="importImageRows[disk.importSourceStorage] || []"
                        :columns="importImageColumns"
                        :display-value="disk.importFrom"
                        :get-row-value="(row) => textValue(row.volid)"
                        :disable="!disk.importSourceStorage"
                        :error="Boolean(validationErrors[`disk-${disk.id}-import-from`])"
                        :error-message="validationErrors[`disk-${disk.id}-import-from`] || ''"
                        :label="gettext('Select Image')"
                      />
                    </div>
                  </template>
                  <div class="col-12">
                    <div class="row q-gutter-lg vm-disk-editor-fields">
                      <div class="col">
                        <div class="row q-gutter-sm">
                          <q-select
                            v-model="disk.bus"
                            dense
                            options-dense
                            emit-value
                            map-options
                            class="col q-field--with-bottom"
                            :options="diskBusOptions"
                            :label="gettext('Bus')"
                          />
                          <q-input
                            v-model.number="disk.slot"
                            :error="Boolean(validationErrors[`disk-${disk.id}-slot`])"
                            :error-message="validationErrors[`disk-${disk.id}-slot`]"
                            dense
                            type="number"
                            min="0"
                            style="width: 100px"
                            :max="diskBusSlotLimits[disk.bus] - 1"
                            :label="gettext('Device ID')"
                          />
                        </div>
                        <q-input
                          v-if="disk.bus === 'scsi'"
                          :model-value="scsiControllerLabel"
                          dense
                          class="q-field--with-bottom"
                          readonly
                          :label="gettext('SCSI Controller')"
                        />
                        <SelectTable
                          v-model="disk.storage"
                          row-key="storage"
                          field-style="standard"
                          width="500px"
                          class="q-field--with-bottom"
                          :error="Boolean(validationErrors[`disk-${disk.id}-storage`])"
                          :error-message="validationErrors[`disk-${disk.id}-storage`] || ''"
                          :rows="diskStorageRows"
                          :columns="isoStorageColumns"
                          :display-value="disk.storage"
                          :get-row-value="(row) => textValue(row.storage)"
                          :label="gettext('Storage')"
                        />
                        <q-input
                          v-if="!disk.isImport"
                          v-model.number="disk.size"
                          :error="Boolean(validationErrors[`disk-${disk.id}-size`])"
                          :error-message="validationErrors[`disk-${disk.id}-size`]"
                          dense
                          type="number"
                          min="1"
                          class="q-field--with-bottom"
                          :label="`${gettext('Disk size')} (${gettext('GiB')})`"
                        />
                        <q-select
                          v-model="disk.format"
                          :error="Boolean(validationErrors[`disk-${disk.id}-format`])"
                          :error-message="validationErrors[`disk-${disk.id}-format`]"
                          dense
                          options-dense
                          emit-value
                          map-options
                          class="q-field--with-bottom"
                          :disable="diskFormatDisabled(disk.storage)"
                          :options="diskFormatOptions(disk.storage)"
                          :label="gettext('Format')"
                        />
                      </div>
                      <div class="col">
                        <q-select
                          v-model="disk.cache"
                          dense
                          options-dense
                          emit-value
                          map-options
                          class="q-field--with-bottom"
                          :label="gettext('Cache')"
                          :options="cacheOptions"
                        />
                        <q-field borderless>
                          <q-checkbox
                            v-model="disk.discard"
                            dense
                            right-label
                            color="primary"
                            :label="gettext('Discard')"
                            class="checkboxClass"
                          />
                        </q-field>
                        <q-field borderless>
                          <q-checkbox
                            v-model="disk.iothread"
                            dense
                            right-label
                            color="primary"
                            class="q-field--with-bottom checkboxClass"
                            :disable="disk.bus !== 'scsi' && disk.bus !== 'virtio'"
                            label="IO thread"
                          />
                        </q-field>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-if="advanced"
                  v-show="activeDiskTab === 'disk'"
                  class="u-border-dotted-blue q-px-md q-py-sm bg-white q-mt-md vm-disk-advanced"
                >
                  <div class="row q-gutter-lg">
                    <div class="col">
                      <q-field borderless dense>
                        <q-checkbox
                          v-model="disk.ssd"
                          dense
                          right-label
                          color="primary"
                          :disable="disk.bus === 'virtio'"
                          :label="gettext('SSD emulation')"
                          class="checkboxClass"
                        />
                      </q-field>
                      <q-field borderless dense>
                        <q-checkbox
                          v-model="disk.readOnly"
                          dense
                          right-label
                          color="primary"
                          :disable="disk.bus !== 'scsi' && disk.bus !== 'virtio'"
                          :label="gettext('Readonly')"
                          class="checkboxClass"
                        />
                      </q-field>
                    </div>
                    <div class="col">
                      <q-field borderless dense>
                        <q-checkbox
                          v-model="disk.backup"
                          dense
                          right-label
                          color="primary"
                          :label="gettext('Backup')"
                          class="checkboxClass"
                        />
                      </q-field>
                      <q-field borderless dense>
                        <q-checkbox
                          v-model="disk.skipReplication"
                          dense
                          right-label
                          color="primary"
                          :label="gettext('Skip replication')"
                          class="checkboxClass"
                        />
                      </q-field>
                      <q-select
                        v-model="disk.aio"
                        dense
                        options-dense
                        emit-value
                        map-options
                        class="q-field--with-bottom"
                        :label="gettext('Async IO')"
                        :options="aioOptions"
                      />
                    </div>
                  </div>
                </div>
                <div v-show="activeDiskTab === 'bandwidth'" class="q-pt-sm vm-disk-bandwidth">
                  <div class="row q-col-gutter-sm">
                    <div class="col-6">
                      <q-input
                        v-model="disk.mbpsRead"
                        dense
                        type="number"
                        min="1"
                        class="q-field--with-bottom"
                        :label="`${gettext('Read limit')} (MB/s)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.mbpsWrite"
                        dense
                        type="number"
                        min="1"
                        class="q-field--with-bottom"
                        :label="`${gettext('Write limit')} (MB/s)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.iopsRead"
                        dense
                        type="number"
                        min="10"
                        class="q-field--with-bottom"
                        :label="`${gettext('Read limit')} (ops/s)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.iopsWrite"
                        dense
                        type="number"
                        min="10"
                        class="q-field--with-bottom"
                        :label="`${gettext('Write limit')} (ops/s)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.mbpsReadMax"
                        dense
                        type="number"
                        min="1"
                        class="q-field--with-bottom"
                        :label="`${gettext('Read max burst')} (MB)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.mbpsWriteMax"
                        dense
                        type="number"
                        min="1"
                        class="q-field--with-bottom"
                        :label="`${gettext('Write max burst')} (MB)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.iopsReadMax"
                        dense
                        type="number"
                        min="10"
                        class="q-field--with-bottom"
                        :label="`${gettext('Read max burst')} (ops)`"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="disk.iopsWriteMax"
                        dense
                        type="number"
                        min="10"
                        class="q-field--with-bottom"
                        :label="`${gettext('Write max burst')} (ops)`"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </template>
    </q-splitter>
  </q-scroll-area>
</template>

<style scoped>
.vm-disk-panel {
  height: 450px;
}

.vm-disk-nav {
  min-width: 0;
}

.vm-disk-list :deep(.q-item) {
  min-height: 30px;
  padding: 3px 8px;
}

.vm-disk-list :deep(.q-item__section--side) {
  padding-left: 4px;
}

.vm-disk-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.vm-disk-action {
  width: 100%;
  min-width: 0;
  white-space: nowrap;
}

.vm-disk-action :deep(.q-btn__content) {
  flex-wrap: nowrap;
}

.vm-disk-remove {
  font-size: 14px !important;
  cursor: pointer;
}

.warning {
  color: #f2a000;
  font-size: 14px;
}

.vm-disk-detail {
  min-width: 0;
}

.vm-disk-editor {
  margin-top: 8px;
}

.vm-disk-editor :deep(.q-checkbox--dense .q-checkbox__label) {
  color: #333;
}

.checkboxClass {
  color: #333 !important;
}

@media (max-width: 599px) {
  .vm-disk-panel > .row {
    flex-wrap: wrap;
  }

  .vm-disk-nav {
    width: 100%;
    min-width: 0;
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
}
</style>
