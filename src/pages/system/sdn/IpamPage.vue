<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { deleteSdnIpamMapping, getIpamsPveStatus } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import IpamMappingEditor from './IpamMappingEditor.vue';

defineOptions({ name: 'CtIpamPage' });

type IpamRowType = 'zone' | 'vnet' | 'subnet' | 'mapping';

interface IpamTreeRow extends PveRecord {
  _key: string;
  type: IpamRowType;
  name: string;
  depth: number;
  zone?: string;
  vnet?: string;
  subnet?: string;
  vmid?: string | number;
  ip?: string;
  mac?: string;
  gateway?: unknown;
  children?: IpamTreeRow[];
}

const loading = ref(false);
const rawMappings = shallowRef<PveRecord[]>([]);
const expanded = shallowRef(new Set<string>());

const editorVisible = ref(false);
const editorProps = shallowRef<{
  mode: 'create' | 'edit';
  zone: string;
  vnet: string;
  mapping?: PveRecord;
}>({
  mode: 'create',
  zone: '',
  vnet: '',
});

function compareIp(a: PveRecord, b: PveRecord): number {
  const ipA = textValue(a.ip);
  const ipB = textValue(b.ip);
  if (!ipA && !ipB) return 0;
  if (!ipA) return 1;
  if (!ipB) return -1;
  if (ipA.includes(':') || ipB.includes(':')) return ipA.localeCompare(ipB);
  const partsA = ipA.split('.').map((n) => Number(n));
  const partsB = ipB.split('.').map((n) => Number(n));
  for (let i = 0; i < 4; i++) {
    const pa = partsA[i] ?? 0;
    const pb = partsB[i] ?? 0;
    if (pa !== pb) return pa - pb;
  }
  return 0;
}

function compareName(a: PveRecord, b: PveRecord): number {
  const na = textValue(a.name || a.vmid);
  const nb = textValue(b.name || b.vmid);
  return na.localeCompare(nb);
}

function sortTree(rows: IpamTreeRow[]): IpamTreeRow[] {
  rows.sort((a, b) => {
    if (a.type === 'mapping' && b.type === 'mapping') {
      const ipCmp = compareIp(a, b);
      if (ipCmp !== 0) return ipCmp;
    }
    return compareName(a, b);
  });

  for (const row of rows) {
    if (row.children && row.children.length) {
      sortTree(row.children);
    }
  }

  return rows;
}

function buildTree(data: PveRecord[]): IpamTreeRow[] {
  const zones = new Map<string, IpamTreeRow>();
  const vnets = new Map<string, IpamTreeRow>();
  const subnets = new Map<string, IpamTreeRow>();

  for (const item of data) {
    const zone = textValue(item.zone);
    const vnet = textValue(item.vnet);
    const subnet = textValue(item.subnet);

    if (!zone || !vnet || !subnet) continue;

    const zoneKey = zone;
    const vnetKey = `${zone}:${vnet}`;
    const subnetKey = `${zone}:${vnet}:${subnet}`;

    let zoneRow = zones.get(zoneKey);

    if (!zoneRow) {
      zoneRow = {
        _key: `zone:${zone}`,
        type: 'zone',
        name: zone,
        depth: 0,
        zone,
        children: [],
      };
      zones.set(zoneKey, zoneRow);
    }

    let vnetRow = vnets.get(vnetKey);

    if (!vnetRow) {
      vnetRow = {
        _key: `vnet:${zone}:${vnet}`,
        type: 'vnet',
        name: vnet,
        depth: 1,
        zone,
        vnet,
        children: [],
      };
      vnets.set(vnetKey, vnetRow);
      zoneRow.children!.push(vnetRow);
    }

    let subnetRow = subnets.get(subnetKey);

    if (!subnetRow) {
      subnetRow = {
        _key: `subnet:${zone}:${vnet}:${subnet}`,
        type: 'subnet',
        name: subnet,
        depth: 2,
        zone,
        vnet,
        subnet,
        children: [],
      };
      subnets.set(subnetKey, subnetRow);
      vnetRow.children!.push(subnetRow);
    }

    const mappingName = item.gateway ? gettext('Gateway') : textValue(item.vmid) || ' ';

    subnetRow.children!.push({
      ...item,
      _key: ['mapping', zone, vnet, subnet, textValue(item.mac), textValue(item.ip)].join(':'),
      type: 'mapping',
      name: mappingName,
      depth: 3,
      zone,
      vnet,
      subnet,
    });
  }

  return sortTree([...zones.values()]);
}

