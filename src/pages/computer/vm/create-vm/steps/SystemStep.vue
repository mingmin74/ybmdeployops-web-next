<script setup lang="ts">
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, resources, errors, options, disks, derived } = useCreateVmWizardContext();
const { validationErrors } = errors;
const { imageStorageRows, storageNames } = resources;
const { vgaOptions, machineOptions, scsiControllerOptions, tpmFormatOptions, isoStorageColumns } =
  options;
const { tpmFormatDisabled } = disks;
const { stepContentHeight } = derived;
</script>

<template>
  <q-scroll-area class="q-pa-sm" :style="{ height: stepContentHeight('system') }">
    <div class="q-px-md q-py-sm u-border-dotted-blue bg-white">
      <div class="row q-gutter-lg">
        <div class="col">
          <q-select
            v-model="form.vga"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="vgaOptions"
            :label="gettext('Graphic card')"
          />
          <q-select
            v-model="form.machine"
            dense
            options-dense
            emit-value
            map-options
            :options="machineOptions"
            :label="gettext('Machine')"
          />
        </div>
        <div class="col">
          <q-select
            v-model="form.scsihw"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="scsiControllerOptions"
            :label="gettext('SCSI Controller')"
          />
          <q-checkbox
            v-model="form.agent"
            dense
            right-label
            color="primary"
            :label="gettext('Qemu Agent')"
          />
        </div>
      </div>
    </div>
    <div class="q-mt-sm u-border-dotted-blue q-px-md q-py-sm bg-white">
      <div class="q-field--with-bottom">{{ gettext('Firmware') }}</div>
      <div class="row q-gutter-lg">
        <div class="col">
          <q-select
            v-model="form.bios"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="[
              { label: gettext('Default'), value: '__default__' },
              { label: 'SeaBIOS', value: 'seabios' },
              { label: 'OVMF (UEFI)', value: 'ovmf' },
            ]"
            label="BIOS"
          />
          <q-checkbox
            v-if="form.bios === 'ovmf'"
            v-model="form.addEfiDisk"
            dense
            right-label
            color="primary"
            :label="gettext('Add EFI Disk')"
          />
          <template v-if="form.bios === 'ovmf' && form.addEfiDisk">
            <q-select
              v-model="form.efiStorage"
              :error="Boolean(validationErrors.efiStorage)"
              :error-message="validationErrors.efiStorage"
              dense
              options-dense
              class="q-field--with-bottom"
              :options="storageNames"
              :label="gettext('EFI Storage')"
            />
            <q-select
              v-model="form.efiFormat"
              dense
              options-dense
              :options="['raw', 'qcow2']"
              :label="gettext('Format')"
            />
            <q-checkbox
              v-model="form.preEnrolledKeys"
              dense
              right-label
              color="primary"
              :label="gettext('Pre-Enroll keys')"
            />
          </template>
        </div>
        <div class="col">
          <q-checkbox
            v-model="form.addTpm"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Add TPM')"
          />
          <template v-if="form.addTpm">
            <SelectTable
              v-model="form.tpmStorage"
              row-key="storage"
              field-style="standard"
              width="500px"
              :rows="imageStorageRows"
              :columns="isoStorageColumns"
              :display-value="form.tpmStorage"
              :get-row-value="(row) => textValue(row.storage)"
              :error="Boolean(validationErrors.tpmStorage)"
              :error-message="validationErrors.tpmStorage || ''"
              :label="gettext('TPM Storage')"
            />
            <q-select
              v-model="form.tpmFormat"
              dense
              options-dense
              emit-value
              map-options
              class="q-field--with-bottom"
              :disable="tpmFormatDisabled(form.tpmStorage)"
              :options="tpmFormatOptions"
              :label="gettext('Format')"
            />
            <q-select
              v-model="form.tpmVersion"
              dense
              options-dense
              :options="['v1.2', 'v2.0']"
              :label="gettext('Version')"
            />
          </template>
        </div>
      </div>
    </div>
  </q-scroll-area>
</template>
