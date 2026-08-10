<script setup lang="ts">
import { Dialog } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { getCtInterfaces, updateVmConfig } from '@/api/overview';
import { getNodeNetwork } from '@/api/host';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

type NetworkForm = {
  id: string;
  name: string;
  hwaddr: string;
  bridge: string;
  tag: string;
  firewall: boolean;
  ipv4mode: 'static' | 'dhcp';
  ip: string;
  gw: string;
  ipv6mode: 'static' | 'dhcp' | 'auto';
  ip6: string;
  gw6: string;
  linkDown: boolean;
  mtu: string;
  rate: string;
  hostManaged: boolean;
};
type NetworkRow = NetworkForm & { ipDisplay: string[]; gatewayDisplay: string[] };

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const dialogVisible = shallowRef(false);
const editing = shallowRef(false);
const selectedRows = shallowRef<NetworkRow[]>([]);
const bridges = shallowRef<string[]>([]);
const liveInterfaces = shallowRef<PveRecord>({});
const form = reactive<NetworkForm>(emptyForm());

const canEdit = computed(() =>
  Boolean(
    (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Network'],
  ),
);
const networks = computed<NetworkRow[]>(() =>
  Object.keys(props.config)
    .filter((key) => /^net\d+$/.test(key))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((id) => toNetworkRow(id, textValue(props.config[id]))),
);
const selected = computed(() => selectedRows.value[0]);
const maxNetworksReached = computed(() => networks.value.length >= 32);
const nameValid = computed(
  () =>
    Boolean(form.name.trim()) &&
    networks.value.every((row) => row.id === form.id || row.name !== form.name.trim()),
);
const bridgeValid = computed(() => Boolean(form.bridge));
const macValid = computed(
  () => !form.hwaddr.trim() || /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(form.hwaddr.trim()),
);
const tagValid = computed(
  () =>
    !form.tag ||
    (Number.isInteger(Number(form.tag)) && Number(form.tag) >= 1 && Number(form.tag) <= 4094),
);
const mtuValid = computed(
  () =>
    !form.mtu ||
    (Number.isInteger(Number(form.mtu)) && Number(form.mtu) >= 576 && Number(form.mtu) <= 65535),
);
const rateValid = computed(
  () =>
    !form.rate ||
    (Number.isFinite(Number(form.rate)) && Number(form.rate) >= 0 && Number(form.rate) <= 10240),
);
const canSave = computed(
  () =>
    nameValid.value &&
    bridgeValid.value &&
    macValid.value &&
    tagValid.value &&
    mtuValid.value &&
    rateValid.value,
);

function emptyForm(): NetworkForm {
  return {
    id: '',
    name: '',
    hwaddr: '',
    bridge: '',
    tag: '',
    firewall: true,
    ipv4mode: 'static',
    ip: '',
    gw: '',
    ipv6mode: 'static',
    ip6: '',
    gw6: '',
    linkDown: false,
    mtu: '',
    rate: '',
    hostManaged: false,
  };
}

function parseNetwork(id: string, raw: string): NetworkForm {
  const parsed = emptyForm();
  parsed.id = id;
  raw.split(',').forEach((part) => {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (!key) return;
    if (key === 'firewall') parsed.firewall = value === '1';
    else if (key === 'link_down') parsed.linkDown = value === '1';
    else if (key === 'host-managed') parsed.hostManaged = value === '1';
    else if (key === 'ip' && value === 'dhcp') parsed.ipv4mode = 'dhcp';
    else if (key === 'ip6' && (value === 'dhcp' || value === 'auto')) parsed.ipv6mode = value;
    else if (key === 'name') parsed.name = value;
    else if (key === 'hwaddr') parsed.hwaddr = value;
    else if (key === 'bridge') parsed.bridge = value;
    else if (key === 'tag') parsed.tag = value;
    else if (key === 'ip') parsed.ip = value;
    else if (key === 'gw') parsed.gw = value;
    else if (key === 'ip6') parsed.ip6 = value;
    else if (key === 'gw6') parsed.gw6 = value;
    else if (key === 'mtu') parsed.mtu = value;
    else if (key === 'rate') parsed.rate = value;
  });
  return parsed;
}

function toNetworkRow(id: string, raw: string): NetworkRow {
  const row = parseNetwork(id, raw);
  const addresses = interfaceAddresses(row.hwaddr);
  return {
    ...row,
    ipDisplay: addresses.length
      ? addresses
      : [
          formatConfiguredAddress(row.ipv4mode === 'dhcp' ? 'dhcp' : row.ip, 'ip'),
          formatConfiguredAddress(row.ipv6mode === 'static' ? row.ip6 : row.ipv6mode, 'ip6'),
        ].filter(Boolean),
    gatewayDisplay: [row.gw, row.gw6].filter(Boolean),
  };
}

function interfaceAddresses(hwaddr: string) {
  const iface = Object.values(liveInterfaces.value).find(
    (value) =>
      textValue((value as PveRecord)['hardware-address']).toLowerCase() === hwaddr.toLowerCase(),
  ) as PveRecord | undefined;
  const addresses = Array.isArray(iface?.['ip-addresses'])
    ? (iface['ip-addresses'] as PveRecord[])
    : [];
  return addresses
    .map((address) => {
      const ip = textValue(address['ip-address']);
      const prefix = textValue(address.prefix);
      return ip
        ? `${ip}/${prefix} (${address['ip-address-type'] === 'inet' ? 'dynamic' : 'dynamic'})`
        : '';
    })
    .filter(Boolean);
}

function formatConfiguredAddress(value: string, prefix: string) {
  if (!value) return '';
  if (value === 'dhcp' || value === 'auto') return `${prefix}: ${value}`;
  return value;
}

function nextNetworkId() {
  for (let index = 0; index < 32; index += 1) {
    const id = `net${index}`;
    if (!props.config[id]) return id;
  }
  return 'net31';
}

async function loadSupplementaryData() {
  const [networkResult, interfaceResult] = await Promise.allSettled([
    getNodeNetwork(props.node),
    getCtInterfaces(props.node, props.vmid),
  ]);
  if (networkResult.status === 'fulfilled') {
    bridges.value = (networkResult.value.data || [])
      .filter((network) => textValue(network.type).toLowerCase().includes('bridge'))
      .map((network) => textValue(network.iface))
      .filter(Boolean)
      .sort();
  }
  if (interfaceResult.status === 'fulfilled')
    liveInterfaces.value = interfaceResult.value.data || {};
}

function openAdd() {
  if (!canEdit.value || maxNetworksReached.value) return;
  Object.assign(form, emptyForm(), { id: nextNetworkId(), name: `eth${networks.value.length}` });
  editing.value = false;
  dialogVisible.value = true;
}

function openEdit() {
  if (!canEdit.value || !selected.value) return;
  Object.assign(form, selected.value);
  editing.value = true;
  dialogVisible.value = true;
}

function editRow(_event: Event, row: NetworkRow) {
  selectedRows.value = [row];
  openEdit();
}

function networkValue() {
  const parts = [
    `name=${form.name.trim()}`,
    ...(form.hwaddr.trim() ? [`hwaddr=${form.hwaddr.trim()}`] : []),
    `bridge=${form.bridge}`,
    ...(form.tag ? [`tag=${form.tag}`] : []),
    ...(form.firewall ? ['firewall=1'] : []),
    `ip=${form.ipv4mode === 'dhcp' ? 'dhcp' : form.ip.trim()}`,
    ...(form.gw.trim() ? [`gw=${form.gw.trim()}`] : []),
    `ip6=${form.ipv6mode === 'static' ? form.ip6.trim() : form.ipv6mode}`,
    ...(form.gw6.trim() ? [`gw6=${form.gw6.trim()}`] : []),
    ...(form.linkDown ? ['link_down=1'] : []),
    ...(form.mtu ? [`mtu=${form.mtu}`] : []),
    ...(form.rate ? [`rate=${form.rate}`] : []),
    ...(form.hostManaged ? ['host-managed=1'] : []),
  ];
  return parts.filter((part) => !part.endsWith('=')).join(',');
}

async function save() {
  if (!canSave.value) return;
  loading.value = true;
  try {
    await updateVmConfig(
      props.node,
      props.vmid,
      { digest: props.config.digest, [form.id]: networkValue() },
      'lxc',
    );
    dialogVisible.value = false;
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function removeNetwork() {
  if (!canEdit.value || !selected.value) return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure you want to remove entry {0}').replace(
      '{0}',
      `'${selected.value.id}'`,
    ),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void updateVmConfig(
      props.node,
      props.vmid,
      { digest: props.config.digest, delete: selected.value!.id },
      'lxc',
    )
      .then(() => emit('updated'))
      .finally(() => {
        loading.value = false;
      });
  });
}

