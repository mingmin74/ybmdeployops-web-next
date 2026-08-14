<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef } from 'vue';
import { getNodeNetwork } from '@/api/host';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { PveRecord } from '@/api/resources';
import type { HardwareRow } from '../types';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, node, canEditRow, updateConfig } = useVmHardwareContext();
const networkModels = [
  'ne2k_pci',
  'e1000',
  'e1000-82540em',
  'e1000-82544gc',
  'e1000-82545em',
  'e1000e',
  'vmxnet3',
  'rtl8139',
  'pcnet',
  'virtio',
  'ne2k_isa',
  'i82551',
  'i82557b',
  'i82559er',
];

function parseNetwork(value: unknown) {
  const result = {
    model: 'virtio',
    bridge: '',
    tag: '',
    firewall: false,
    macaddr: '',
    rate: '',
    queues: '',
    mtu: '',
    disconnect: false,
  };
  const preserved: string[] = [];
  textValue(value)
    .split(',')
    .forEach((part) => {
      if (!part) return;
      const segments = part.split('=', 2);
      const key = segments[0] || '';
      const optionValue = segments[1];
      if (!key) return;
      const option = optionValue ?? '';
      if (networkModels.includes(key) && optionValue === undefined) {
        result.model = key;
      } else if (networkModels.includes(key) && optionValue !== undefined) {
        result.model = key;
        result.macaddr = option;
      } else if (key === 'bridge') result.bridge = option;
      else if (key === 'tag') result.tag = option;
      else if (key === 'firewall') result.firewall = option === '1';
      else if (key === 'rate') result.rate = option;
      else if (key === 'queues') result.queues = option;
      else if (key === 'mtu') result.mtu = option;
      else if (key === 'link_down') result.disconnect = option === '1';
      else preserved.push(part);
    });
  return { form: result, preserved };
}

const parsedNetwork = parseNetwork(config.value[device.key]);
const form = reactive(parsedNetwork.form);
const preservedOptions = shallowRef(parsedNetwork.preserved);
const bridgeRows = shallowRef<PveRecord[]>([]);
const editable = computed(() => canEditRow(device));
const advanced = shallowRef(Boolean(form.rate || form.queues || form.mtu || form.disconnect));
const modelOptions = computed(() => networkModels);
const bridgeOptions = computed(() =>
  bridgeRows.value
    .map((row) => textValue(row.iface))
    .filter(Boolean)
    .sort()
    .map((bridge) => ({ label: bridge, value: bridge })),
);
const bridgeValid = computed(() =>
  bridgeOptions.value.some((option) => option.value === form.bridge),
);
const macValid = computed(
  () => !form.macaddr.trim() || /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(form.macaddr.trim()),
);
const tagValid = computed(() => {
  if (!form.tag.trim()) return true;
  const value = Number(form.tag);
  return Number.isInteger(value) && value >= 1 && value <= 4094;
});
const rateValid = computed(() => {
  if (!form.rate.trim()) return true;
  const value = Number(form.rate);
  return Number.isFinite(value) && value >= 0 && value <= 10240;
});
const queuesValid = computed(() => {
  if (!form.queues.trim()) return true;
  const value = Number(form.queues);
  return Number.isInteger(value) && value >= 1 && value <= 64;
});
const mtuValid = computed(() => {
  if (!form.mtu.trim()) return true;
  const value = Number(form.mtu);
  return Number.isInteger(value) && value >= 1 && value <= 65520 && (value === 1 || value >= 576);
});
const canSave = computed(() =>
  Boolean(
    bridgeValid.value &&
    macValid.value &&
    tagValid.value &&
    rateValid.value &&
    queuesValid.value &&
    mtuValid.value,
  ),
);
const showMtuHint = computed(() => form.mtu.trim() === '1');

