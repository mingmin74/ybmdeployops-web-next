<script setup lang="ts">
import type { Component } from 'vue';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { Dialog } from 'quasar';
import {
  deleteSdnFabric,
  deleteSdnFabricNode,
  getSdnFabrics,
  type SdnFabricProtocol,
} from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import OpenFabricFabricEditor from './fabrics/OpenFabricFabricEditor.vue';
import OspfFabricEditor from './fabrics/OspfFabricEditor.vue';
import WireGuardFabricEditor from './fabrics/WireGuardFabricEditor.vue';
import BgpFabricEditor from './fabrics/BgpFabricEditor.vue';
import OpenFabricNodeEditor from './fabrics/OpenFabricNodeEditor.vue';
import OspfNodeEditor from './fabrics/OspfNodeEditor.vue';
import WireGuardNodeEditor from './fabrics/WireGuardNodeEditor.vue';
import BgpNodeEditor from './fabrics/BgpNodeEditor.vue';

type FabricRow = PveRecord & {
  type: 'fabric' | 'node';
  key: string;
  children?: FabricRow[];
  depth: number;
};
const loading = ref(false);
const selected = shallowRef<FabricRow[]>([]);
const rows = shallowRef<FabricRow[]>([]);
const expanded = shallowRef(new Set<string>());
const editorVisible = ref(false);
const editor = shallowRef<Component>();
const editorProps = shallowRef<PveRecord>({});
const protocolLabels: Record<SdnFabricProtocol, string> = {
  openfabric: 'OpenFabric',
  ospf: 'OSPF',
  wireguard: 'WireGuard',
  bgp: 'BGP',
};
const fabricEditors: Record<SdnFabricProtocol, Component> = {
  openfabric: OpenFabricFabricEditor,
  ospf: OspfFabricEditor,
  wireguard: WireGuardFabricEditor,
  bgp: BgpFabricEditor,
};
const nodeEditors: Record<SdnFabricProtocol, Component> = {
  openfabric: OpenFabricNodeEditor,
  ospf: OspfNodeEditor,
  wireguard: WireGuardNodeEditor,
  bgp: BgpNodeEditor,
};
const visibleRows = computed(() =>
  rows.value.flatMap((fabric) => [
    fabric,
    ...(expanded.value.has(fabric.key) ? fabric.children || [] : []),
  ]),
);
function merged(record: PveRecord) {
  return { ...record, ...((record.pending as PveRecord) || {}) };
}
function state(row: FabricRow) {
  return textValue(row.state);
}
function display(row: FabricRow, key: string) {
  const value = row[key];
  return value === 'deleted' || value === undefined || value === null || value === ''
    ? '-'
    : Array.isArray(value)
      ? value
          .map((item) => (textValue(item).split(',')[0] ?? '').replace(/^name=/, ''))
          .sort()
          .join(', ')
      : textValue(value);
}
function toggle(fabric: FabricRow) {
  const next = new Set(expanded.value);
  if (next.has(fabric.key)) next.delete(fabric.key);
  else next.add(fabric.key);
  expanded.value = next;
}
async function reload() {
  loading.value = true;
  try {
    const response = await getSdnFabrics();
    const fabrics = new Map<string, FabricRow>();
    (response.data?.fabrics || []).forEach((record) => {
      const item = merged(record);
      const id = textValue(item.id);
      const row: FabricRow = { ...item, type: 'fabric', key: id, depth: 0, children: [] };
      fabrics.set(id, row);
    });
    (response.data?.nodes || []).forEach((record) => {
      const item = merged(record);
      const fabricId = textValue(item.fabric_id);
      const parent = fabrics.get(fabricId);
      if (parent)
        parent.children?.push({
          ...item,
          type: 'node',
          key: `${fabricId}_${textValue(item.node_id)}`,
          depth: 1,
        });
    });
    rows.value = [...fabrics.values()].sort((a, b) => a.key.localeCompare(b.key));
    expanded.value = new Set(rows.value.map((row) => row.key));
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
function chooseFabric(protocol: SdnFabricProtocol, fabric?: FabricRow) {
  editor.value = fabricEditors[protocol];
  editorProps.value = fabric
    ? {
        fabricId: String(fabric.id),
        disableIpPrefixEdit: (fabric.children || []).some((node) => state(node) !== 'deleted'),
      }
    : {};
  editorVisible.value = true;
}
function chooseNode(fabric: FabricRow, node?: FabricRow) {
  const protocol = fabric.protocol as SdnFabricProtocol;
  editor.value = nodeEditors[protocol];
  editorProps.value = {
    fabricId: String(fabric.id),
    nodeId: node ? String(node.node_id) : undefined,
    fabricIpPrefix: fabric.ip_prefix === 'deleted' ? undefined : fabric.ip_prefix,
    fabricIp6Prefix: fabric.ip6_prefix === 'deleted' ? undefined : fabric.ip6_prefix,
    disallowedNodes: (fabric.children || [])
      .filter((item) => state(item) !== 'deleted')
      .map((item) => String(item.node_id)),
  };
  editorVisible.value = true;
}
function remove(row: FabricRow) {
  const message =
    row.type === 'fabric'
      ? gettext('Are you sure you want to remove the fabric "{0}"?').replace('{0}', String(row.id))
      : gettext('Are you sure you want to remove the node "{0}" from the fabric "{1}"?')
          .replace('{0}', String(row.node_id))
          .replace('{1}', String(row.fabric_id));
  Dialog.create({ title: gettext('Confirm'), message, cancel: true, persistent: true }).onOk(
    () =>
      void (
        row.type === 'fabric'
          ? deleteSdnFabric(String(row.id))
          : deleteSdnFabricNode(String(row.fabric_id), String(row.node_id))
      ).then(reload),
  );
}
function select(row: FabricRow) {
  selected.value = [row];
}
onMounted(() => void reload());
</script>
<template>
  <div class="q-ma-md bg-white">
    <q-table
      flat
      row-key="key"
      table-header-class="u-table-header"
      :rows="visibleRows"
      :loading="loading"
      :columns="[
        { name: 'name', label: gettext('Name'), field: 'node_id', align: 'left' },
        { name: 'protocol', label: gettext('Protocol'), field: 'protocol', align: 'left' },
        { name: 'ip', label: gettext('IPv4'), field: 'ip', align: 'left' },
        { name: 'ip6', label: gettext('IPv6'), field: 'ip6', align: 'left' },
        { name: 'interfaces', label: gettext('Interfaces'), field: 'interfaces', align: 'left' },
        { name: 'action', label: gettext('Action'), field: 'key', align: 'left' },
        { name: 'state', label: gettext('State'), field: 'state', align: 'left' },
      ]"
      :pagination="{ rowsPerPage: 0 }"
      :selected="selected"
      selection="single"
      @row-click="(_, row) => select(row)"
      @update:selected="selected = [...$event]"
      ><template #top
        ><div class="row q-gutter-sm">
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add Fabric')"
            ><q-list dense
              ><q-item
                v-for="(_, protocol) in protocolLabels"
                :key="protocol"
                v-close-popup
                clickable
                @click="chooseFabric(protocol)"
                ><q-item-section>{{ protocolLabels[protocol] }}</q-item-section></q-item
              ></q-list
            ></q-btn-dropdown
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="selected[0]?.type !== 'fabric'"
            :label="gettext('Add Node')"
            @click="selected[0] && chooseNode(selected[0])"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Reload')"
            @click="reload"
          /></div></template
      ><template #body-cell-name="scope"
        ><q-td :props="scope" @click.stop="select(scope.row)"
          ><div :style="{ paddingLeft: `${scope.row.depth * 24}px` }">
            <q-btn
              v-if="scope.row.type === 'fabric'"
              flat
              dense
              round
              size="sm"
              :icon="expanded.has(scope.row.key) ? 'expand_more' : 'chevron_right'"
              @click.stop="toggle(scope.row)"
            /><q-icon v-else name="computer" size="16px" class="q-mr-sm" />
            <span :class="{ 'fabric-deleted': state(scope.row) === 'deleted' }">{{
              scope.row.type === 'fabric' ? display(scope.row, 'id') : display(scope.row, 'node_id')
            }}</span>
          </div></q-td
        ></template
      ><template #body-cell-protocol="scope"
        ><q-td :props="scope"
          ><span :class="{ 'fabric-deleted': state(scope.row) === 'deleted' }">{{
            scope.row.type === 'fabric'
              ? protocolLabels[scope.row.protocol as SdnFabricProtocol]
              : ''
          }}</span></q-td
        ></template
      ><template #body-cell-ip="scope"
        ><q-td :props="scope">{{
          display(scope.row, scope.row.type === 'fabric' ? 'ip_prefix' : 'ip')
        }}</q-td></template
      ><template #body-cell-ip6="scope"
        ><q-td :props="scope">{{
          display(scope.row, scope.row.type === 'fabric' ? 'ip6_prefix' : 'ip6')
        }}</q-td></template
      ><template #body-cell-interfaces="scope"
        ><q-td :props="scope">{{ display(scope.row, 'interfaces') }}</q-td></template
      ><template #body-cell-action="scope"
        ><q-td :props="scope"
          ><q-btn
            v-if="scope.row.type === 'fabric'"
            flat
            dense
            color="primary"
            icon="add_circle"
            :aria-label="gettext('Add Node')"
            @click="chooseNode(scope.row)" /><q-btn
            flat
            dense
            color="primary"
            icon="edit"
            :aria-label="gettext('Edit')"
            :disable="state(scope.row) === 'deleted'"
            @click="
              scope.row.type === 'fabric'
                ? chooseFabric(scope.row.protocol, scope.row)
                : chooseNode(
                    rows.find((item) => textValue(item.id) === textValue(scope.row.fabric_id))!,
                    scope.row,
                  )
            " /><q-btn
            flat
            dense
            color="negative"
            icon="delete"
            :aria-label="gettext('Delete')"
            :disable="state(scope.row) === 'deleted'"
            @click="remove(scope.row)" /></q-td></template
      ><template #body-cell-state="scope"
        ><q-td :props="scope"
          ><q-badge
            v-if="state(scope.row)"
            :color="state(scope.row) === 'deleted' ? 'negative' : 'warning'"
            :label="state(scope.row)" /></q-td></template></q-table
    ><component
      :is="editor"
      v-if="editor"
      v-model="editorVisible"
      v-bind="editorProps"
      @saved="reload"
    />
  </div>
</template>
<style scoped>
.fabric-deleted {
  text-decoration: line-through;
}
.fabric-interface-table {
  max-height: 360px;
}
</style>
