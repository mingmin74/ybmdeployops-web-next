<script setup lang="ts">
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, resources, errors, options, derived } = useCreateVmWizardContext();
const { validationErrors } = errors;
const { isoStorageRows, isoImageRows } = resources;
const { osBaseOptions, osVersionOptions, isoStorageColumns, isoImageColumns } = options;
const { isoImageName, stepContentHeight } = derived;
</script>

<template>
  <q-form @submit.prevent>
    <q-scroll-area class="q-pa-sm u-size-13" :style="{ height: stepContentHeight('os') }">
      <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <div class="col column q-ml-md">
          <q-radio
            v-model="form.mediaType"
            val="iso"
            :label="gettext('Use CD/DVD disc image file (iso)')"
          />
          <div class="q-ml-xl">
            <SelectTable
              v-model="form.isoStorage"
              row-key="storage"
              field-style="standard"
              width="500px"
              style="width: 320px"
              :rows="isoStorageRows"
              :columns="isoStorageColumns"
              :display-value="form.isoStorage"
              :get-row-value="(row) => textValue(row.storage)"
              :disable="form.mediaType !== 'iso'"
              :error="Boolean(validationErrors.isoStorage)"
              :error-message="validationErrors.isoStorage || ''"
              :label="gettext('Storage')"
                class="q-field--with-bottom"
            />
            <SelectTable
              v-if="form.mediaType === 'iso'"
              v-model="form.cdrom"
              row-key="volid"
              field-style="standard"
              width="500px"
              style="width: 320px"
              :rows="isoImageRows"
              :columns="isoImageColumns"
              :display-value="isoImageName(form.cdrom)"
              :get-row-value="(row) => textValue(row.volid)"
              :error="Boolean(validationErrors.cdrom)"
              :error-message="validationErrors.cdrom || ''"
              :label="gettext('ISO image')"
                class="q-field--with-bottom"
            />
            <q-select
              v-else
              v-model="form.cdrom"
              dense
              disable
              class="q-field--with-bottom"
              style="width: 320px"
              :label="gettext('ISO image')"
            />
          </div>
          <q-radio
            v-model="form.mediaType"
            val="cdrom"
            :label="gettext('Use physical CD/DVD Drive')"
          />
          <q-radio
            v-model="form.mediaType"
            val="none"
            :label="gettext('Do not use any media')"
          />
        </div>
        <div class="col column">
          <div style="line-height: 40px">{{ gettext('Guest OS') }}:</div>
          <q-select
            v-model="form.osbase"
            dense
            options-dense
            emit-value
            map-options
            :label="gettext('Type')"
            class="q-field--with-bottom"
            :options="osBaseOptions"
          />
          <q-select
            v-model="form.ostype"
            dense
            options-dense
            emit-value
            map-options
            :label="gettext('Version')"
            class="q-field--with-bottom"
            :options="osVersionOptions"
          />
          <q-checkbox
            v-if="form.osbase === 'Microsoft Windows'"
            v-model="form.enableVirtioDrivers"
            dense
            right-label
            color="primary"
            :label="gettext('Add additional drive for VirtIO drivers')"
          />
          <div v-if="form.enableVirtioDrivers" class="q-ml-lg q-pt-md">
            <SelectTable
              v-model="form.virtioDriversCdrom"
              row-key="volid"
              field-style="standard"
              width="500px"
              style="width: 320px"
              :rows="isoImageRows"
              :columns="isoImageColumns"
              :display-value="isoImageName(form.virtioDriversCdrom)"
              :get-row-value="(row) => textValue(row.volid)"
              :error="Boolean(validationErrors.virtioDriversCdrom)"
              :error-message="validationErrors.virtioDriversCdrom || ''"
              :label="gettext('ISO image')"
            />
          </div>
        </div>
      </div>
      </div>
    </q-scroll-area>
  </q-form>
</template>
