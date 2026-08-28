<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getNodeNetwork } from '@/api/host';
import { getNodes, type PveRecord } from '@/api/resources';
import { getSdnController, getSdnRouteMaps, saveSdnController } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

export type ControllerType = 'evpn' | 'bgp' | 'isis';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ type: ControllerType; controllerId?: string | undefined }>();
const emit = defineEmits<{ saved: [] }>();
const loading = shallowRef(false);
const showAdvanced = shallowRef(false);
const submitted = shallowRef(false);
const nodes = shallowRef<{ label: string; value: string }[]>([]);
const routeMaps = shallowRef<{ label: string; value: string }[]>([]);
const fabrics = shallowRef<{ label: string; value: string }[]>([]);
const isCreate = computed(() => !props.controllerId);
const typeLabel = computed(() => ({ evpn: 'EVPN', bgp: 'BGP', isis: 'ISIS' }[props.type]));
const form = reactive({
  controller: '',
  node: '',
  asn: '65000',
  fabric: '',
  peers: '',
  nodes: [] as string[],
  'route-map-in': '',
  'route-map-out': '',
  'peer-group-name': '',
  'bgp-mode': '',
  'ebgp-multihop': '',
  ebgp: false,
  loopback: '',
  'bgp-multipath-as-path-relax': false,
  'isis-domain': '',
  'isis-net': '',
  'isis-ifaces': '',
});