watch(
  networks,
  (rows) => {
    const selectedId = selectedRows.value[0]?.id;
    if (!rows.some((row) => row.id === selectedId)) selectedRows.value = rows[0] ? [rows[0]] : [];
  },
  { immediate: true },
);
watch(
  () => [props.node, props.vmid],
  () => {
    void loadSupplementaryData();
  },
  { immediate: true },
);
</script>

<template>
  <div class="ct-network-tab">
    <div class="row items-center q-gutter-sm q-py-sm ct-network-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canEdit && !maxNetworksReached ? 'primary' : 'grey'"
        :disable="!canEdit || maxNetworksReached"
        :label="gettext('Add')"
        @click="openAdd"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canEdit && selected ? 'negative' : 'grey'"
        :disable="!canEdit || !selected"
        :label="gettext('Remove')"
        @click="removeNetwork"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canEdit && selected ? 'primary' : 'grey'"
        :disable="!canEdit || !selected"
        :label="gettext('Edit')"
        @click="openEdit"
      />
    </div>
    <q-table
      flat
      bordered
      row-key="id"
      :rows="networks"
      :columns="[
        { name: 'id', label: 'ID', field: 'id', align: 'left' },
        { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
        { name: 'bridge', label: gettext('Bridge'), field: 'bridge', align: 'left' },
        { name: 'firewall', label: gettext('Firewall'), field: 'firewall', align: 'left' },
        { name: 'tag', label: gettext('VLAN Tag'), field: 'tag', align: 'left' },
        { name: 'hwaddr', label: gettext('MAC address'), field: 'hwaddr', align: 'left' },
        { name: 'ip', label: gettext('IP address'), field: 'ipDisplay', align: 'left' },
        { name: 'gateway', label: gettext('Gateway'), field: 'gatewayDisplay', align: 'left' },
        { name: 'mtu', label: 'MTU', field: 'mtu', align: 'left' },
        { name: 'linkDown', label: gettext('Disconnected'), field: 'linkDown', align: 'left' },
      ]"
      :pagination="{ rowsPerPage: 0 }"
      hide-bottom
      selection="single"
      v-model:selected="selectedRows"
      table-header-class="u-table-header"
      class="ct-network-table"
      @row-dblclick="editRow"
    >
      <template #body-cell-firewall="scope"
        ><q-td :props="scope"
          ><q-icon
            :name="scope.value ? 'check' : 'close'"
            :color="scope.value ? 'positive' : 'grey'" /></q-td
      ></template>
      <template #body-cell-ip="scope"
        ><q-td :props="scope"
          ><div v-for="value in scope.value" :key="value">{{ value }}</div></q-td
        ></template
      >
      <template #body-cell-gateway="scope"
        ><q-td :props="scope"
          ><div v-for="value in scope.value" :key="value">{{ value }}</div></q-td
        ></template
      >
      <template #body-cell-linkDown="scope"
        ><q-td :props="scope"
          ><q-icon
            :name="scope.value ? 'check' : 'close'"
            :color="scope.value ? 'positive' : 'grey'" /></q-td
      ></template>
      <template #no-data
        ><div class="full-width row flex-center q-pa-md text-grey">
          {{ gettext('No network device') }}
        </div></template
      >
    </q-table>
  </div>
  <q-dialog v-model="dialogVisible" persistent>
    <q-card class="ct-network-dialog"
      ><q-card-section class="text-subtitle1">{{
        `${editing ? gettext('Edit') : gettext('Add')}: ${gettext('Network Device')}`
      }}</q-card-section
      ><q-separator />
      <q-card-section class="q-gutter-md"
        ><div class="row q-col-gutter-md">
          <div class="col-6 q-gutter-sm">
            <q-input
              v-model="form.name"
              dense
              :label="gettext('Name')"
              :error="!nameValid"
              :error-message="gettext('This field is required')"
            /><q-input
              v-model="form.hwaddr"
              dense
              :label="gettext('MAC address')"
              placeholder="auto"
              :error="!macValid"
              :error-message="gettext('Invalid Value')"
            /><q-select
              v-model="form.bridge"
              dense
              options-dense
              :options="bridges"
              :label="gettext('Bridge')"
              :error="!bridgeValid"
              :error-message="gettext('This field is required')"
            /><q-input
              v-model="form.tag"
              dense
              type="number"
              min="1"
              max="4094"
              :label="gettext('VLAN Tag')"
              :error="!tagValid"
              error-message="[1-4094]"
            /><q-checkbox v-model="form.firewall" dense :label="gettext('Firewall')" />
          </div>
          <div class="col-6 q-gutter-sm">
            <q-option-group
              v-model="form.ipv4mode"
              inline
              dense
              :label="'IPv4'"
              :options="[
                { label: gettext('Static'), value: 'static' },
                { label: 'DHCP', value: 'dhcp' },
              ]"
            /><q-input
              v-model="form.ip"
              dense
              label="IPv4/CIDR"
              :disable="form.ipv4mode !== 'static'"
            /><q-input
              v-model="form.gw"
              dense
              :label="`${gettext('Gateway')} (IPv4)`"
              :disable="form.ipv4mode !== 'static'"
            /><q-separator class="q-my-sm" /><q-option-group
              v-model="form.ipv6mode"
              inline
              dense
              :label="'IPv6'"
              :options="[
                { label: gettext('Static'), value: 'static' },
                { label: 'DHCP', value: 'dhcp' },
                { label: 'SLAAC', value: 'auto' },
              ]"
            /><q-input
              v-model="form.ip6"
              dense
              label="IPv6/CIDR"
              :disable="form.ipv6mode !== 'static'"
            /><q-input
              v-model="form.gw6"
              dense
              :label="`${gettext('Gateway')} (IPv6)`"
              :disable="form.ipv6mode !== 'static'"
            />
          </div>
        </div>
        <q-separator />
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <q-checkbox v-model="form.linkDown" dense :label="gettext('Disconnect')" /><q-input
              v-model="form.mtu"
              dense
              type="number"
              min="576"
              max="65535"
              label="MTU"
              :placeholder="gettext('Same as bridge')"
              :error="!mtuValid"
              error-message="[576-65535]"
            />
          </div>
          <div class="col-6">
            <q-input
              v-model="form.rate"
              dense
              type="number"
              min="0"
              max="10240"
              :label="`${gettext('Rate limit')} (MB/s)`"
              placeholder="unlimited"
              :error="!rateValid"
              error-message="[0-10240]"
            /><q-checkbox v-model="form.hostManaged" dense :label="gettext('Host-Managed')" />
          </div></div
      ></q-card-section>
      <q-card-actions align="right"
        ><q-btn v-close-popup flat no-caps :label="gettext('Cancel')" /><q-btn
          no-caps
          color="primary"
          :loading="loading"
          :disable="!canSave"
          :label="gettext('OK')"
          @click="save" /></q-card-actions
    ></q-card>
  </q-dialog>
</template>

<style scoped>
.ct-network-tab {
  padding: 8px;
  font-size: 13px;
}

.ct-network-toolbar {
  margin: 0 0 4px;
}

.ct-network-table {
  overflow: hidden;
  background: #fff;
}

.ct-network-table :deep(thead tr) {
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}

.ct-network-table :deep(tbody tr) {
  color: #334155;
  transition: background-color 150ms ease-out;
}

.ct-network-table :deep(tbody tr:hover) {
  background: #f4f8fc;
}

.ct-network-table :deep(tbody tr.q-table__selected) {
  background: #e6f1fb;
  color: #1f4f78;
}

.ct-network-table :deep(td) {
  font-size: 13px;
}

@media (prefers-reduced-motion: reduce) {
  .ct-network-table :deep(tbody tr) {
    transition: none;
  }
}

.ct-network-dialog {
  width: min(760px, calc(100vw - 32px));
}
</style>
