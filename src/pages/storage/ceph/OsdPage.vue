<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getClusterNodes } from '@/api/resources';
import {
  changeCephOsdService,
  createCephOsd,
  destroyCephOsd,
  getCephOsdFlags,
  getCephOsds,
  restartCephOsds,
  runCephOsdCommand,
  setCephOsdFlags,
} from '@/api/ceph';
import { gettext } from '@/locale';
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
const confirmVisible = ref(false);
const confirmMessage = ref('');
const pendingAction = ref<(() => Promise<void>) | null>(null);
const createForm = ref({
  node: 'localhost',
  dev: '',
  db_dev: '',
  wal_dev: '',
  encrypted: false,
  'crush-device-class': '',
});
const flags = ref<PveRecord>({});
const flagNames = [
  'noout',
  'nobackfill',
  'norebalance',
  'norecover',
  'noscrub',
  'nodeep-scrub',
  'pause',
];

const nodeOptions = computed(() =>
  nodes.value.map((node) => textValue(node.node || node.name)).filter(Boolean),
);
const current = computed(() => selected.value[0]);
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
  }),
);
const isOsd = computed(() =>
  Boolean(current.value && (current.value.type === 'osd' || current.value.id !== undefined)),
);
const osdId = computed(() => textValue(current.value?.id ?? current.value?.osd));
const osdHost = computed(() => textValue(current.value?.host));
const isUp = computed(() => textValue(current.value?.status).toLowerCase().includes('up'));
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
      getCephOsds(),
      getClusterNodes(),
    ]);
    console.log(osdResponse, 'osdResponse');

    if (osdResponse.status === 'fulfilled') {
      rows.value = normalizeRows(osdResponse.value.data);
      console.log(rows.value, 'rows.value');
      expandedKeys.value = Object.fromEntries(
        rows.value
          .filter((row) => Boolean(row._hasChildren))
          .map((row) => [textValue(row._treeKey), true]),
      );
    }
    if (nodesResponse.status === 'fulfilled') nodes.value = normalizeRows(nodesResponse.value.data);
  } finally {
    loading.value = false;
  }
}
async function run(action: () => Promise<unknown>) {
  actionLoading.value = true;
  try {
    await action();
    await refreshData();
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
    run(() => changeCephOsdService(osdHost.value, osdId.value, action)),
  );
}
function osdAction(action: 'in' | 'out' | 'scrub', deep = false) {
  if (!isOsd.value) return;
  const message =
    action === 'scrub'
      ? `${deep ? gettext('Deep Scrub') : gettext('Scrub')} osd.${osdId.value}?`
      : `${action} osd.${osdId.value}?`;
  withConfirmation(message, () =>
    run(() => runCephOsdCommand(osdHost.value, osdId.value, action, deep ? { deep: 1 } : {})),
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
    node: nodeOptions.value[0] || 'localhost',
    dev: '',
    db_dev: '',
    wal_dev: '',
    encrypted: false,
    'crush-device-class': '',
  };
  createVisible.value = true;
}
async function create() {
  if (!createForm.value.dev) return;
  const { node, ...data } = createForm.value;
  await run(() => createCephOsd(node, data));
  createVisible.value = false;
}
async function openFlags() {
  const response = await getCephOsdFlags();
  flags.value = response.data || {};
  flagsVisible.value = true;
}
async function saveFlags() {
  await run(() => setCephOsdFlags(flags.value));
  flagsVisible.value = false;
}
function destroy() {
  if (!isOsd.value) return;
  withConfirmation(`${gettext('Destroy')} osd.${osdId.value}?`, () =>
    run(() => destroyCephOsd(osdHost.value, osdId.value)),
  );
}
onMounted(() => {
  void refreshData();
});
</script>

