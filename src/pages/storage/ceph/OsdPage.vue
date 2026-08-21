<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getClusterNodes, getNodeDisks } from '@/api/resources';
import {
  changeCephOsdService,
  createCephOsd,
  destroyCephOsd,
  getCephCrush,
  getCephOsdFlags,
  getCephOsds,
  getCephStatus,
  runCephOsdCommand,
  setCephOsdFlags,
} from '@/api/ceph';
import { gettext } from '@/locale';
import CephOsdDetailsDialog from './CephOsdDetailsDialog.vue';
import CephBulkRestartOsdsDialog from './CephBulkRestartOsdsDialog.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { formatBytes, textValue } from '@/utils/pveFormat';

const loading = ref(false);
const actionLoading = ref(false);
const rows = shallowRef<PveRecord[]>([]);
const expandedKeys = ref<Record<string, boolean>>({});
const nodes = shallowRef<PveRecord[]>([]);
const selected = ref<PveRecord[]>([]);
const createVisible = ref(false);
const flagsVisible = ref(false);
const detailVisible = ref(false);
const destroyVisible = ref(false);
const cleanupDisks = ref(true);
const destroyWarnings = ref<string[]>([]);
const confirmVisible = ref(false);
const confirmMessage = ref('');
const pendingAction = ref<(() => Promise<void>) | null>(null);
const createForm = ref({
  node: '',
  dev: '',
  db_dev: '',
  db_dev_size: '',
  wal_dev: '',
  wal_dev_size: '',
  encrypted: false,
  'crush-device-class': '',
});
const unusedDiskOptions = shallowRef<string[]>([]);
const journalDiskOptions = shallowRef<string[]>([]);
const crushClassOptions = shallowRef(['hdd', 'ssd', 'nvme']);
const flags = ref<PveRecord>({});
const flagRows = shallowRef<{ name: string; description: string; value: number }[]>([]);
const bulkRestartVisible = ref(false);
const taskVisible = ref(false);
const taskUpid = ref('');
const taskNode = ref('');
const taskTitle = ref('');

const nodeOptions = computed(() =>
  nodes.value.map((node) => textValue(node.node || node.name)).filter(Boolean)
);
const current = computed(() => selected.value[0]);
const osdsByHost = computed<Record<string, number>>(() =>
  rows.value
    .filter((row) => row.type === 'osd')
    .reduce<Record<string, number>>((counts, row) => {
      const host = textValue(row.host);
      if (host) counts[host] = (counts[host] || 0) + 1;
      return counts;
    }, {})
);
const visibleRows = computed(() =>
  rows.value.filter((row) => {
    let parentKey = textValue(row._parentKey);
    while (parentKey) {
      const parent = rows.value.find((item) => textValue(item._treeKey) === parentKey);
      // The source tree root is intentionally not a table row. Its direct children are visible.
      if (!parent) break;
      if (!expandedKeys.value[parentKey]) return false;
      parentKey = textValue(parent._parentKey);
    }
    return true;
  })
);
const isOsd = computed(() =>
  Boolean(
    current.value &&
    current.value.type === 'osd' &&
    textValue(current.value.host) &&
    Number.isInteger(Number(current.value.id)) &&
    Number(current.value.id) >= 0
  )
);
const osdId = computed(() => textValue(current.value?.id ?? current.value?.osd));
const osdHost = computed(() => textValue(current.value?.host));
const isUp = computed(() =>
  Boolean(isOsd.value && textValue(current.value?.status).toLowerCase() !== 'down')
);
const { node = 'localhost' } = defineProps<{ node?: string }>();
const isIn = computed(() => Boolean(current.value?.in));
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    label: gettext('Name'),
    field: (row) =>
      textValue(row.name) || (row.id !== undefined ? `osd.${textValue(row.id)}` : '-'),
    align: 'left',
    sortable: true,
  },
  {
    name: 'host',
    label: gettext('Host'),
    field: (row) => row.host || '-',
    align: 'left',
    sortable: true,
  },
  { name: 'class', label: gettext('Class'), field: 'device_class', align: 'right', sortable: true },
  { name: 'osdtype', label: 'OSD Type', field: 'osdtype', align: 'right', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'right', sortable: true },
  { name: 'version', label: gettext('Version'), field: 'version', align: 'right', sortable: true },
  { name: 'weight', label: 'weight', field: 'crush_weight', align: 'right', sortable: true },
  { name: 'reweight', label: 'reweight', field: 'reweight', align: 'right', sortable: true },
  {
    name: 'used',
    label: `${gettext('Used')} (%)`,
    field: (row) =>
      row.percent_used === undefined ? '-' : `${Number(row.percent_used).toFixed(2)}%`,
    align: 'right',
    sortable: true,
  },
  {
    name: 'total',
    label: gettext('Total'),
    field: (row) => formatBytes(row.total_space as number),
    align: 'right',
    sortable: true,
  },
  {
    name: 'latency',
    label: 'Apply/Commit Latency (ms)',
    field: (row) =>
      `${textValue(row.apply_latency_ms, '-')} / ${textValue(row.commit_latency_ms, '-')}`,
    align: 'right',
  },
  { name: 'pgs', label: 'PGs', field: 'pgs', align: 'right', sortable: true },
];

