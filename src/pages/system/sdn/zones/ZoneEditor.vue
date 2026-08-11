<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnZone, getSdnControllers, getSdnDns, getSdnIpams, saveSdnZone } from '@/api/sdn';
import { getNodeNetwork } from '@/api/host';
import { getNodes, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

defineOptions({ name: 'CtZoneEditor' });

export type SdnZoneType = 'simple' | 'vlan' | 'qinq' | 'vxlan' | 'evpn';

const zoneTypeLabels: Record<SdnZoneType, string> = {
  simple: 'Simple',
  vlan: 'VLAN',
  qinq: 'QinQ',
  vxlan: 'VXLAN',
  evpn: 'EVPN',
};

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });
const props = defineProps<{
  zoneType: SdnZoneType;
  zoneId?: string | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();

const isCreate = computed(() => !props.zoneId);
const typeName = computed(() => zoneTypeLabels[props.zoneType]);

const nodeOptions = shallowRef<{ label: string; value: string }[]>([]);
const ipamOptions = shallowRef<{ label: string; value: string }[]>([]);
const dnsOptions = shallowRef<{ label: string; value: string }[]>([]);
const controllerOptions = shallowRef<{ label: string; value: string }[]>([]);
const fabricOptions = shallowRef<{ label: string; value: string; cidr: string | undefined }[]>([]);

const form = reactive<{
  zone: string;
  digest: string;
  mtu: string;
  nodes: string[];
  ipam: string;
  dns: string;
  reversedns: string;
  dnszone: string;
  bridge: string;
  tag: string;
  'vlan-protocol': string;
  peers: string;
  fabric: string;
  controller: string;
  'secondary-controllers': string[];
  'vrf-vxlan': string;
  mac: string;
  exitnodes: string[];
  'exitnodes-primary': string;
  'exitnodes-local-routing': boolean;
  'advertise-subnets': boolean;
  'disable-arp-nd-suppression': boolean;
  'rt-import': string;
  dhcp: boolean;
}>({
  zone: '',
  digest: '',
  mtu: '',
  nodes: [],
  ipam: 'pve',
  dns: '',
  reversedns: '',
  dnszone: '',
  bridge: '',
  tag: '',
  'vlan-protocol': '802.1q',
  peers: '',
  fabric: '',
  controller: '',
  'secondary-controllers': [],
  'vrf-vxlan': '',
  mac: '',
  exitnodes: [],
  'exitnodes-primary': '',
  'exitnodes-local-routing': false,
  'advertise-subnets': false,
  'disable-arp-nd-suppression': false,
  'rt-import': '',
  dhcp: false,
});

function splitCsv(value: unknown): string[] {
  const s = textValue(value);
  return s
    ? s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

function reset(data: PveRecord = {}) {
  const base: Record<string, unknown> = {
    zone: '',
    digest: '',
    mtu: '',
    ipam: 'pve',
    dns: '',
    reversedns: '',
    dnszone: '',
    bridge: '',
    tag: '',
    'vlan-protocol': '802.1q',
    peers: '',
    fabric: '',
    controller: '',
    'secondary-controllers': [],
    'vrf-vxlan': '',
    mac: '',
    exitnodes: [],
    'exitnodes-primary': '',
    'exitnodes-local-routing': false,
    'advertise-subnets': false,
    'disable-arp-nd-suppression': false,
    'rt-import': '',
    dhcp: false,
    nodes: [],
  };
  Object.assign(base, data);
  base.nodes = splitCsv(data.nodes);
  base.exitnodes = splitCsv(data.exitnodes);
  base['secondary-controllers'] = splitCsv(data['secondary-controllers']);
  base.dhcp = textValue(data.dhcp) === 'dnsmasq';
  base['exitnodes-local-routing'] = textValue(data['exitnodes-local-routing']) === '1';
  base['advertise-subnets'] = textValue(data['advertise-subnets']) === '1';
  base['disable-arp-nd-suppression'] = textValue(data['disable-arp-nd-suppression']) === '1';
  Object.assign(form, base);
}

const mtuValid = computed(() => {
  if (form.mtu === '') return true;
  const v = Number(form.mtu);
  return Number.isInteger(v) && v >= 100 && v <= 65000;
});

const tagValid = computed(() => {
  if (props.zoneType !== 'qinq') return true;
  const value = textValue(form.tag).trim();
  if (!value) return false;
  const v = Number(value);
  return Number.isInteger(v) && v >= 0 && v <= 4096;
});

const vrfVxlanValid = computed(() => {
  if (props.zoneType !== 'evpn') return true;
  const v = Number(form['vrf-vxlan']);
  return Number.isInteger(v) && v >= 1 && v <= 16000000;
});

const macValid = computed(() => {
  if (props.zoneType !== 'evpn' || form.mac === '') return true;
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(form.mac);
});

const formValid = computed(() => {
  if (isCreate.value && (!textValue(form.zone).trim() || form.zone.length > 8)) return false;
  if (!mtuValid.value) return false;
  if (!textValue(form.ipam)) return false;
  if (props.zoneType === 'vlan' && !textValue(form.bridge).trim()) return false;
  if (props.zoneType === 'qinq' && (!textValue(form.bridge).trim() || !tagValid.value))
    return false;
  if (props.zoneType === 'evpn' && (!textValue(form.controller).trim() || !vrfVxlanValid.value))
    return false;
  if (!macValid.value) return false;
  return true;
});

async function loadOptions() {
  const needVxlanFabric = props.zoneType === 'vxlan';

  const [nodes, ipams, dnsList, controllers, networkResponse] = await Promise.all([
    getNodes().catch(() => ({ data: [] })),
    getSdnIpams(false).catch(() => ({ data: [] })),
    getSdnDns(false).catch(() => ({ data: [] })),
    props.zoneType === 'evpn'
      ? getSdnControllers(false).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    needVxlanFabric
      ? getNodeNetwork('localhost').catch(() => ({ data: [] as Record<string, unknown>[] }))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  nodeOptions.value = (nodes.data || [])
    .map((n) => textValue(n.node))
    .filter(Boolean)
    .sort()
    .map((n) => ({ label: n, value: n }));
  ipamOptions.value = (ipams.data || [])
    .map((r) => textValue(r.ipam || r.id || r.name))
    .filter(Boolean)
    .sort()
    .map((v) => ({ label: v, value: v }));
  if (!ipamOptions.value.some((o) => o.value === 'pve')) {
    ipamOptions.value.unshift({ label: 'pve', value: 'pve' });
  }
  dnsOptions.value = (dnsList.data || [])
    .map((r) => textValue(r.dns || r.id || r.name))
    .filter(Boolean)
    .sort()
    .map((v) => ({ label: v, value: v }));
  controllerOptions.value = (controllers.data || [])
    .map((r) => textValue(r.controller || r.id || r.name))
    .filter(Boolean)
    .sort()
    .map((v) => ({ label: v, value: v }));
  fabricOptions.value = (networkResponse.data || [])
    .filter(
      (item) =>
        textValue((item as PveRecord).type) === 'fabric' ||
        textValue((item as PveRecord).type_prev) === 'fabric',
    )
    .map((item) => ({
      label: textValue((item as PveRecord).iface),
      value: textValue((item as PveRecord).iface),
      cidr: textValue((item as PveRecord).cidr) || undefined,
    }))
    .filter((item) => item.value)
    .sort((a, b) => a.value.localeCompare(b.value));
}

function joinCsv(arr: string[]): string {
  return arr.join(',');
}

function cleanPayload() {
  const payload: PveRecord = {
    digest: form.digest,
  };
  if (isCreate.value) {
    payload.zone = textValue(form.zone).trim();
    payload.type = props.zoneType;
  }
  const baseFields: (keyof typeof form)[] = ['mtu', 'dns', 'reversedns', 'dnszone'];
  const deleted: string[] = [];

  if (form.nodes.length) payload.nodes = joinCsv(form.nodes);
  else if (!isCreate.value) deleted.push('nodes');

  if (form.ipam) payload.ipam = form.ipam;

  baseFields.forEach((key) => {
    const value = form[key];
    if (value !== '' && value !== undefined && value !== null) payload[key] = value;
    else if (!isCreate.value) deleted.push(String(key));
  });

  switch (props.zoneType) {
    case 'vlan':
      if (form.bridge) payload.bridge = form.bridge;
      break;
    case 'qinq': {
      if (form.bridge) payload.bridge = form.bridge;
      if (form.tag) payload.tag = form.tag;
      if (form['vlan-protocol']) payload['vlan-protocol'] = form['vlan-protocol'];
      break;
    }
    case 'vxlan': {
      if (form.peers) payload.peers = form.peers;
      else if (!isCreate.value) deleted.push('peers');
      if (form.fabric) payload.fabric = form.fabric;
      else if (!isCreate.value) deleted.push('fabric');
      break;
    }
    case 'evpn': {
      if (form.controller) payload.controller = form.controller;
      if (form['vrf-vxlan']) payload['vrf-vxlan'] = form['vrf-vxlan'];
      if (form.mac) payload.mac = form.mac;
      else if (!isCreate.value) deleted.push('mac');
      if (form.exitnodes.length) payload.exitnodes = joinCsv(form.exitnodes);
      else if (!isCreate.value) deleted.push('exitnodes');
      if (form['exitnodes-primary']) payload['exitnodes-primary'] = form['exitnodes-primary'];
      else if (!isCreate.value) deleted.push('exitnodes-primary');
      if (form['exitnodes-local-routing']) payload['exitnodes-local-routing'] = 1;
      else if (!isCreate.value) deleted.push('exitnodes-local-routing');
      if (form['advertise-subnets']) payload['advertise-subnets'] = 1;
      else if (!isCreate.value) deleted.push('advertise-subnets');
      if (form['disable-arp-nd-suppression']) payload['disable-arp-nd-suppression'] = 1;
      else if (!isCreate.value) deleted.push('disable-arp-nd-suppression');
      if (form['rt-import']) payload['rt-import'] = form['rt-import'];
      else if (!isCreate.value) deleted.push('rt-import');
      if (form['secondary-controllers'].length) {
        payload['secondary-controllers'] = joinCsv(form['secondary-controllers']);
      } else if (!isCreate.value) {
        deleted.push('secondary-controllers');
      }
      break;
    }
    case 'simple':
      if (form.dhcp) payload.dhcp = 'dnsmasq';
      else if (!isCreate.value) deleted.push('dhcp');
      break;
  }

  if (deleted.length) payload.delete = deleted;
  return payload;
}

async function load() {
  loading.value = true;
  try {
    reset();
    await loadOptions();
    if (props.zoneId) {
      reset((await getSdnZone(props.zoneId)).data || {});
    }
  } finally {
    loading.value = false;
  }
}

watch(visible, (open) => {
  if (open) void load();
});

async function save() {
  if (!formValid.value) return;
  loading.value = true;
  try {
    await saveSdnZone(props.zoneId, cleanPayload());
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${typeName}`"
      width="640px"
      :loading="loading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-6">
              <q-input
                v-model="form.zone"
                dense
                class="q-field--with-bottom"
                :disable="!isCreate"
                :label="gettext('ID')"
                maxlength="8"
                :error="!textValue(form.zone).trim() || form.zone.length > 8"
                :error-message="gettext('This field is required (max 8 characters)')"
              />
              <q-input
                v-if="zoneType === 'vlan' || zoneType === 'qinq'"
                v-model="form.bridge"
                dense
                class="q-field--with-bottom"
                :label="gettext('Bridge')"
                maxlength="10"
                :error="!textValue(form.bridge).trim()"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-if="zoneType === 'qinq'"
                v-model="form.tag"
                dense
                type="number"
                min="0"
                max="4096"
                class="q-field--with-bottom"
                :label="gettext('Service VLAN')"
                :error="!tagValid"
                :error-message="gettext('Value must be 0-4096')"
              />
              <q-select
                v-if="zoneType === 'qinq'"
                v-model="form['vlan-protocol']"
                dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('Service VLAN Protocol')"
                :options="[
                  { label: '802.1q', value: '802.1q' },
                  { label: '802.1ad', value: '802.1ad' },
                ]"
              />
              <q-input
                v-if="zoneType === 'vxlan'"
                v-model="form.peers"
                dense
                class="q-field--with-bottom"
                :label="gettext('Peer Address List')"
                placeholder="192.0.2.1, 192.0.2.2"
              />
              <q-select
                v-if="zoneType === 'evpn'"
                v-model="form.controller"
                dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('Primary Controller')"
                :options="controllerOptions"
                :error="!textValue(form.controller).trim()"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-if="zoneType === 'evpn'"
                v-model="form['vrf-vxlan']"
                dense
                type="number"
                min="1"
                max="16000000"
                class="q-field--with-bottom"
                label="VRF-VXLAN Tag"
                :error="!vrfVxlanValid"
                :error-message="gettext('Value must be 1-16000000')"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.mtu"
                dense
                type="number"
                min="100"
                max="65000"
                class="q-field--with-bottom"
                label="MTU"
                :placeholder="gettext('auto')"
                :error="!mtuValid"
                :error-message="gettext('Value must be 100-65000')"
              />
              <q-select
                v-model="form.nodes"
                multiple
                dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('Nodes')"
                :options="nodeOptions"
                :placeholder="`${gettext('All')} (${gettext('No restrictions')})`"
              />
              <q-select
                v-model="form.ipam"
                dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('IPAM')"
                :options="ipamOptions"
                :error="!textValue(form.ipam)"
                :error-message="gettext('This field is required')"
              />
              <q-select
                v-if="zoneType === 'vxlan'"
                v-model="form.fabric"
                dense
                emit-value
                map-options
                clearable
                class="q-field--with-bottom"
                label="SDN Fabric"
                :options="fabricOptions"
                :option-label="(opt) => (opt.cidr ? `${opt.value} (${opt.cidr})` : opt.value)"
                :placeholder="gettext('used as underlay network')"
              />
              <q-input
                v-if="zoneType === 'evpn'"
                v-model="form.mac"
                dense
                class="q-field--with-bottom"
                :label="gettext('VNet MAC Address')"
                :placeholder="gettext('auto')"
                :error="!macValid"
                :error-message="gettext('Invalid MAC address')"
              />
            </div>
          </div>
          <q-expansion-item dense :label="gettext('Advanced')" default-opened>
            <div class="row q-col-gutter-lg">
              <div class="col-6">
                <q-select
                  v-model="form.dns"
                  dense
                  emit-value
                  map-options
                  clearable
                  class="q-field--with-bottom"
                  :label="gettext('DNS Server')"
                  :options="dnsOptions"
                />
                <q-select
                  v-if="zoneType === 'evpn'"
                  v-model="form.exitnodes"
                  multiple
                  dense
                  emit-value
                  map-options
                  class="q-field--with-bottom"
                  :label="gettext('Exit Nodes')"
                  :options="nodeOptions"
                />
                <q-select
                  v-if="zoneType === 'evpn'"
                  v-model="form['exitnodes-primary']"
                  dense
                  emit-value
                  map-options
                  clearable
                  class="q-field--with-bottom"
                  :label="gettext('Primary Exit Node')"
                  :options="nodeOptions"
                />
                <q-checkbox
                  v-if="zoneType === 'evpn'"
                  v-model="form['exitnodes-local-routing']"
                  dense
                  :label="gettext('Exit Nodes Local Routing')"
                />
                <q-checkbox
                  v-if="zoneType === 'simple'"
                  v-model="form.dhcp"
                  dense
                  :label="gettext('Automatic DHCP')"
                />
              </div>
              <div class="col-6">
                <q-select
                  v-model="form.reversedns"
                  dense
                  emit-value
                  map-options
                  clearable
                  class="q-field--with-bottom"
                  :label="gettext('Reverse DNS Server')"
                  :options="dnsOptions"
                />
                <q-input
                  v-model="form.dnszone"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('DNS Zone')"
                />
                <q-checkbox
                  v-if="zoneType === 'evpn'"
                  v-model="form['advertise-subnets']"
                  dense
                  :label="gettext('Advertise Subnets')"
                />
                <q-checkbox
                  v-if="zoneType === 'evpn'"
                  v-model="form['disable-arp-nd-suppression']"
                  dense
                  :label="gettext('Disable ARP-nd Suppression')"
                />
              </div>
            </div>
            <div v-if="zoneType === 'evpn'" class="row q-col-gutter-lg q-mt-sm">
              <div class="col-6">
                <q-select
                  v-model="form['secondary-controllers']"
                  multiple
                  dense
                  emit-value
                  map-options
                  clearable
                  class="q-field--with-bottom"
                  :label="gettext('Additional Controllers')"
                  :options="controllerOptions"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="form['rt-import']"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('Route Target Import')"
                />
              </div>
            </div>
          </q-expansion-item>
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!formValid"
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
