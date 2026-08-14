<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getNodeNetwork } from '@/api/host';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../../context/vmHardwareContext';

export interface AddNetworkFormModel {
  model: string;
  bridge: string;
  vlanTag: string;
  firewall: boolean;
  macaddr: string;
  rate: string;
  queues: string;
  mtu: string;
  linkDown: boolean;
}

const form = defineModel<AddNetworkFormModel>('form', { required: true });
const { node } = useVmHardwareContext();

const bridgeRows = shallowRef<PveRecord[]>([]);
const loading = shallowRef(false);
const advanced = defineModel<boolean>('advanced', { default: false });

const modelOptions = [
  { label: gettext('Intel E1000'), value: 'e1000' },
  { label: 'Intel E1000E', value: 'e1000e' },
  { label: `${gettext('VirtIO')} (${gettext('paravirtualized')})`, value: 'virtio' },
  { label: 'Realtek RTL8139', value: 'rtl8139' },
  { label: 'VMware vmxnet3', value: 'vmxnet3' },
];

const bridgeColumns: QTableColumn<PveRecord>[] = [
  { name: 'iface', label: gettext('Bridge'), field: (row) => textValue(row.iface), align: 'left' },
  {
    name: 'active',
    label: gettext('Active'),
    field: (row) => ((row.active ?? row.running) ? gettext('Yes') : gettext('No')),
    align: 'left',
  },
  {
    name: 'comments',
    label: gettext('Comment'),
    field: (row) => textValue(row.comments ?? row.comment),
    align: 'left',
  },
];

const bridgeError = computed(() => !form.value.bridge.trim());
const tagValid = computed(() => {
  if (!form.value.vlanTag.trim()) return true;
  const value = Number(form.value.vlanTag);
  return Number.isInteger(value) && value >= 1 && value <= 4094;
});
const macValid = computed(
  () =>
    !form.value.macaddr.trim() || /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(form.value.macaddr.trim()),
);
const rateValid = computed(() => {
  if (!form.value.rate.trim()) return true;
  const value = Number(form.value.rate);
  return Number.isFinite(value) && value >= 0 && value <= 10240;
});
const queuesValid = computed(() => {
  if (!form.value.queues.trim()) return true;
  const value = Number(form.value.queues);
  return Number.isInteger(value) && value >= 1 && value <= 64;
});
const mtuValid = computed(() => {
  if (!form.value.mtu.trim() || form.value.model !== 'virtio') return true;
  const value = Number(form.value.mtu);
  return Number.isInteger(value) && value >= 1 && value <= 65520 && (value === 1 || value >= 576);
});
const showMtuHint = computed(() => form.value.model === 'virtio' && form.value.mtu.trim() === '1');

async function loadBridges() {
  loading.value = true;
  try {
    const response = await getNodeNetwork(node.value, { type: 'any_bridge' });
    bridgeRows.value = (response.data || [])
      .filter((item) => Boolean(textValue(item.iface)))
      .sort((left, right) => textValue(left.iface).localeCompare(textValue(right.iface)));
    if (!bridgeRows.value.some((bridge) => textValue(bridge.iface) === form.value.bridge)) {
      form.value.bridge = textValue(bridgeRows.value[0]?.iface);
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadBridges();
});
</script>

<template>
  <div class="add-network-form u-dense">
    <div class="u-border q-pa-md">
      <div class="row q-col-gutter-lg">
        <div class="col">
          <SelectTable
            v-model="form.bridge"
            row-key="iface"
            field-style="standard"
            width="500px"
            style="width: 100%"
            :rows="bridgeRows"
            :columns="bridgeColumns"
            :display-value="form.bridge"
            :loading="loading"
            :get-row-value="(row) => textValue(row.iface)"
            :error="bridgeError"
            :error-message="gettext('This field is required')"
            :label="gettext('Bridge')"
          />
          <q-input
            v-model="form.vlanTag"
            dense
            type="number"
            min="1"
            max="4094"
            class="q-field--with-bottom"
            :error="!tagValid"
            error-message="[1-4094]"
            :label="gettext('VLAN Tag')"
          />
        </div>
        <div class="col">
          <q-select
            v-model="form.model"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :label="gettext('Model')"
            :options="modelOptions"
          />
          <q-input
            v-model="form.macaddr"
            dense
            class="q-field--with-bottom"
            placeholder="auto"
            :error="!macValid"
            :error-message="gettext('Invalid Value')"
            :label="gettext('MAC address')"
          />
        </div>
      </div>
      <div class="q-field--with-bottom add-network-form__checkbox">
        <q-checkbox
          v-model="form.firewall"
          dense
          right-label
          color="primary"
          :label="gettext('Firewall')"
        />
      </div>
    </div>

    <div v-if="advanced" class="u-border q-pa-md q-mt-sm">
      <div class="row q-col-gutter-lg">
        <div class="col">
          <q-input
            v-model="form.rate"
            dense
            type="number"
            min="0"
            max="10240"
            class="q-field--with-bottom"
            placeholder="unlimited"
            :error="!rateValid"
            error-message="[0-10240]"
            :label="`${gettext('Rate limit')} (MB/s)`"
          />
          <div class="q-field--with-bottom add-network-form__checkbox">
            <q-checkbox
              v-model="form.linkDown"
              dense
              right-label
              color="primary"
              :label="gettext('Disconnect')"
            />
          </div>
        </div>
        <div class="col">
          <q-input
            v-model="form.queues"
            dense
            type="number"
            min="1"
            max="64"
            class="q-field--with-bottom"
            :error="!queuesValid"
            error-message="[1-64]"
            :label="gettext('Multiqueue')"
          />
          <q-input
            v-model="form.mtu"
            dense
            type="number"
            min="1"
            max="65520"
            class="q-field--with-bottom"
            :disable="form.model !== 'virtio'"
            :error="!mtuValid"
            :error-message="
              gettext('MTU needs to be >= 576 or 1 to inherit the MTU from the underlying bridge.')
            "
            label="MTU"
            :placeholder="gettext('Same as bridge')"
          />
        </div>
        <div v-if="showMtuHint" class="col-12 add-network-form__hint">
          {{
            gettext("Use the special value '1' to inherit the MTU value from the underlying bridge")
          }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-network-form__checkbox {
  margin-left: -10px;
}

.add-network-form__hint {
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
</style>
