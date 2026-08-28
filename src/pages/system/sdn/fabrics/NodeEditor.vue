<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import {
  getSdnFabricNode,
  getSdnFabricNodes,
  getSdnFabrics,
  saveSdnFabricNode,
  type SdnFabricProtocol,
} from '@/api/sdn';
import { getNodes, type PveRecord } from '@/api/resources';
import { getNodeNetwork } from '@/api/host';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import WireGuardInterfaceEditor, {
  type WireGuardInterface,
  type WireGuardPeer,
} from './WireGuardInterfaceEditor.vue';
import OpenFabricInterfaceEditor from './OpenFabricInterfaceEditor.vue';
import OspfInterfaceEditor from './OspfInterfaceEditor.vue';
import BgpInterfaceEditor from './BgpInterfaceEditor.vue';

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });
const props = defineProps<{
  protocol: SdnFabricProtocol;
  fabricId: string;
  nodeId?: string | undefined;
  disallowedNodes?: string[] | undefined;
  fabricIpPrefix?: string | undefined;
  fabricIp6Prefix?: string | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();
const isCreate = computed(() => !props.nodeId);
const isWireguard = computed(() => props.protocol === 'wireguard');
const nodeOptions = shallowRef<{ label: string; value: string }[]>([]);
const interfaces = shallowRef<PveRecord[]>([]);
const selectedInterfaces = shallowRef<PveRecord[]>([]);
const wireguardInterfaces = shallowRef<WireGuardInterface[]>([]);
const selectedWireguardInterface = shallowRef<number | null>(null);
const wireguardPeers = shallowRef<WireGuardPeer[]>([]);
const availableWireguardPeers = computed(() =>
  wireguardPeers.value.filter((peer) => peer.node !== textValue(form.node_id))
);
const form = reactive({
  node_id: '',
  role: 'internal',
  public_key: '',
  endpoint: '',
  allowed_ips: '',
  ip: '',
  ip6: '',
  asn: '',
  digest: '',
});
function resetNodeForm() {
  Object.assign(form, {
    node_id: '',
    role: 'internal',
    public_key: '',
    endpoint: '',
    allowed_ips: '',
    ip: '',
    ip6: '',
    asn: '',
    digest: '',
  });
  interfaces.value = [];
  selectedInterfaces.value = [];
  wireguardInterfaces.value = [];
  wireguardPeers.value = [];
  selectedWireguardInterface.value = null;
}
const asnValid = computed(() => {
  const value = Number(form.asn);
  return props.protocol !== 'bgp' || (Number.isInteger(value) && value >= 1 && value <= 4294967295);
});
const externalWireguardValid = computed(
  () =>
    !isWireguard.value ||
    form.role !== 'external' ||
    (Boolean(form.endpoint.trim()) && /^[A-Za-z0-9+/]{43}=$/.test(form.public_key.trim()))
);
const wireguardPeersValid = computed(() => {
  for (const iface of wireguardInterfaces.value) {
    const seen = new Set<string>();
    for (const peer of iface.peers) {
      if (!peer.node) return false;
      const key = `${peer.node}:${peer.node_iface || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
});
const interfaceColumns = computed(() => [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left' as const },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' as const },
  ...(props.protocol === 'bgp'
    ? []
    : [{ name: 'ip', label: gettext('IPv4'), field: 'ip', align: 'left' as const }]),
  ...(props.protocol === 'openfabric'
    ? [{ name: 'ip6', label: gettext('IPv6'), field: 'ip6', align: 'left' as const }]
    : []),
  ...(props.protocol === 'ospf'
    ? [
        {
          name: 'network_type',
          label: gettext('Network Type'),
          field: 'network_type',
          align: 'left' as const,
        },
      ]
    : []),
]);
function parseInterfaces(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => {
        const r: PveRecord = {};
        String(item)
          .split(',')
          .forEach((pair) => {
            const [key, ...rest] = pair.split('=');
            if (key) r[key] = rest.join('=');
          });
        return r;
      })
    : [];
}
function printProperties(value: PveRecord) {
  return Object.entries(value)
    .filter(
      ([key, item]) =>
        !['peers', 'public_key', 'endpoint', 'allowed_ips', 'id', 'isCreate'].includes(key) &&
        item !== '' &&
        item !== undefined &&
        item !== null
    )
    .map(([key, item]) => `${key}=${textValue(item)}`)
    .join(',');
}
function wireguardPayload() {
  const peers: string[] = [];
  const items = wireguardInterfaces.value.map((item) => {
    item.peers.forEach((peer) => {
      const data: PveRecord = { iface: item.name, ...peer };
      peers.push(printProperties(data));
    });
    return printProperties(item as PveRecord);
  });
  return { interfaces: items, peers };
}
function printInterfaces() {
  return selectedInterfaces.value.map((item) =>
    Object.entries(item)
      .filter(([key, value]) => {
        if (
          ['type', 'cidr', 'cidr6', 'iface', 'isDisabled'].includes(key) ||
          value === '' ||
          value === undefined
        )
          return false;
        if (key === 'ip' && props.protocol === 'bgp') return false;
        if (key === 'ip6' && (props.protocol === 'ospf' || props.protocol === 'bgp')) return false;
        return true;
      })
      .map(([key, value]) => `${key}=${textValue(value)}`)
      .join(',')
  );
}
async function loadInterfaces(node: string) {
  if (!node || (isWireguard.value && form.role === 'external')) {
    interfaces.value = [];
    selectedInterfaces.value = [];
    return;
  }
  const [network, fabrics] = await Promise.all([
    getNodeNetwork(node),
    props.protocol === 'ospf' || props.protocol === 'bgp'
      ? getSdnFabrics()
      : Promise.resolve(undefined),
  ]);
  const wireguard = (fabrics?.data?.nodes || [])
    .filter((item) => textValue(item.node_id) === node && textValue(item.protocol) === 'wireguard')
    .flatMap((item) =>
      parseInterfaces(item.interfaces).map((iface) => ({
        name: textValue(iface.name),
        type: 'wireguard',
        ip: '',
        ip6: '',
      }))
    );
  interfaces.value = [
    ...(network.data || [])
      .filter((i) => i.iface)
      .map((i) => ({
        name: textValue(i.iface),
        type: textValue(i.type),
        ip: textValue(i.cidr),
        ip6: textValue(i.cidr6),
      })),
    ...wireguard,
  ].sort((a, b) => textValue(a.name).localeCompare(textValue(b.name)));
}
async function load() {
  loading.value = true;
  try {
    resetNodeForm();
    const nodes = await getNodes();
    nodeOptions.value = (nodes.data || [])
      .map((n) => textValue(n.node))
      .filter((node) => !props.disallowedNodes?.includes(node) || node === props.nodeId)
      .sort()
      .map((node) => ({ label: node, value: node }));
    if (isWireguard.value) {
      const fabricResponse = await getSdnFabricNodes(props.fabricId);
      wireguardPeers.value = (fabricResponse.data || [])
        .filter((item) => textValue(item.node_id) !== textValue(props.nodeId || form.node_id))
        .flatMap((item) => {
          const role = textValue(item.role) || 'internal';
          const base = {
            node: textValue(item.node_id),
            type: role,
            endpoint: textValue(item.endpoint),
          };
          return role === 'internal'
            ? parseInterfaces(item.interfaces).map((iface) => ({
                ...base,
                node_iface: textValue(iface.name),
              }))
            : [base];
        });
    }
    if (props.nodeId) {
      const r = await getSdnFabricNode(props.fabricId, props.nodeId);
      Object.assign(form, (r.data || {}) as Partial<typeof form>);
      form.allowed_ips = Array.isArray(r.data?.allowed_ips)
        ? r.data.allowed_ips.map((value) => textValue(value)).join(', ')
        : textValue(r.data?.allowed_ips);
      const saved = parseInterfaces(r.data?.interfaces);
      if (isWireguard.value) {
        const peerRows = parseInterfaces(r.data?.peers);
        wireguardInterfaces.value = saved.map((item) => ({
          name: textValue(item.name),
          listen_port: textValue(item.listen_port),
          ip: textValue(item.ip),
          ip6: textValue(item.ip6),
          public_key: textValue(item.public_key),
          peers: peerRows
            .filter((peer) => textValue(peer.iface) === textValue(item.name))
            .map((peer) => ({
              node: textValue(peer.node),
              node_iface: textValue(peer.node_iface),
              type: textValue(peer.type),
              endpoint:
                textValue(peer.endpoint) ||
                textValue(
                  wireguardPeers.value.find(
                    (candidate) =>
                      candidate.node === textValue(peer.node) &&
                      candidate.node_iface === textValue(peer.node_iface)
                  )?.endpoint
                ),
              skip_route_generation: textValue(peer.skip_route_generation) === '1',
            })),
        }));
        selectedWireguardInterface.value = wireguardInterfaces.value.length ? 0 : null;
      } else {
        await loadInterfaces(textValue(form.node_id) || props.nodeId);
        const selectedNames = new Set(saved.map((item) => textValue(item.name)));
        interfaces.value = interfaces.value.map((iface) => ({
          ...iface,
          ...saved.find((item) => textValue(item.name) === textValue(iface.name)),
        }));
        selectedInterfaces.value = interfaces.value.filter((item) =>
          selectedNames.has(textValue(item.name))
        );
      }
    } else {
      form.node_id = nodeOptions.value[0]?.value || '';
      await loadInterfaces(textValue(form.node_id));
    }
  } finally {
    loading.value = false;
  }
}
watch(visible, (open) => {
  if (open) void load();
});
watch(
  () => form.node_id,
  (node) => {
    const nodeId = textValue(node);
    if (visible.value && nodeId && nodeId !== props.nodeId) void loadInterfaces(nodeId);
  }
);
async function save() {
  if (
    !textValue(form.node_id) ||
    !asnValid.value ||
    !externalWireguardValid.value ||
    !wireguardPeersValid.value
  )
    return;
  loading.value = true;
  try {
    const selected = printInterfaces();
    const payload: PveRecord = {
      protocol: props.protocol,
      node_id: textValue(form.node_id),
      digest: form.digest,
    };
    const deleted = new Set<string>();
    if (isWireguard.value && form.role === 'internal') {
      const wg = wireguardPayload();
      if (wg.interfaces.length) {
        payload.interfaces = wg.interfaces;
        if (wg.peers.length) payload.peers = wg.peers;
        else if (!isCreate.value) deleted.add('peers');
      } else if (!isCreate.value) {
        deleted.add('interfaces');
        deleted.add('peers');
      }
    } else if (selected.length) payload.interfaces = selected;
    else if (!isCreate.value) deleted.add('interfaces');
    if (props.fabricIpPrefix) {
      if (form.ip) payload.ip = form.ip;
      else if (!isCreate.value) deleted.add('ip');
    }
    if (props.fabricIp6Prefix && props.protocol !== 'ospf') {
      if (form.ip6) payload.ip6 = form.ip6;
      else if (!isCreate.value) deleted.add('ip6');
    }
    if (props.protocol === 'bgp') payload.asn = form.asn;
    if (isWireguard.value) {
      const allowedIps = textValue(form.allowed_ips)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      if (form.endpoint) payload.endpoint = form.endpoint;
      else if (!isCreate.value) deleted.add('endpoint');
      if (allowedIps.length) payload.allowed_ips = allowedIps;
      else if (!isCreate.value) deleted.add('allowed_ips');
      Object.assign(payload, {
        role: form.role,
        ...(form.role === 'external' ? { public_key: form.public_key } : {}),
      });
    }
    if (deleted.size) payload.delete = [...deleted];
    await saveSdnFabricNode(props.fabricId, props.nodeId, payload);
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
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${gettext('Node')}`"
      width="800px"
      :loading="loading"
    >
      <div class="q-pa-sm u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col">
              <q-select
                v-if="!isWireguard || form.role === 'internal'"
                v-model="form.node_id"
                dense
                options-dense
                emit-value
                map-options
                :disable="!isCreate"
                :options="nodeOptions"
                class="q-field--with-bottom"
                :label="isCreate ? `${gettext('Node')} *` : gettext('Node')"
              />
              <q-select
                v-if="isWireguard && isCreate"
                v-model="form.role"
                dense
                options-dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('Role')"
                :options="[
                  { label: gettext('Internal (cluster member)'), value: 'internal' },
                  { label: gettext('External peer'), value: 'external' },
                ]"
              />
              <q-input
                v-if="isWireguard && form.role === 'external'"
                v-model="form.node_id"
                dense
                :disable="!isCreate"
                class="q-field--with-bottom"
                :label="isCreate ? `${gettext('Name')} *` : gettext('Name')"
              />
              <q-input
                v-if="fabricIpPrefix && !isWireguard"
                v-model="form.ip"
                dense
                class="q-field--with-bottom"
                :label="gettext('IPv4')"
              />
              <q-input
                v-if="fabricIp6Prefix && protocol !== 'ospf' && !isWireguard"
                v-model="form.ip6"
                dense
                class="q-field--with-bottom"
                :label="gettext('IPv6')"
              />
            </div>
            <div class="col">
              <q-input
                v-if="protocol === 'bgp'"
                v-model="form.asn"
                dense
                type="number"
                min="1"
                max="4294967295"
                class="q-field--with-bottom"
                :label="`${gettext('ASN')} *`"
                :error="!form.asn"
                :error-message="gettext('This field is required')"
              />
              <template v-if="isWireguard">
                <q-input
                  v-model="form.endpoint"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('Endpoint')"
                  :placeholder="gettext('Host that peers connect to')"
                />
                <q-input
                  v-if="form.role === 'external'"
                  v-model="form.public_key"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('Public Key')"
                />
                <q-input
                  v-model="form.allowed_ips"
                  dense
                  class="q-field--with-bottom"
                  :label="gettext('Allowed IPs')"
                  :placeholder="
                    gettext('Destination CIDRs that route to this node, comma-separated')
                  "
                />
              </template>
            </div>
          </div>
          <q-table
            v-if="false"
            class="q-mt-md fabric-interface-table"
            flat
            bordered
            dense
            row-key="name"
            selection="multiple"
            :rows="interfaces"
            :selected="selectedInterfaces"
            :columns="interfaceColumns"
            :pagination="{ rowsPerPage: 0 }"
            @update:selected="selectedInterfaces = [...$event]"
          >
            <template #body-cell-ip="scope">
              <q-td :props="scope">
                <q-input
                  v-model="scope.row.ip"
                  dense
                  borderless
                  :disable="Boolean(scope.row.cidr)"
                />
              </q-td>
            </template>
            <template #body-cell-ip6="scope">
              <q-td :props="scope">
                <q-input
                  v-model="scope.row.ip6"
                  dense
                  borderless
                  :disable="Boolean(scope.row.cidr6)"
                />
              </q-td>
            </template>
            <template #body-cell-network_type="scope">
              <q-td :props="scope">
                <q-select
                  v-model="scope.row.network_type"
                  dense
                  options-dense
                  borderless
                  emit-value
                  map-options
                  :options="['broadcast', 'non-broadcast', 'point-to-multipoint', 'point-to-point']"
                  :placeholder="gettext('auto')"
                />
              </q-td>
            </template>
          </q-table>
          <OpenFabricInterfaceEditor
            v-if="protocol === 'openfabric'"
            v-model:rows="interfaces"
            v-model:selected="selectedInterfaces"
            class="q-mt-md"
          />
          <OspfInterfaceEditor
            v-else-if="protocol === 'ospf'"
            v-model:rows="interfaces"
            v-model:selected="selectedInterfaces"
            class="q-mt-md"
          />
          <BgpInterfaceEditor
            v-else-if="protocol === 'bgp'"
            v-model:rows="interfaces"
            v-model:selected="selectedInterfaces"
            class="q-mt-md"
          />
          <WireGuardInterfaceEditor
            v-if="isWireguard && form.role === 'internal'"
            v-model="wireguardInterfaces"
            v-model:selected="selectedWireguardInterface"
            :peers="availableWireguardPeers"
            class="q-mt-md"
          />
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
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
