<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import { gettext } from '@/locale';

export type WireGuardPeer = {
  node: string;
  node_iface?: string;
  type?: string;
  endpoint?: string;
  skip_route_generation?: boolean;
};
export type WireGuardInterface = {
  name: string;
  listen_port: string;
  ip: string;
  ip6: string;
  public_key?: string;
  peers: WireGuardPeer[];
  isCreate?: boolean;
};

const interfaces = defineModel<WireGuardInterface[]>({ default: () => [] });
const selected = defineModel<number | null>('selected', { default: null });
const { peers = [] } = defineProps<{ peers?: WireGuardPeer[] }>();
const $q = useQuasar();
const active = computed(() =>
  selected.value === null ? undefined : interfaces.value[selected.value],
);
function add() {
  const usedNames = new Set(interfaces.value.map((item) => item.name));
  let index = 0;
  while (usedNames.has(`wg${index}`)) index++;
  const usedPorts = new Set(interfaces.value.map((item) => Number(item.listen_port)));
  let port = 51820;
  while (usedPorts.has(port)) port++;
  interfaces.value = [
    ...interfaces.value,
    { name: `wg${index}`, listen_port: String(port), ip: '', ip6: '', peers: [], isCreate: true },
  ];
  selected.value = interfaces.value.length - 1;
}
function remove(index: number) {
  const item = interfaces.value[index];
  if (!item) return;
  const apply = () => {
    interfaces.value = interfaces.value.filter((_, itemIndex) => itemIndex !== index);
    selected.value = interfaces.value.length ? Math.min(index, interfaces.value.length - 1) : null;
  };
  if (item.isCreate) {
    apply();
    return;
  }
  $q.dialog({
    title: gettext('Confirm'),
    message: gettext(
      "Remove interface '{0}'? Any generated private key will be discarded on save.",
    ).replace('{0}', item.name),
    cancel: true,
    persistent: true,
  }).onOk(apply);
}
function addPeer() {
  if (!active.value) return;
  active.value.peers.push({
    node: '',
    node_iface: '',
    type: '',
    endpoint: '',
    skip_route_generation: false,
  });
}
function removePeer(index: number) {
  active.value?.peers.splice(index, 1);
}
function syncPeer(peer: WireGuardPeer) {
  const match =
    peers.find(
      (candidate) => candidate.node === peer.node && candidate.node_iface === peer.node_iface,
    ) || peers.find((candidate) => candidate.node === peer.node);
  if (!match) return;
  peer.type = match.type || '';
  peer.endpoint = match.endpoint || '';
}
function selectPeerNode(peer: WireGuardPeer) {
  const candidate = peers.find((item) => item.node === peer.node);
  peer.node_iface = candidate?.node_iface || '';
  syncPeer(peer);
}
</script>
<template>
  <div class="wg-interface-editor row q-col-gutter-md">
    <div class="col-4">
      <q-table
        flat
        bordered
        dense
        row-key="name"
        :rows="interfaces"
        :columns="[
          { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
          { name: 'remove', label: '', field: 'name', align: 'right' },
        ]"
        :pagination="{ rowsPerPage: 0 }"
        @row-click="(_, __, index) => (selected = index)"
        ><template #body-cell-remove="scope"
          ><q-td :props="scope"
            ><q-btn
              flat
              dense
              color="negative"
              icon="delete"
              @click.stop="remove(scope.rowIndex)" /></q-td></template></q-table
      ><q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button q-mt-sm"
        :label="gettext('Add Interface')"
        @click="add"
      />
    </div>
    <div v-if="active" class="col u-border q-pa-md u-dense">
      <div class="row q-col-gutter-lg">
        <div class="col">
          <q-input
            v-model="active.name"
            :disable="!active.isCreate"
            dense
            class="q-field--with-bottom"
            :label="gettext('Name')"
          /><q-input
            v-model="active.listen_port"
            dense
            type="number"
            min="1"
            max="65535"
            class="q-field--with-bottom"
            :label="gettext('Listen Port')"
          /><q-input
            v-model="active.ip"
            dense
            class="q-field--with-bottom"
            :label="gettext('IPv4 Address')"
            placeholder="198.51.100.1/24"
          /><q-input
            v-model="active.ip6"
            dense
            class="q-field--with-bottom"
            :label="gettext('IPv6 Address')"
            placeholder="2001:db8::1/64"
          />
        </div>
        <div class="col">
          <q-input
            :model-value="active.public_key || gettext('generated on save')"
            dense
            readonly
            class="q-field--with-bottom"
            :label="gettext('Public Key')"
          /><q-table
            flat
            bordered
            dense
            :row-key="(peer) => `${peer.node}:${peer.node_iface || ''}`"
            :rows="active.peers"
            :columns="[
              { name: 'node', label: gettext('Name'), field: 'node', align: 'left' },
              {
                name: 'node_iface',
                label: gettext('Interface'),
                field: 'node_iface',
                align: 'left',
              },
              { name: 'endpoint', label: gettext('Endpoint'), field: 'endpoint', align: 'left' },
              {
                name: 'skip',
                label: gettext('Skip Route Generation'),
                field: 'skip_route_generation',
                align: 'center',
              },
              { name: 'remove', label: '', field: 'node', align: 'right' },
            ]"
            :pagination="{ rowsPerPage: 0 }"
            ><template #body-cell-node="scope"
              ><q-td :props="scope"
                ><q-select
                  v-model="scope.row.node"
                  dense
                  borderless
                  emit-value
                  map-options
                  :options="peers.map((peer) => ({ label: peer.node, value: peer.node }))"
                  @update:model-value="() => selectPeerNode(scope.row)" /></q-td></template
            ><template #body-cell-node_iface="scope"
              ><q-td :props="scope"
                ><q-select
                  v-model="scope.row.node_iface"
                  dense
                  borderless
                  emit-value
                  map-options
                  :options="
                    peers
                      .filter((peer) => peer.node === scope.row.node)
                      .map((peer) => ({
                        label: peer.node_iface || '-',
                        value: peer.node_iface || '',
                      }))
                  "
                  @update:model-value="syncPeer(scope.row)" /></q-td></template
            ><template #body-cell-endpoint="scope"
              ><q-td :props="scope"
                ><q-input
                  :model-value="scope.row.endpoint"
                  dense
                  borderless
                  readonly /></q-td></template
            ><template #body-cell-skip="scope"
              ><q-td :props="scope"
                ><q-checkbox v-model="scope.row.skip_route_generation" dense /></q-td></template
            ><template #body-cell-remove="scope"
              ><q-td :props="scope"
                ><q-btn
                  flat
                  dense
                  color="negative"
                  icon="delete"
                  @click="removePeer(scope.rowIndex)" /></q-td></template></q-table
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button q-mt-sm"
            :label="gettext('Add') + ' ' + gettext('Peer')"
            @click="addPeer"
          />
        </div>
      </div>
    </div>
    <div v-else class="col flex flex-center text-grey-7">
      {{ gettext('Select an interface to configure, or add a new one.') }}
    </div>
  </div>
</template>
