<script setup lang="ts">
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, state, errors, resources, options, actions, derived } = useCreateVmWizardContext();
const { advanced } = state;
const { validationErrors } = errors;
const { cpuFlags } = resources;
const { cpuModelColumns, cpuFlagColumns, cpuFlagStateOptions } = options;
const { setCpuFlagState } = actions;
const { totalCores, cpuModelRows, cpuModelDisplayValue, cpuFlagState, stepContentHeight } = derived;
</script>

<template>
<q-scroll-area class="q-pa-sm" :style="{ height: stepContentHeight('cpu') }">
            <div class="q-px-md q-py-sm u-border-dotted-blue bg-white">
              <div class="row q-gutter-lg ">
                <div class="col">
                  <q-input
                    v-model.number="form.sockets"
                    :error="Boolean(validationErrors.sockets)"
                    :error-message="validationErrors.sockets"
                    dense
                    type="number"
                    min="1"
                    max="256"
                    class="q-field--with-bottom"
                    :label="gettext('Sockets')"
                  />
                  <q-input
                    v-model.number="form.cores"
                    :error="Boolean(validationErrors.cores)"
                    :error-message="validationErrors.cores"
                    dense
                    type="number"
                    min="1"
                    max="256"
                    :label="gettext('Cores')"
                    class="q-field--with-bottom"
                  />
                </div>
                <div class="col">
                  <SelectTable
                    v-model="form.cpu"
                    row-key="name"
                    field-style="standard"
                    width="500px"
                    :rows="cpuModelRows"
                    :columns="cpuModelColumns"
                    :display-value="cpuModelDisplayValue"
                    :get-row-value="(row) => textValue(row.name)"
                    :label="gettext('Type')"
                  />
                  <q-input
                    :model-value="totalCores"
                    dense
                    disable
                    class="q-field--with-bottom"
                    :label="gettext('Total cores')"
                  />
                </div>
              </div>
            </div>
            <div v-if="advanced" class="u-border-dotted-blue q-mt-sm q-px-md q-py-sm bg-white">
              <div class="row q-gutter-lg">
                <div class="col">
                  <q-input
                    v-model="form.vcpus"
                    :error="Boolean(validationErrors.vcpus)"
                    :error-message="validationErrors.vcpus"
                    dense
                    type="number"
                    min="1"
                    :max="totalCores"
                    :placeholder="String(totalCores)"
                    class="q-field--with-bottom"
                    :label="gettext('VCPUs')"
                  />
                  <q-input
                    v-model="form.cpulimit"
                    :error="Boolean(validationErrors.cpulimit)"
                    :error-message="validationErrors.cpulimit"
                    dense
                    type="number"
                    min="0"
                    max="128"
                    class="q-field--with-bottom"
                    :label="gettext('CPU limit')"
                  />
                  <q-input
                    v-model="form.affinity"
                    dense
                    class="q-field--with-bottom"
                    :label="gettext('CPU Affinity')"
                    :placeholder="gettext('All Cores')"
                  />
                </div>
                <div class="col">
                  <q-input
                    v-model="form.cpuunits"
                    :error="Boolean(validationErrors.cpuunits)"
                    :error-message="validationErrors.cpuunits"
                    dense
                    type="number"
                    min="1"
                    max="10000"
                    placeholder="100"
                    class="q-field--with-bottom"
                    :label="gettext('CPU units')"
                  />
                  <q-checkbox
                    v-model="form.numa"
                    dense
                    right-label
                    color="primary"
                    :label="gettext('Enable NUMA')"
                  />
                </div>
              </div>
              <div class="q-mt-md vm-cpu-flags-label">{{ gettext('Extra CPU Flags') }}:</div>
              <q-table
                flat
                bordered
                dense
                hide-bottom
                row-key="name"
                class="vm-cpu-flags-table"
                table-header-class="u-table-header"
                :rows="cpuFlags"
                :columns="cpuFlagColumns"
                :pagination="{ rowsPerPage: 0 }"
                :no-data-label="gettext('No CPU flags available')"
              >
                <template #body-cell-state="props">
                  <q-td :props="props">
                    <q-btn-toggle
                      dense
                      unelevated
                      no-caps
                      toggle-color="primary"
                      color="grey-3"
                      text-color="grey-8"
                      :model-value="cpuFlagState(textValue(props.row.name))"
                      :options="cpuFlagStateOptions"
                      @update:model-value="setCpuFlagState(textValue(props.row.name), $event)"
                    />
                  </q-td>
                </template>
              </q-table>
            </div>
          </q-scroll-area>

</template>

<style scoped>
.vm-cpu-flags-label {
  margin-bottom: 4px;
  color: #333333;
  font-size: 12px;
}
.vm-cpu-flags-table :deep(.q-table__middle) {
  max-height: 200px;
  overflow-y: auto;
}
.vm-cpu-flags-table :deep(.q-table td) {
  white-space: normal;
}
.vm-cpu-flags-table :deep(.q-btn-toggle .q-btn) {
  font-size: 11px;
}
</style>
