<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnFabric, saveSdnFabric, type SdnFabricProtocol } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import RedistributionEditor, { type RedistributionEntry } from './RedistributionEditor.vue';

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });
const props = defineProps<{
  protocol: SdnFabricProtocol;
  fabricId?: string | undefined;
  disableIpPrefixEdit?: boolean | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();
const activeTab = shallowRef('fabric');
const isCreate = computed(() => !props.fabricId);
const hasIp = computed(() => props.protocol !== 'wireguard');
const hasIp6 = computed(() => props.protocol !== 'wireguard' && props.protocol !== 'ospf');
const hasRedistribution = computed(() => props.protocol === 'ospf' || props.protocol === 'bgp');
const protocolName = computed(
  () =>
    ({ openfabric: 'OpenFabric', ospf: 'OSPF', wireguard: 'WireGuard', bgp: 'BGP' })[
      props.protocol
    ],
);
const redistributionSources = computed(() =>
  props.protocol === 'ospf'
    ? [
        { label: 'BGP', value: 'bgp' },
        { label: gettext('Connected'), value: 'connected' },
        { label: gettext('Static'), value: 'static' },
        { label: gettext('Kernel'), value: 'kernel' },
      ]
    : [
        { label: 'OSPF', value: 'ospf' },
        { label: gettext('Connected'), value: 'connected' },
        { label: gettext('Static'), value: 'static' },
        { label: gettext('Kernel'), value: 'kernel' },
      ],
);
const form = reactive({
  id: '',
  digest: '',
  ip_prefix: '',
  ip6_prefix: '',
  hello_interval: '',
  csnp_interval: '',
  route_filter: '',
  area: '0',
  persistent_keepalive: '',
  bfd: false,
  route_map_in: '',
  route_map_out: '',
  redistribute: [] as RedistributionEntry[],
});
const prefixValid = computed(
  () =>
    props.protocol === 'wireguard' ||
    (props.protocol === 'ospf'
      ? Boolean(textValue(form.ip_prefix).trim())
      : Boolean(textValue(form.ip_prefix).trim() || textValue(form.ip6_prefix).trim())),
);
const redistributionValid = computed(
  () =>
    new Set(form.redistribute.map((row) => row.source)).size === form.redistribute.length &&
    form.redistribute.every((row) => row.source),
);
function parseProperty(value: unknown): RedistributionEntry[] {
  const entries = Array.isArray(value) ? value : value ? [textValue(value)] : [];
  return entries.map((entry) => {
    const data: Record<string, string> = {};
    String(entry)
      .split(',')
      .forEach((pair) => {
        const [key, ...rest] = pair.split('=');
        if (key) data[key] = rest.join('=');
      });
    return { source: data.source || String(entry), routeMap: data['route-map'] || '' };
  });
}
function printRedistribution() {
  return form.redistribute.map((row) =>
    [`source=${row.source}`, row.routeMap ? `route-map=${row.routeMap}` : '']
      .filter(Boolean)
      .join(','),
  );
}
function reset(data: PveRecord = {}) {
  Object.assign(form, {
    id: '',
    digest: '',
    ip_prefix: '',
    ip6_prefix: '',
    hello_interval: '',
    csnp_interval: '',
    route_filter: '',
    area: '0',
    persistent_keepalive: '',
    bfd: false,
    route_map_in: '',
    route_map_out: '',
    ...data,
    redistribute: parseProperty(data.redistribute),
  });
  activeTab.value = 'fabric';
}
watch(visible, async (open) => {
  if (!open) return;
  reset();
  if (props.fabricId) {
    loading.value = true;
    try {
      reset((await getSdnFabric(props.fabricId)).data || {});
    } finally {
      loading.value = false;
    }
  }
});
function cleanPayload() {
  const payload: PveRecord = {
    id: String(form.id).trim(),
    protocol: props.protocol,
    digest: form.digest,
  };
  const fields: (keyof typeof form)[] =
    props.protocol === 'openfabric'
      ? ['ip_prefix', 'ip6_prefix', 'hello_interval', 'csnp_interval', 'route_filter']
      : props.protocol === 'ospf'
        ? ['ip_prefix', 'area', 'route_filter']
        : props.protocol === 'wireguard'
          ? ['persistent_keepalive']
          : ['ip_prefix', 'ip6_prefix', 'bfd', 'route_filter', 'route_map_in', 'route_map_out'];
  const deleted: string[] = [];
  fields.forEach((key) => {
    const value = form[key];
    if (value !== '' && value !== undefined && value !== null) payload[key] = value;
    else if (!isCreate.value && key !== 'bfd' && key !== 'area') deleted.push(key);
  });
  if (hasRedistribution.value) {
    const value = printRedistribution();
    if (value.length) payload.redistribute = value;
    else if (!isCreate.value) deleted.push('redistribute');
  }
  if (deleted.length) payload.delete = deleted;
  return payload;
}
async function save() {
  if (
    !form.id ||
    form.id.length > 8 ||
    !prefixValid.value ||
    (props.protocol === 'ospf' && !form.area.trim()) ||
    !redistributionValid.value
  )
    return;
  loading.value = true;
  try {
    await saveSdnFabric(props.fabricId, cleanPayload());
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <q-dialog v-model="visible" persistent
    ><UWindow
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${protocolName}`"
      width="600px"
      :loading="loading"
      ><div class="q-pa-md u-dense">
        <q-tabs
          v-if="hasRedistribution"
          v-model="activeTab"
          dense
          align="left"
          active-color="primary"
          indicator-color="primary"
          ><q-tab name="fabric" :label="gettext('Fabric')" /><q-tab
            name="redistribution"
            :label="gettext('Route Redistribution')" /></q-tabs
        ><q-tab-panels v-model="activeTab" animated
          ><q-tab-panel name="fabric" class="q-pa-none"
            ><div class="u-border q-pa-md">
              <div class="row q-col-gutter-lg">
                <div class="col">
                  <q-input
                    v-model="form.id"
                    dense
                    class="q-field--with-bottom"
                    :disable="!isCreate"
                    :label="gettext('Name')"
                    :error="!form.id"
                    :error-message="gettext('This field is required')"
                  /><q-input
                    v-if="hasIp"
                    v-model="form.ip_prefix"
                    dense
                    class="q-field--with-bottom"
                    :disable="disableIpPrefixEdit"
                    :label="gettext('IPv4 Prefix')"
                    placeholder="192.0.2.0/24"
                    :error="!prefixValid"
                    :error-message="gettext('Either IPv4 Prefix or IPv6 Prefix is required')"
                  /><q-input
                    v-if="hasIp6"
                    v-model="form.ip6_prefix"
                    dense
                    class="q-field--with-bottom"
                    :disable="disableIpPrefixEdit"
                    :label="gettext('IPv6 Prefix')"
                    placeholder="2001:db8::/64"
                  />
                </div>
                <div class="col">
                  <template v-if="protocol === 'openfabric'"
                    ><q-input
                      v-model="form.hello_interval"
                      dense
                      type="number"
                      class="q-field--with-bottom"
                      :label="gettext('Hello Interval')" /><q-input
                      v-model="form.csnp_interval"
                      dense
                      type="number"
                      class="q-field--with-bottom"
                      :label="gettext('CSNP Interval')" /></template
                  ><q-input
                    v-else-if="protocol === 'ospf'"
                    v-model="form.area"
                    dense
                    class="q-field--with-bottom"
                    :label="gettext('Area')"
                  /><q-input
                    v-else-if="protocol === 'wireguard'"
                    v-model="form.persistent_keepalive"
                    dense
                    type="number"
                    min="1"
                    max="65535"
                    class="q-field--with-bottom"
                    :label="`${gettext('Persistent Keepalive')} (s)`"
                    :placeholder="gettext('off')"
                  /><template v-else
                    ><q-checkbox
                      v-model="form.bfd"
                      dense
                      :label="gettext('BFD')" /><q-expansion-item dense :label="gettext('Advanced')"
                      ><q-input
                        v-model="form.route_map_in"
                        dense
                        class="q-field--with-bottom"
                        :label="gettext('Incoming Route Map')" /><q-input
                        v-model="form.route_map_out"
                        dense
                        class="q-field--with-bottom"
                        :label="gettext('Outgoing Route Map')" /></q-expansion-item></template
                  ><q-input
                    v-if="protocol !== 'wireguard'"
                    v-model="form.route_filter"
                    dense
                    class="q-field--with-bottom"
                    :label="gettext('Route Filter')"
                    :placeholder="gettext('IP Prefixes')"
                  />
                </div>
              </div></div></q-tab-panel
          ><q-tab-panel v-if="hasRedistribution" name="redistribution" class="q-pa-none"
            ><div class="u-border q-pa-md">
              <RedistributionEditor
                v-model="form.redistribute"
                :sources="redistributionSources"
              /></div></q-tab-panel
        ></q-tab-panels>
      </div>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!form.id || !prefixValid || !redistributionValid"
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save" /></template></UWindow
  ></q-dialog>
</template>