function normalizeRows(value: unknown): PveRecord[] {
  if (Array.isArray(value)) return value as PveRecord[];
  const payload = value as PveRecord | undefined;
  if (Array.isArray(payload?.data)) return payload.data as PveRecord[];

  const result: PveRecord[] = [];
  function visit(node: unknown, inheritedHost = '', parentKey = '', depth = -1, path = 'root') {
    if (!node || typeof node !== 'object') return;
    const record = node as PveRecord;
    const host = textValue(record.host, inheritedHost);
    const children = Array.isArray(record.children) ? record.children : [];
    const name = textValue(record.name, textValue(record.id));
    const treeKey = `${path}/${name || result.length}`;
    if (depth >= 0) {
      result.push({
        ...record,
        host,
        _depth: depth,
        _hasChildren: children.length > 0,
        _treeKey: treeKey,
        _parentKey: parentKey,
      });
    }
    children.forEach((child) => visit(child, host, treeKey, depth + 1, treeKey));
  }

  const wrappedData = payload?.data as PveRecord | undefined;
  visit(payload?.root || wrappedData?.root || payload);
  return result;
}
function toggleRow(row: PveRecord) {
  const key = textValue(row._treeKey);
  if (key) expandedKeys.value = { ...expandedKeys.value, [key]: !expandedKeys.value[key] };
}
async function refreshData() {
  loading.value = true;
  try {
    const [osdResponse, nodesResponse] = await Promise.allSettled([
      getCephOsds(node),
      getClusterNodes(),
    ]);
    console.log(osdResponse, 'osdResponse');

    if (osdResponse.status === 'fulfilled') {
      rows.value = normalizeRows(osdResponse.value.data);
      console.log(rows.value, 'rows.value');
      expandedKeys.value = Object.fromEntries(
        rows.value
          .filter((row) => Boolean(row._hasChildren))
          .map((row) => [textValue(row._treeKey), true])
      );
    }
    if (nodesResponse.status === 'fulfilled') nodes.value = normalizeRows(nodesResponse.value.data);
  } finally {
    loading.value = false;
  }
}
function showTask(upid: string, fallbackNode: string, title: string) {
  taskUpid.value = upid;
  taskNode.value = upid.split(':')[1] || fallbackNode;
  taskTitle.value = title;
  taskVisible.value = Boolean(upid);
}
async function run(
  action: () => Promise<{ data?: string }>,
  fallbackNode = node,
  title = gettext('Task')
) {
  actionLoading.value = true;
  try {
    const response = await action();
    showTask(textValue(response.data), fallbackNode, title);
  } finally {
    actionLoading.value = false;
  }
}
function withConfirmation(message: string, action: () => Promise<void>) {
  confirmMessage.value = message;
  pendingAction.value = action;
  confirmVisible.value = true;
}
async function confirm() {
  const action = pendingAction.value;
  confirmVisible.value = false;
  pendingAction.value = null;
  if (action) await action();
}
function serviceAction(action: 'start' | 'stop' | 'restart') {
  if (!isOsd.value) return;
  withConfirmation(`${action} osd.${osdId.value}?`, () =>
    run(
      () => changeCephOsdService(osdHost.value, osdId.value, action),
      osdHost.value,
      `${gettext(action)}: osd.${osdId.value}`
    )
  );
}
function osdAction(action: 'in' | 'out' | 'scrub', deep = false) {
  if (!isOsd.value) return;
  const message =
    action === 'scrub'
      ? `${deep ? gettext('Deep Scrub') : gettext('Scrub')} osd.${osdId.value}?`
      : `${action} osd.${osdId.value}?`;
  withConfirmation(message, () =>
    run(
      () => runCephOsdCommand(osdHost.value, osdId.value, action, deep ? { deep: 1 } : {}),
      osdHost.value,
      `${gettext(action)}: osd.${osdId.value}`
    )
  );
}
function treeIcon(type: unknown) {
  if (type === 'root') return 'dns';
  if (type === 'host') return 'domain';
  if (type === 'osd') return 'storage';
  return 'folder';
}
function statusInfo(row: PveRecord) {
  const status = textValue(row.status).toLowerCase();
  if (!status) return null;
  const inside = Boolean(row.in);
  return {
    status,
    inOut: inside ? 'in' : 'out',
    upIcon: status === 'up' ? 'arrow_circle_up' : 'arrow_circle_down',
    upColor: status === 'up' ? 'positive' : 'negative',
    inIcon: inside ? 'circle' : 'radio_button_unchecked',
    inColor: inside ? 'positive' : 'warning',
  };
}
function openCreate() {
  createForm.value = {
    node: nodeOptions.value.includes(node) ? node : nodeOptions.value[0] || '',
    dev: '',
    db_dev: '',
    db_dev_size: '',
    wal_dev: '',
    wal_dev_size: '',
    encrypted: false,
    'crush-device-class': '',
  };
  createVisible.value = true;
}
async function create() {
  if (!createForm.value.dev) return;
  const { node, ...data } = createForm.value;
  const payload = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ''));
  await run(() => createCephOsd(node, payload), node, `${gettext('Create')}: OSD`);
  createVisible.value = false;
}
async function openFlags() {
  const response = await getCephOsdFlags();
  flags.value = response.data || {};
  const values = Array.isArray(response.data)
    ? response.data
    : Object.entries(response.data || {}).map(([name, value]) => ({ name, value }));
  flagRows.value = values.map((entry) => {
    const flag = entry as PveRecord;
    return {
      name: textValue(flag.name),
      description: textValue(flag.description),
      value: Number(flag.value) || 0,
    };
  });
  flagsVisible.value = true;
}
async function saveFlags() {
  const payload = Object.fromEntries(flagRows.value.map((flag) => [flag.name, flag.value ? 1 : 0]));
  await run(() => setCephOsdFlags(payload), node, gettext('Manage Global OSD Flags'));
  flagsVisible.value = false;
}
function destroy() {
  if (!isOsd.value) return;
  cleanupDisks.value = true;
  destroyWarnings.value = [];
  destroyVisible.value = true;
  void openDestroy();
}
async function openDestroy() {
  const [flagsResponse, statusResponse] = await Promise.allSettled([
    getCephOsdFlags(),
    getCephStatus(osdHost.value),
  ]);
  const warnings: string[] = [];
  if (
    flagsResponse.status === 'fulfilled' &&
    Object.values(flagsResponse.value.data || {}).some(Boolean)
  )
    warnings.push(gettext('Global flags limiting the self healing of Ceph are enabled.'));
  const health =
    statusResponse.status === 'fulfilled'
      ? (statusResponse.value.data?.health as PveRecord | undefined)
      : undefined;
  if (textValue(health?.status) && textValue(health?.status) !== 'HEALTH_OK')
    warnings.push(gettext('Objects are degraded. Consider waiting until the cluster is healthy.'));
  destroyWarnings.value = warnings;
}
async function confirmDestroy() {
  await run(
    () => destroyCephOsd(osdHost.value, osdId.value, { cleanup: cleanupDisks.value ? 1 : 0 }),
    osdHost.value,
    `${gettext('Destroy')}: osd.${osdId.value}`
  );
  destroyVisible.value = false;
}
async function loadCreateOptions() {
  const host = createForm.value.node;
  if (!host) return;
  const [unusedResponse, journalResponse, crushResponse] = await Promise.allSettled([
    getNodeDisks(host, { type: 'unused' }),
    getNodeDisks(host, { type: 'journal_disks' }),
    getCephCrush(host),
  ]);
  const paths = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((disk) => textValue((disk as PveRecord).devpath || (disk as PveRecord).name))
          .filter(Boolean)
      : [];
  if (unusedResponse.status === 'fulfilled')
    unusedDiskOptions.value = paths(unusedResponse.value.data);
  if (journalResponse.status === 'fulfilled')
    journalDiskOptions.value = paths(journalResponse.value.data);
  if (crushResponse.status === 'fulfilled') {
    const crushData: unknown = crushResponse.value.data;
    const text = typeof crushData === 'string' ? crushData : '';
    const custom = Array.from(
      text.matchAll(/^device\s+\d+\s+osd\.\d+\s+class\s+(.+)$/gim),
      (match) => match[1]?.trim()
    ).filter(Boolean) as string[];
    crushClassOptions.value = [...new Set(['hdd', 'ssd', 'nvme', ...custom])];
  }
}
watch([createVisible, () => createForm.value.node], ([visible]) => {
  if (visible) void loadCreateOptions();
});
watch(
  () => node,
  () => void refreshData(),
  { immediate: true }
);
</script>

