<script setup lang="ts">
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, state, errors, options, derived } = useCreateVmWizardContext();
const { advanced } = state;
const { validationErrors } = errors;
const { bridgeColumns } = options;
const { bridgeRows, stepContentHeight } = derived;
</script>

<template>
  <q-scroll-area class="q-pa-sm" :style="{ height: stepContentHeight('network') }">
            <div class="q-px-md q-py-sm u-border-dotted-blue bg-white">
              <q-checkbox
                v-model="form.noNetwork"
                dense
                right-label
                color="primary"
                class="q-field--with-bottom q-mt-sm"
                :label="gettext('No network device')"
              />
              <div class="q-ml-lg">
                <div class="row q-gutter-lg">
                  <div class="col">
                    <SelectTable
                      v-model="form.bridge"
                      row-key="iface"
                      field-style="standard"
                      width="500px"
                      :disable="form.noNetwork"
                      :error="Boolean(validationErrors.bridge)"
                      :error-message="validationErrors.bridge || ''"
                      :rows="bridgeRows"
                      :columns="bridgeColumns"
                      :display-value="form.bridge"
                      :get-row-value="(row) => textValue(row.iface)"
                      :label="gettext('Bridge')"
                    />
                    <q-input
                      v-model="form.vlanTag"
                      :error="Boolean(validationErrors.vlanTag)"
                      :error-message="validationErrors.vlanTag"
                      dense
                      type="number"
                      min="1"
                      max="4094"
                      class="q-field--with-bottom"
                      :disable="form.noNetwork"
                      :label="gettext('VLAN Tag')"
                    />
                    <q-checkbox
                      v-model="form.firewall"
                      dense
                      right-label
                      color="primary"
                      :disable="form.noNetwork"
                    class="q-field--with-bottom"

                      :label="gettext('Firewall')"
                    />
                  </div>
                  <div class="col">
                    <q-select
                      v-model="form.model"
                      dense
                      options-dense
                      class="q-field--with-bottom"
                      :disable="form.noNetwork"
                      :options="['virtio', 'e1000', 'rtl8139', 'vmxnet3']"
                      :label="gettext('Model')"
                    />
                    <q-input
                      v-model="form.macaddr"
                      :error="Boolean(validationErrors.macaddr)"
                      :error-message="validationErrors.macaddr"
                      dense
                      class="q-field--with-bottom"
                      :disable="form.noNetwork"
                      :label="gettext('MAC address')"
                      :placeholder="gettext('auto')"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div v-if="advanced" class="q-mt-sm u-border-dotted-blue q-px-md q-py-sm bg-white">
              <div class="row q-gutter-lg">
                <div class="col">
                  <q-checkbox
                    v-model="form.disconnect"
                    dense
                    right-label
                    color="primary"
                    :disable="form.noNetwork"
                    class="q-field--with-bottom"

                    :label="gettext('Disconnect')"
                  />
                  <q-input
                    v-model="form.mtu"
                    :error="Boolean(validationErrors.mtu)"
                    :error-message="validationErrors.mtu"
                    dense
                    type="number"
                    min="1"
                    max="65520"
                    class="q-field--with-bottom"
                    :disable="form.noNetwork || form.model !== 'virtio'"
                    label="MTU"
                    :placeholder="gettext('Same as bridge')"
                  />
                </div>
                <div class="col">
                  <q-input
                    v-model="form.rate"
                    :error="Boolean(validationErrors.rate)"
                    :error-message="validationErrors.rate"
                    dense
                    type="number"
                    min="0"
                    max="10240"
                    class="q-field--with-bottom"
                    :disable="form.noNetwork"
                    :label="`${gettext('Rate limit')} (MB/s)`"
                    :placeholder="gettext('unlimited')"
                  />
                  <q-input
                    v-model="form.queues"
                    :error="Boolean(validationErrors.queues)"
                    :error-message="validationErrors.queues"
                    dense
                    type="number"
                    min="1"
                    max="64"
                    :disable="form.noNetwork"
                    label="Multiqueue"
                  />
                </div>
              </div>
            </div>
          </q-scroll-area>

</template>