const treeRows = computed<IpamTreeRow[]>(() => buildTree(rawMappings.value));

function flatten(rows: IpamTreeRow[], out: IpamTreeRow[] = []): IpamTreeRow[] {
  for (const row of rows) {
    out.push(row);
    if (row.children && row.children.length && expanded.value.has(row._key)) {
      flatten(row.children, out);
    }
  }
  return out;
}

const visibleRows = computed<IpamTreeRow[]>(() => flatten(treeRows.value));

function expandAll() {
  const keys = new Set<string>();
  function walk(rows: IpamTreeRow[]) {
    for (const row of rows) {
      if (row.children && row.children.length) {
        keys.add(row._key);
        walk(row.children);
      }
    }
  }
  walk(treeRows.value);
  expanded.value = keys;
}

function toggle(row: IpamTreeRow) {
  if (!row.children || !row.children.length) return;
  const next = new Set(expanded.value);
  if (next.has(row._key)) next.delete(row._key);
  else next.add(row._key);
  expanded.value = next;
}

function displayName(row: IpamTreeRow): string {
  if (row.type === 'mapping' && row.gateway) {
    return gettext('Gateway');
  }
  return row.name || textValue(row.vmid) || ' ';
}

function displayCell(row: IpamTreeRow, key: 'ip' | 'mac' | 'gateway'): string {
  if (row.type !== 'mapping') return '-';
  const val = row[key];
  if (val === undefined || val === null || val === '') return '-';
  return textValue(val);
}

function hasChildren(row: IpamTreeRow): boolean {
  return Boolean(row.children && row.children.length);
}

function isRegularMapping(row: IpamTreeRow): boolean {
  return row.type === 'mapping' && !row.gateway;
}

function openCreate(row: IpamTreeRow) {
  if (row.type !== 'vnet' || !row.zone || !row.vnet) return;
  editorProps.value = {
    mode: 'create',
    zone: row.zone,
    vnet: row.vnet,
    mapping: { zone: row.zone, vnet: row.vnet },
  };
  editorVisible.value = true;
}

function openEdit(row: IpamTreeRow) {
  if (!isRegularMapping(row) || !row.zone || !row.vnet) return;
  editorProps.value = {
    mode: 'edit',
    zone: row.zone,
    vnet: row.vnet,
    mapping: {
      zone: row.zone,
      vnet: row.vnet,
      vmid: textValue(row.vmid),
      mac: textValue(row.mac),
      ip: textValue(row.ip),
    },
  };
  editorVisible.value = true;
}

function onRowDblClick(_evt: unknown, row: IpamTreeRow) {
  if (!isRegularMapping(row)) return;
  openEdit(row);
}

function deleteRow(row: IpamTreeRow) {
  if (!isRegularMapping(row) || !row.vnet || !row.zone || !row.mac || !row.ip) return;
  const vnet = textValue(row.vnet);
  const zone = textValue(row.zone);
  const mac = textValue(row.mac);
  const ip = textValue(row.ip);
  if (!vnet || !zone || !mac || !ip) return;

  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure you want to remove DHCP mapping {0}').replace(
      '{0}',
      `${mac} / ${ip}`,
    ),
    persistent: true,
    ok: { label: gettext('Yes') },
    cancel: { label: gettext('No') },
  }).onOk(() => {
    void (async () => {
      loading.value = true;
      try {
        await deleteSdnIpamMapping(vnet, { zone, mac, ip });
        await reload();
      } finally {
        loading.value = false;
      }
    })();
  });
}