<template>
  <div class="column q-gutter-md">
    <q-table
      v-model:selected="selected"
      flat
      row-key="_treeKey"
      selection="single"
      table-header-class="u-table-header"
      :rows="visibleRows"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 15 }"
      :rows-per-page-options="[15]"
      @row-dblclick="detailVisible = isOsd"
    >
      <template #top>
        <div class="row no-wrap items-center full-width osd-toolbar">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Reload OSD')"
            @click="refreshData"
          />
          <q-separator
            vertical
            inset
            class="q-mx-sm"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Create') + ': OSD'"
            @click="openCreate"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Manage Global Flags')"
            @click="openFlags"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Bulk Restart OSDs')"
            @click="bulkRestartVisible = true"
          />
          <q-space />
          <span class="text-caption q-mx-sm">
            {{ isOsd ? `osd.${osdId}:` : gettext('No OSD selected') }}
          </span>
          <q-btn
            no-caps
            outline
            size="12px"
            :color="isOsd ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd"
            :label="gettext('Details')"
            @click="detailVisible = true"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="isOsd && !isUp ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd || isUp"
            :label="gettext('Start')"
            @click="serviceAction('start')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="isOsd && isUp ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd || !isUp"
            :label="gettext('Stop')"
            @click="serviceAction('stop')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="isOsd && isUp ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd || !isUp"
            :label="gettext('Restart')"
            @click="serviceAction('restart')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="isOsd && isIn ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd || !isIn"
            label="Out"
            @click="osdAction('out')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="isOsd && !isIn ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd || isIn"
            label="In"
            @click="osdAction('in')"
          />
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            :color="isOsd ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!isOsd"
            :label="gettext('More')"
          >
            <q-list dense>
              <q-item
                clickable
                v-close-popup
                @click="osdAction('scrub')"
              >
                <q-item-section>{{ gettext('Scrub') }}</q-item-section>
              </q-item>
              <q-item
                clickable
                v-close-popup
                @click="osdAction('scrub', true)"
              >
                <q-item-section>{{ gettext('Deep Scrub') }}</q-item-section>
              </q-item>
              <q-item
                clickable
                v-close-popup
                :disable="!isOsd || isUp"
                @click="destroy"
              >
                <q-item-section class="text-negative">{{ gettext('Destroy') }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </div>
      </template>
      <template #body-cell-name="props">
        <q-td :props="props">
          <div
            class="osd-tree-name"
            :style="{ paddingLeft: `${Number(props.row._depth || 0) * 22}px` }"
          >
            <q-btn
              v-if="props.row._hasChildren"
              flat
              round
              dense
              size="sm"
              :icon="expandedKeys[textValue(props.row._treeKey)] ? 'expand_more' : 'chevron_right'"
              @click.stop="toggleRow(props.row)"
            />
            <span
              v-else
              class="osd-tree-spacer"
            />
            <q-icon
              :name="treeIcon(props.row.type)"
              size="16px"
              class="q-mr-xs"
            />
            <span>{{ props.value }}</span>
          </div>
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <div
            v-if="statusInfo(props.row)"
            class="osd-status"
          >
            <span>{{ statusInfo(props.row)?.status }}</span>
            <q-icon
              :name="statusInfo(props.row)?.upIcon"
              :color="statusInfo(props.row)?.upColor"
              size="17px"
            />
            <span>/ {{ statusInfo(props.row)?.inOut }}</span>
            <q-icon
              :name="statusInfo(props.row)?.inIcon"
              :color="statusInfo(props.row)?.inColor"
              size="15px"
            />
          </div>
          <span v-else>-</span>
        </q-td>
      </template>
    </q-table>
    <q-dialog
      v-model="createVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="osd-dialog">
        <q-card-section class="text-subtitle1">{{ gettext('Create') }}: OSD</q-card-section>
        <q-card-section class="column q-gutter-md">
          <q-select
            v-model="createForm.node"
            dense
            options-dense
            class="q-field--with-bottom"
            :label="gettext('Host')"
            :options="nodeOptions"
          />
          <q-select
            v-model="createForm.dev"
            dense
            options-dense
            class="q-field--with-bottom"
            :label="gettext('Disk')"
            :options="unusedDiskOptions"
          />
          <q-select
            v-model="createForm.db_dev"
            dense
            options-dense
            class="q-field--with-bottom"
            clearable
            :label="gettext('DB Disk')"
            :options="journalDiskOptions"
          />
          <q-input
            v-model="createForm.db_dev_size"
            dense
            type="number"
            min="1"
            max="131072"
            step="0.01"
            class="q-field--with-bottom"
            :disable="!createForm.db_dev"
            :label="`${gettext('DB size')} (${gettext('GiB')})`"
          />
          <q-select
            v-model="createForm.wal_dev"
            dense
            options-dense
            class="q-field--with-bottom"
            clearable
            :label="gettext('WAL Disk')"
            :options="journalDiskOptions"
          />
          <q-input
            v-model="createForm.wal_dev_size"
            dense
            type="number"
            min="0.5"
            max="131072"
            step="0.01"
            class="q-field--with-bottom"
            :disable="!createForm.wal_dev"
            :label="`${gettext('WAL size')} (${gettext('GiB')})`"
          />
          <q-select
            v-model="createForm['crush-device-class']"
            dense
            options-dense
            class="q-field--with-bottom"
            clearable
            :label="gettext('Device Class')"
            :options="crushClassOptions"
          />
          <q-checkbox
            v-model="createForm.encrypted"
            dense
            right-label
            color="primary"
            :label="gettext('Encrypt OSD')"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup
          />
          <q-btn
            flat
            no-caps
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!createForm.dev"
            :loading="actionLoading"
            :label="gettext('Create')"
            @click="create"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog
      v-model="flagsVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="osd-dialog">
        <q-card-section class="text-subtitle1">
          {{ gettext('Manage Global OSD Flags') }}
        </q-card-section>
        <q-card-section class="q-pa-none">
          <q-table
            flat
            dense
            hide-bottom
            row-key="name"
            table-header-class="u-table-header"
            :rows="flagRows"
            :columns="[
              { name: 'value', label: gettext('Enable'), field: 'value', align: 'center' },
              { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
              {
                name: 'description',
                label: gettext('Description'),
                field: 'description',
                align: 'left',
              },
            ]"
            :pagination="{ rowsPerPage: 0 }"
          >
            <template #body-cell-value="props">
              <q-td :props="props">
                <q-checkbox
                  v-model="props.row.value"
                  dense
                  color="primary"
                  :true-value="1"
                  :false-value="0"
                />
              </q-td>
            </template>
          </q-table>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup
          />
          <q-btn
            flat
            no-caps
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Apply')"
            @click="saveFlags"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <CephOsdDetailsDialog
      v-model:visible="detailVisible"
      :node="osdHost"
      :osd-id="osdId"
    />
    <CephBulkRestartOsdsDialog
      v-model="bulkRestartVisible"
      :node="node"
      :osds-by-host="osdsByHost"
      @started="(upid, taskNode) => showTask(upid, taskNode, gettext('Bulk Restart OSDs'))"
    />
    <TaskOutputDialog
      v-model="taskVisible"
      :node="taskNode"
      :upid="taskUpid"
      :title="taskTitle"
      @finished="refreshData"
    />
    <q-dialog
      v-model="destroyVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="osd-dialog">
        <q-card-section class="text-subtitle1">
          {{ gettext('Destroy') }}: osd.{{ osdId }}
        </q-card-section>
        <q-card-section class="column q-gutter-sm">
          <q-checkbox
            v-model="cleanupDisks"
            dense
            right-label
            color="primary"
            :label="gettext('Cleanup Disks')"
          />
          <div
            v-for="warning in destroyWarnings"
            :key="warning"
            class="warning"
          >
            {{ warning }}
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup
          />
          <q-btn
            flat
            no-caps
            size="12px"
            class="bg-negative text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Destroy')"
            @click="confirmDestroy"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog
      v-model="confirmVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="osd-dialog">
        <q-card-section class="text-subtitle1">{{ gettext('Confirm') }}</q-card-section>
        <q-card-section>{{ confirmMessage }}</q-card-section>
        <q-card-actions align="right">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup
          />
          <q-btn
            flat
            no-caps
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Confirm')"
            @click="confirm"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.osd-dialog {
  min-width: 420px;
}
.osd-toolbar {
  gap: 8px;
  overflow-x: auto;
}
.osd-toolbar > * {
  flex: 0 0 auto;
}
.osd-toolbar :deep(.q-space) {
  flex: 1 0 16px;
}
.warning {
  color: #cf4c35;
}
.osd-tree-name {
  align-items: center;
  display: flex;
  min-width: 190px;
}
.osd-tree-spacer {
  display: inline-block;
  width: 32px;
}
.osd-status {
  align-items: center;
  display: inline-flex;
  gap: 4px;
}
</style>