function networkValue() {
  const parts = [form.macaddr.trim() ? `${form.model}=${form.macaddr.trim()}` : form.model];
  parts.push(`bridge=${form.bridge.trim()}`);
  if (form.tag.trim()) parts.push(`tag=${form.tag.trim()}`);
  if (form.firewall) parts.push('firewall=1');
  if (form.rate.trim()) parts.push(`rate=${form.rate.trim()}`);
  if (form.queues.trim()) parts.push(`queues=${form.queues.trim()}`);
  if (form.model === 'virtio' && form.mtu.trim()) parts.push(`mtu=${form.mtu.trim()}`);
  if (form.disconnect) parts.push('link_down=1');
  parts.push(...preservedOptions.value);
  return parts.join(',');
}

async function loadBridges() {
  bridgeRows.value = (await getNodeNetwork(node.value, { type: 'any_bridge' })).data || [];
}

async function save() {
  if (!editable.value || !canSave.value) return;
  await updateConfig({ [device.key]: networkValue() });
}

onMounted(() => {
  void loadBridges();
});
</script>

<template>
  <div class="hardware-special-editor" :class="{ 'hardware-special-editor--disabled': !editable }">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-6">
        <q-select
          v-model="form.bridge"
          dense
          options-dense
          emit-value
          map-options
          :options="bridgeOptions"
          :error="!bridgeValid"
          :error-message="gettext('Please select a valid bridge')"
          :label="gettext('Bridge')"
        />
      </div>
      <div class="col-6">
        <q-select
          v-model="form.model"
          dense
          options-dense
          :options="modelOptions"
          :label="gettext('Model')"
        />
      </div>
      <div class="col-6">
        <q-input
          v-model="form.tag"
          dense
          type="number"
          min="1"
          max="4094"
          :error="!tagValid"
          error-message="[1-4094]"
          :label="gettext('VLAN Tag')"
        />
      </div>
      <div class="col-6">
        <q-input
          v-model="form.macaddr"
          dense
          placeholder="auto"
          :error="!macValid"
          :error-message="gettext('Invalid Value')"
          :label="gettext('MAC address')"
        />
      </div>
      <div class="col-12">
        <q-checkbox v-model="form.firewall" dense color="primary" :label="gettext('Firewall')" />
      </div>
      <template v-if="advanced">
        <div class="col-6">
          <q-input
            v-model="form.rate"
            dense
            type="number"
            min="0"
            max="10240"
            placeholder="unlimited"
            :error="!rateValid"
            error-message="[0-10240]"
            :label="`${gettext('Rate limit')} (MB/s)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.queues"
            dense
            type="number"
            min="1"
            max="64"
            :error="!queuesValid"
            error-message="[1-64]"
            :label="gettext('Multiqueue')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mtu"
            dense
            type="number"
            min="1"
            max="65520"
            :disable="form.model !== 'virtio'"
            :error="!mtuValid"
            :error-message="
              gettext('MTU needs to be >= 576 or 1 to inherit the MTU from the underlying bridge.')
            "
            label="MTU"
            :placeholder="gettext('Same as bridge')"
          />
        </div>
        <div class="col-6">
          <q-checkbox
            v-model="form.disconnect"
            dense
            color="primary"
            :label="gettext('Disconnect')"
          />
        </div>
        <div v-if="showMtuHint" class="col-12 hardware-editor-hint">
          {{
            gettext("Use the special value '1' to inherit the MTU value from the underlying bridge")
          }}
        </div>
      </template>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :disable="!canSave || !editable"
        :label="gettext('Save')"
        @click="save"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.hardware-special-editor {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}
.hardware-special-editor__fields {
  flex: 1 1 auto;
  align-content: flex-start;
}
.hardware-special-editor__footer {
  min-height: 52px;
  margin: auto -8px -8px;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
.hardware-editor-hint {
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
.hardware-special-editor--disabled .hardware-special-editor__fields {
  pointer-events: none;
  opacity: 0.6;
}
</style>