const columns: QTableColumn<IpamTreeRow>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name / VMID'),
    align: 'left',
    field: (row) => displayName(row),
    sortable: true,
  },
  {
    name: 'ip',
    label: gettext('IP Address'),
    align: 'left',
    field: (row) => displayCell(row, 'ip'),
    sortable: true,
    sort: (a: IpamTreeRow, b: IpamTreeRow) => compareIp(a, b),
  },
  {
    name: 'mac',
    label: 'MAC',
    align: 'left',
    field: (row) => displayCell(row, 'mac'),
    sortable: true,
  },
  {
    name: 'gateway',
    label: gettext('Gateway'),
    align: 'left',
    field: (row) => displayCell(row, 'gateway'),
    sortable: true,
  },
  {
    name: 'actions',
    label: gettext('Actions'),
    align: 'right',
    field: () => '',
  },
];

async function reload() {
  loading.value = true;
  try {
    const response = await getIpamsPveStatus();
    rawMappings.value = response.data || [];
    expandAll();
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<template>
  <div class="sdn-page sdn-ipam bg-white">
    <q-table
      flat
      row-key="_key"
      table-header-class="u-table-header"
      :rows="visibleRows"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 0 }"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('no record can be found')"
      @row-dblclick="onRowDblClick"
    >
      <template #top>
        <div class="row q-gutter-sm q-pa-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Reload')"
            @click="reload"
          />
        </div>
      </template>

      <template #body-cell-name="scope">
        <q-td :props="scope" :props-key="scope.col.name">
          <div
            class="row items-center no-wrap"
            :style="{ paddingLeft: `${scope.row.depth * 20}px` }"
          >
            <q-btn
              v-if="hasChildren(scope.row)"
              flat
              dense
              round
              size="xs"
              :icon="expanded.has(scope.row._key) ? 'expand_more' : 'chevron_right'"
              @click.stop="toggle(scope.row)"
            />
            <q-space v-else style="width: 20px; height: 20px; flex: none" />
            <span
              class="q-ml-xs text-sm truncate"
              :class="{ 'text-grey-6': scope.row.type === 'mapping' && scope.row.gateway }"
              :title="displayName(scope.row)"
            >
              {{ displayName(scope.row) }}
            </span>
          </div>
        </q-td>
      </template>

      <template #body-cell-actions="scope">
        <q-td :props="scope" :props-key="scope.col.name" auto-width>
          <div class="row q-gutter-xs items-center justify-end">
            <q-btn
              v-if="scope.row.type === 'vnet'"
              flat
              dense
              size="xs"
              color="primary"
              icon="add"
              :title="gettext('Add DHCP Mapping')"
              @click="openCreate(scope.row)"
            />
            <q-btn
              v-else-if="isRegularMapping(scope.row)"
              flat
              dense
              size="xs"
              color="primary"
              icon="edit"
              :title="gettext('Edit')"
              @click="openEdit(scope.row)"
            />
            <q-btn
              v-if="isRegularMapping(scope.row)"
              flat
              dense
              size="xs"
              color="red"
              icon="delete"
              :title="gettext('Delete')"
              @click="deleteRow(scope.row)"
            />
          </div>
        </q-td>
      </template>
    </q-table>

    <IpamMappingEditor
      v-model="editorVisible"
      :mode="editorProps.mode"
      :zone="editorProps.zone"
      :vnet="editorProps.vnet"
      :mapping="editorProps.mapping ?? {}"
      @saved="reload"
    />
  </div>
</template>

<style scoped>
.sdn-page {
  margin: 16px;
  background: #fff;
}

.sdn-ipam {
  min-height: calc(100vh - 96px);
}
</style>