function splitCsv(value: unknown) {
  return textValue(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
function reset(data: PveRecord = {}) {
  Object.assign(form, {
    controller: textValue(data.controller),
    node: textValue(data.node),
    asn: textValue(data.asn) || '65000',
    fabric: textValue(data.fabric),
    peers: textValue(data.peers),
    nodes: splitCsv(data.nodes),
    'route-map-in': textValue(data['route-map-in']),
    'route-map-out': textValue(data['route-map-out']),
    'peer-group-name': textValue(data['peer-group-name']),
    'bgp-mode': textValue(data['bgp-mode']),
    'ebgp-multihop': textValue(data['ebgp-multihop']),
    ebgp: textValue(data.ebgp) === '1',
    loopback: textValue(data.loopback),
    'bgp-multipath-as-path-relax': textValue(data['bgp-multipath-as-path-relax']) === '1',
    'isis-domain': textValue(data['isis-domain']),
    'isis-net': textValue(data['isis-net']),
    'isis-ifaces': textValue(data['isis-ifaces']),
  });
}
async function load() {
  loading.value = true;
  try {
    reset();
    const [nodeResponse, routeMapResponse, networkResponse] = await Promise.all([
      getNodes().catch(() => ({ data: [] })),
      getSdnRouteMaps().catch(() => ({ data: [] })),
      getNodeNetwork('localhost').catch(() => ({ data: [] as PveRecord[] })),
    ]);
    nodes.value = (nodeResponse.data || [])
      .map((row) => textValue(row.node))
      .filter(Boolean)
      .sort()
      .map((value) => ({ label: value, value }));
    routeMaps.value = (routeMapResponse.data || [])
      .map((row) => textValue(row.id))
      .filter(Boolean)
      .sort()
      .map((value) => ({ label: value, value }));
    fabrics.value = (networkResponse.data || [])
      .filter((row) => textValue(row.type) === 'fabric' || textValue(row.type_prev) === 'fabric')
      .map((row) => textValue(row.iface))
      .filter(Boolean)
      .sort()
      .map((value) => ({ label: value, value }));
    if (props.controllerId) reset((await getSdnController(props.controllerId)).data || {});
  } finally {
    loading.value = false;
  }
}
watch(visible, (open) => {
  if (open) {
    showAdvanced.value = false;
    submitted.value = false;
    void load();
  }
});
const asnValid = computed(
  () =>
    Number.isInteger(Number(form.asn)) && Number(form.asn) >= 1 && Number(form.asn) <= 4294967295
);
const multihopValid = computed(
  () =>
    !form['ebgp-multihop'] ||
    (Number.isInteger(Number(form['ebgp-multihop'])) &&
      Number(form['ebgp-multihop']) >= 1 &&
      Number(form['ebgp-multihop']) <= 100)
);
const formValid = computed(() => {
  if (!asnValid.value || !multihopValid.value) return false;
  if (props.type === 'evpn')
    return !isCreate.value || (form.controller.trim() && form.controller.length <= 8);
  if (props.type === 'bgp') return Boolean(form.node && form.peers.trim());
  return Boolean(
    form.node && form['isis-domain'].trim() && form['isis-net'].trim() && form['isis-ifaces'].trim()
  );
});
function assignOptional(payload: PveRecord, deleted: string[], key: keyof typeof form) {
  const value = form[key];
  if (Array.isArray(value) ? value.length : value !== '')
    payload[key] = Array.isArray(value) ? value.join(',') : value;
  else if (!isCreate.value) deleted.push(key);
}
function payload() {
  const data: PveRecord = {};
  const deleted: string[] = [];
  if (isCreate.value) {
    data.type = props.type;
    if (props.type === 'evpn') data.controller = form.controller.trim();
    else data.controller = `${props.type}${form.node}`;
  }
  if (props.type === 'evpn') {
    data.asn = form.asn;
    assignOptional(data, deleted, 'fabric');
    assignOptional(data, deleted, 'peers');
    assignOptional(data, deleted, 'nodes');
    (
      ['route-map-in', 'route-map-out', 'peer-group-name', 'bgp-mode', 'ebgp-multihop'] as const
    ).forEach((key) => assignOptional(data, deleted, key));
  } else if (props.type === 'bgp') {
    data.node = form.node;
    data.asn = form.asn;
    data.peers = form.peers.trim();
    data.ebgp = form.ebgp ? 1 : 0;
    (['loopback', 'ebgp-multihop', 'route-map-in', 'route-map-out'] as const).forEach((key) =>
      assignOptional(data, deleted, key)
    );
    data['bgp-multipath-as-path-relax'] = form['bgp-multipath-as-path-relax'] ? 1 : 0;
  } else {
    data.node = form.node;
    data['isis-domain'] = form['isis-domain'].trim();
    data['isis-net'] = form['isis-net'].trim();
    data['isis-ifaces'] = form['isis-ifaces'].trim();
    assignOptional(data, deleted, 'loopback');
  }
  if (deleted.length) data.delete = deleted;
  return data;
}
async function save() {
  submitted.value = true;
  if (!formValid.value) return;
  loading.value = true;
  try {
    await saveSdnController(props.controllerId, payload());
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
  >
    <UWindow
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${typeLabel}`"
      width="680px"
      :loading="loading"
    >
      <div class="q-pa-sm
       u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-6">
              <q-input
                v-if="type === 'evpn'"
                v-model="form.controller"
                dense
                class="q-field--with-bottom"
                :disable="!isCreate"
                maxlength="8"
                :label="isCreate ? 'ID *' : 'ID'"
                :error="submitted && isCreate && (!form.controller.trim() || form.controller.length > 8)"
                :error-message="gettext('This field is required (max 8 characters)')"
              />
              <q-select
                v-if="type !== 'evpn'"
                v-model="form.node"
                dense
                options-dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :options="nodes"
                :label="`${gettext('Node')} *`"
                :error="submitted && !form.node"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-if="type !== 'isis'"
                v-model="form.asn"
                dense
                type="number"
                min="1"
                max="4294967295"
                class="q-field--with-bottom"
                label="ASN # *"
                :error="submitted && !asnValid"
                :error-message="gettext('Value must be 1-4294967295')"
              />
              <q-select
                v-if="type === 'evpn'"
                v-model="form.fabric"
                dense
                options-dense
                clearable
                emit-value
                map-options
                class="q-field--with-bottom"
                :options="fabrics"
                label="SDN Fabric"
                :placeholder="gettext('used as underlay network')"
              />
              <q-input
                v-if="type === 'evpn' || type === 'bgp'"
                v-model="form.peers"
                dense
                class="q-field--with-bottom"
                :label="type === 'bgp' ? `${gettext('Peers')} *` : gettext('Peers')"
                :error="submitted && type === 'bgp' && !form.peers.trim()"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-if="type === 'isis'"
                v-model="form['isis-domain']"
                dense
                class="q-field--with-bottom"
                label="Domain *"
                :error="submitted && !form['isis-domain'].trim()"
                :error-message="gettext('This field is required')"
              />
            </div>
            <div class="col-6">
              <q-select
                v-if="type === 'evpn'"
                v-model="form.nodes"
                multiple
                dense
                options-dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :options="nodes"
                :label="gettext('Nodes')"
              />
              <q-checkbox
                v-if="type === 'bgp'"
                v-model="form.ebgp"
                dense
                label="EBGP"
              />
              <q-input
                v-if="type === 'isis'"
                v-model="form['isis-net']"
                dense
                class="q-field--with-bottom"
                label="Network entity title *"
                :error="submitted && !form['isis-net'].trim()"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-if="type === 'isis'"
                v-model="form['isis-ifaces']"
                dense
                class="q-field--with-bottom"
                :label="`${gettext('Interfaces')} *`"
                :error="submitted && !form['isis-ifaces'].trim()"
                :error-message="gettext('This field is required')"
              />
            </div>
          </div>
          <div
            v-if="showAdvanced"
            class="q-mt-md"
          >
            <div class="row q-col-gutter-lg">
              <div class="col-6">
                <q-select
                  v-if="type === 'evpn' || type === 'bgp'"
                  v-model="form['route-map-in']"
                  dense
                  options-dense
                  clearable
                  emit-value
                  map-options
                  class="q-field--with-bottom"
                  :options="routeMaps"
                  :label="gettext('Incoming Route Map')"
                />
                <q-input
                  v-if="type === 'evpn'"
                  v-model="form['peer-group-name']"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('Peer Group Name')"
                />
                <q-input
                  v-if="type === 'bgp' || type === 'isis'"
                  v-model="form.loopback"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('Loopback Interface')"
                />
              </div>
              <div class="col-6">
                <q-select
                  v-if="type === 'evpn' || type === 'bgp'"
                  v-model="form['route-map-out']"
                  dense
                  options-dense
                  clearable
                  emit-value
                  map-options
                  class="q-field--with-bottom"
                  :options="routeMaps"
                  :label="gettext('Outgoing Route Map')"
                />
                <q-select
                  v-if="type === 'evpn'"
                  v-model="form['bgp-mode']"
                  dense
                  options-dense
                  clearable
                  emit-value
                  map-options
                  class="q-field--with-bottom"
                  :options="[
                    { label: gettext('Automatic'), value: 'auto' },
                    { label: gettext('eBGP'), value: 'external' },
                    { label: gettext('iBGP'), value: 'internal' },
                  ]"
                  :label="gettext('BGP Mode')"
                />
                <q-input
                  v-if="type === 'evpn' || type === 'bgp'"
                  v-model="form['ebgp-multihop']"
                  dense
                  type="number"
                  min="1"
                  max="100"
                  class="q-field--with-bottom"
                  :label="gettext('eBGP Multihop')"
                  :error="submitted && !multihopValid"
                  :error-message="gettext('Value must be 1-100')"
                />
                <q-checkbox
                  v-if="type === 'bgp'"
                  v-model="form['bgp-multipath-as-path-relax']"
                  dense
                  label="BGP Multipath AS Path Relax"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #foot>
        <q-checkbox
          v-model="showAdvanced"
          dense
          class="q-mr-auto"
          :label="gettext('Advanced')"
        />
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
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