<template>
  <div class="column q-gutter-md">
    <q-table
      v-model:selected="selected"
      flat
      row-key="_treeKey"
      selection="single"
      table-header-class="u-table-header"
      :title="gettext('OSDs')"
      :rows="visibleRows"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 15 }"
      :rows-per-page-options="[15]"
      @row-dblclick="detailVisible = isOsd"
    >
      <template #top
        ><div class="text-subtitle2">{{ gettext('OSDs') }}</div>
        <q-space />
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="refresh"
            :label="gettext('Reload')"
            @click="refreshData"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="add"
            :label="gettext('Create') + ': OSD'"
            @click="openCreate"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Manage Global Flags')"
            @click="openFlags"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Bulk Restart OSDs')"
            @click="
              withConfirmation(gettext('Restart all OSDs across the cluster?'), () =>
                run(restartCephOsds),
              )
            "
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd"
            :label="gettext('Details')"
            @click="detailVisible = true"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd || isUp"
            :label="gettext('Start')"
            @click="serviceAction('start')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd || !isUp"
            :label="gettext('Stop')"
            @click="serviceAction('stop')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd || !isUp"
            :label="gettext('Restart')"
            @click="serviceAction('restart')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd || !isIn"
            label="Out"
            @click="osdAction('out')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd || isIn"
            label="In"
            @click="osdAction('in')"
          /><q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="!isOsd"
            :label="gettext('More')"
            ><q-list dense
              ><q-item clickable v-close-popup @click="osdAction('scrub')"
                ><q-item-section>{{ gettext('Scrub') }}</q-item-section></q-item
              ><q-item clickable v-close-popup @click="osdAction('scrub', true)"
                ><q-item-section>{{ gettext('Deep Scrub') }}</q-item-section></q-item
              ><q-item clickable v-close-popup :disable="isUp" @click="destroy"
                ><q-item-section class="text-negative">{{
                  gettext('Destroy')
                }}</q-item-section></q-item
              ></q-list
            ></q-btn-dropdown
          >
        </div></template
      >
      <template #body-cell-name="props"
        ><q-td :props="props"
          ><div
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
            /><span v-else class="osd-tree-spacer" /><q-icon
              :name="treeIcon(props.row.type)"
              size="16px"
              class="q-mr-xs"
            /><span>{{ props.value }}</span>
          </div></q-td
        ></template
      >
      <template #body-cell-status="props"
        ><q-td :props="props"
          ><div v-if="statusInfo(props.row)" class="osd-status">
            <span>{{ statusInfo(props.row)?.status }}</span
            ><q-icon
              :name="statusInfo(props.row)?.upIcon"
              :color="statusInfo(props.row)?.upColor"
              size="17px"
            /><span>/ {{ statusInfo(props.row)?.inOut }}</span
            ><q-icon
              :name="statusInfo(props.row)?.inIcon"
              :color="statusInfo(props.row)?.inColor"
              size="15px"
            />
          </div>
          <span v-else>-</span></q-td
        ></template
      >
    </q-table>
    <q-dialog v-model="createVisible" persistent transition-show="scale" transition-hide="scale"
      ><q-card class="osd-dialog"
        ><q-card-section class="text-subtitle1">{{ gettext('Create') }}: OSD</q-card-section
        ><q-card-section class="column q-gutter-md"
          ><q-select
            v-model="createForm.node"
            dense
            options-dense
            class="q-field--with-bottom"
            :label="gettext('Host')"
            :options="nodeOptions" /><q-input
            v-model="createForm.dev"
            dense
            class="q-field--with-bottom"
            :label="gettext('Disk')"
            hint="/dev/sdX" /><q-input
            v-model="createForm.db_dev"
            dense
            class="q-field--with-bottom"
            :label="gettext('DB Disk')" /><q-input
            v-model="createForm.wal_dev"
            dense
            class="q-field--with-bottom"
            :label="gettext('WAL Disk')" /><q-select
            v-model="createForm['crush-device-class']"
            dense
            options-dense
            class="q-field--with-bottom"
            clearable
            :label="gettext('Device Class')"
            :options="['hdd', 'ssd', 'nvme']" /><q-toggle
            v-model="createForm.encrypted"
            :label="gettext('Encrypt OSD')" /></q-card-section
        ><q-card-actions align="right"
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup /><q-btn
            flat
            no-caps
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!createForm.dev"
            :loading="actionLoading"
            :label="gettext('Create')"
            @click="create" /></q-card-actions></q-card
    ></q-dialog>
    <q-dialog v-model="flagsVisible" persistent transition-show="scale" transition-hide="scale"
      ><q-card class="osd-dialog"
        ><q-card-section class="text-subtitle1">{{
          gettext('Manage Global OSD Flags')
        }}</q-card-section
        ><q-card-section class="column q-gutter-sm"
          ><q-toggle
            v-for="flag in flagNames"
            :key="flag"
            v-model="flags[flag]"
            :true-value="1"
            :false-value="0"
            :label="flag" /></q-card-section
        ><q-card-actions align="right"
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup /><q-btn
            flat
            no-caps
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Apply')"
            @click="saveFlags" /></q-card-actions></q-card
    ></q-dialog>
    <q-dialog v-model="detailVisible" persistent transition-show="scale" transition-hide="scale"
      ><q-card class="osd-dialog"
        ><q-card-section class="text-subtitle1">osd.{{ osdId }}</q-card-section
        ><q-card-section>
          <pre class="detail-output">{{ JSON.stringify(current || {}, null, 2) }}</pre>
        </q-card-section></q-card
      ></q-dialog
    >
    <q-dialog v-model="confirmVisible" persistent transition-show="scale" transition-hide="scale"
      ><q-card class="osd-dialog"
        ><q-card-section class="text-subtitle1">{{ gettext('Confirm') }}</q-card-section
        ><q-card-section>{{ confirmMessage }}</q-card-section
        ><q-card-actions align="right"
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup /><q-btn
            flat
            no-caps
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Confirm')"
            @click="confirm" /></q-card-actions></q-card
    ></q-dialog>
  </div>
</template>

<style scoped>
.osd-dialog {
  min-width: 420px;
}
.detail-output {
  margin: 0;
  max-height: 60vh;
  overflow: auto;
  white-space: pre-wrap;
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
