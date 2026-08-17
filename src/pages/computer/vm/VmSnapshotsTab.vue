<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue';
import {
  createVmSnapshot,
  deleteVmSnapshot,
  getVmConfig,
  getVmSnapshotConfig,
  getVmSnapshotFeature,
  getVmSnapshots,
  rollbackVmSnapshot,
  updateVmSnapshotConfig,
} from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import { parsePropertyString } from '@/utils/pvePropertyString';

const props = withDefaults(
  defineProps<{ node: string; vmid: string; running: boolean; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' }
);
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const session = useSessionStore();

type SnapshotRow = PveRecord & {
  children: SnapshotRow[];
  displayName: string;
  id: string;
  isCurrent: boolean;
  level: number;
};

type VisibleSnapshotRow = SnapshotRow & {
  hasChildren: boolean;
};

const loading = shallowRef(false);
const createVisible = shallowRef(false);
const actionVisible = shallowRef(false);
const editVisible = shallowRef(false);
const action = shallowRef<'rollback' | 'delete'>('rollback');
const selectedName = shallowRef('');
const snapshots = shallowRef<PveRecord[]>([]);
const snapshotFeature = shallowRef(false);
const autoReloadTimer = shallowRef<number>();
const guestAgentEnabled = shallowRef(false);
const editConfig = shallowRef<PveRecord>({});

const form = reactive({ snapname: '', description: '', vmstate: false });
const editDescription = shallowRef('');

const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {}
);
const canSnapshot = computed(() => Boolean(vmCaps.value['VM.Snapshot']));
const canTakeSnapshot = computed(() => canSnapshot.value && snapshotFeature.value);
const canRollbackPermission = computed(() => Boolean(vmCaps.value['VM.Snapshot.Rollback']));

const selected = computed(() =>
  treeRows.value
    .flatMap((row) => flatten(row))
    .find((row) => row.displayName === selectedName.value)
);
const selectedIsSnapshot = computed(() => Boolean(selected.value && !selected.value.isCurrent));
const canRollback = computed(() => canRollbackPermission.value && selectedIsSnapshot.value);
const canRemove = computed(() => canSnapshot.value && selectedIsSnapshot.value);
const canEditView = computed(() => selectedIsSnapshot.value);
const editButtonText = computed(() => (canSnapshot.value ? gettext('Edit') : gettext('View')));
const selectedSnapshotName = computed(() => selected.value?.displayName || '');

const treeRows = computed(() => {
  const map = new Map<string, SnapshotRow>();
  const roots: SnapshotRow[] = [];

  snapshots.value.forEach((item, index) => {
    const name = snapshotName(item) || `snapshot-${index}`;
    const isCurrent = name === 'current';

    map.set(name, {
      ...item,
      id: name,
      displayName: isCurrent ? 'NOW' : name,
      isCurrent,
      level: 0,
      children: [],
    });
  });

  map.forEach((row) => {
    const parentName = textValue(row.parent);
    const parent = parentName ? map.get(parentName) : undefined;

    if (parent && parent !== row) {
      row.level = parent.level + 1;
      parent.children.push(row);
      return;
    }

    roots.push(row);
  });

  roots.forEach((row) => assignLevels(row, 0));
  sortSnapshotRows(roots);
  return roots;
});

const visibleRows = computed(() => {
  const rows: VisibleSnapshotRow[] = [];

  treeRows.value.forEach((row) => appendVisibleRows(row, rows));
  return rows;
});

const isQemu = computed(() => props.guestType === 'qemu');
const warningVisible = computed(
  () => isQemu.value && props.running && !guestAgentEnabled.value && !form.vmstate
);
const editSettingsRows = computed(() =>
  Object.entries(editConfig.value)
    .filter(([key]) => key !== 'description' && key !== 'snaptime')
    .map(([key, value]) => ({ key, value: textValue(value) || '-' }))
    .sort((left, right) => left.key.localeCompare(right.key))
);
const editSettingsColumns = computed(() => [
  { name: 'key', label: gettext('Key'), field: 'key', align: 'left' as const },
  { name: 'value', label: gettext('Value'), field: 'value', align: 'left' as const },
]);

function flatten(row: SnapshotRow): SnapshotRow[] {
  return [row, ...row.children.flatMap((child) => flatten(child))];
}

function snapshotName(row: PveRecord) {
  return textValue(row.name) || textValue(row.snapname);
}

function assignLevels(row: SnapshotRow, level: number) {
  row.level = level;
  row.children.forEach((child) => assignLevels(child, level + 1));
}

function appendVisibleRows(row: SnapshotRow, rows: VisibleSnapshotRow[]) {
  const hasChildren = row.children.length > 0;

  rows.push({ ...row, hasChildren });
  row.children.forEach((child) => appendVisibleRows(child, rows));
}

function snapshotOrder(row: SnapshotRow) {
  const snaptime = Number(row.snaptime);
  if (Number.isFinite(snaptime) && snaptime > 0) return snaptime;
  return row.isCurrent ? 'ZZZ' : textValue(row.snapstate);
}

function compareSnapshotRows(left: SnapshotRow, right: SnapshotRow) {
  const leftOrder = snapshotOrder(left);
  const rightOrder = snapshotOrder(right);

  if (typeof leftOrder === 'number' && typeof rightOrder === 'number')
    return leftOrder - rightOrder;
  if (typeof leftOrder === 'number') return -1;
  if (typeof rightOrder === 'number') return 1;
  return leftOrder.localeCompare(rightOrder);
}

function sortSnapshotRows(rows: SnapshotRow[]) {
  rows.sort(compareSnapshotRows);
  rows.forEach((row) => sortSnapshotRows(row.children));
}

function formatTime(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toLocaleString();
}

function ramText(row: SnapshotRow) {
  if (!isQemu.value || row.isCurrent) return '';
  return Number(row.vmstate) === 1 ? gettext('Yes') : gettext('No');
}

function dateOrStatusText(row: SnapshotRow) {
  if (row.isCurrent) return '';
  return textValue(row.snapstate) || formatTime(row.snaptime);
}

function descriptionText(row: SnapshotRow) {
  return row.isCurrent ? gettext('You are here!') : textValue(row.description);
}

function isAgentEnabled(value: unknown) {
  const parsed = parsePropertyString(value, 'enabled');
  const enabled = parsed.enabled || '';
  return ['1', 'yes', 'true', 'on'].includes(enabled.trim().toLowerCase());
}

function selectRow(row: VisibleSnapshotRow) {
  selectedName.value = row.displayName;
}

async function loadFeature() {
  if (!props.node || !props.vmid || !canSnapshot.value) {
    snapshotFeature.value = false;
    return;
  }

  try {
    const response = await getVmSnapshotFeature(props.node, props.vmid, props.guestType);
    snapshotFeature.value = Boolean(response.data?.hasFeature);
  } catch {
    snapshotFeature.value = false;
  }
}

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const [snapshotResponse] = await Promise.all([
      getVmSnapshots(props.node, props.vmid, props.guestType),
      loadFeature(),
    ]);
    snapshots.value = snapshotResponse.data || [];

    const firstRow = visibleRows.value[0];
    if (!selectedName.value && firstRow) {
      selectedName.value = firstRow.displayName;
    }
  } finally {
    loading.value = false;
  }
}

async function loadGuestAgent() {
  guestAgentEnabled.value = false;
  if (!props.node || !props.vmid || !props.running) return;

  try {
    const response = await getVmConfig(props.node, props.vmid, props.guestType, { current: 1 });
    guestAgentEnabled.value = isAgentEnabled(response.data?.agent);
  } catch {
    guestAgentEnabled.value = false;
  }
}

async function openCreate() {
  if (!canTakeSnapshot.value) return;
  form.snapname = '';
  form.description = '';
  form.vmstate = isQemu.value && props.running;
  if (isQemu.value) await loadGuestAgent();
  createVisible.value = true;
}

async function create() {
  if (!canTakeSnapshot.value) return;
  const snapname = form.snapname.trim();
  if (!isConfigId(snapname)) return;
  loading.value = true;
  try {
    const response = await createVmSnapshot(
      props.node,
      props.vmid,
      {
        snapname,
        description: form.description.trim() || undefined,
        ...(isQemu.value ? { vmstate: form.vmstate ? 1 : 0 } : {}),
      },
      props.guestType
    );
    createVisible.value = false;
    emit('task', props.node, String(response.data || ''), gettext('Take Snapshot'));
    await reload();
  } finally {
    loading.value = false;
  }
}

function isConfigId(value: string) {
  return /^[a-z][a-z0-9_-]+$/i.test(value);
}

function confirm(nextAction: 'rollback' | 'delete') {
  if (
    (nextAction === 'rollback' && !canRollback.value) ||
    (nextAction === 'delete' && !canRemove.value)
  ) {
    return;
  }

  action.value = nextAction;
  actionVisible.value = true;
}

async function openEdit() {
  const snapname = selectedSnapshotName.value;
  if (!snapname || !canEditView.value) return;
  loading.value = true;
  try {
    const response = await getVmSnapshotConfig(props.node, props.vmid, snapname, props.guestType);
    editConfig.value = response.data || {};
    editDescription.value =
      textValue(response.data?.description) || textValue(selected.value?.description);
    editVisible.value = true;
  } finally {
    loading.value = false;
  }
}

async function saveEdit() {
  const snapname = selectedSnapshotName.value;
  if (!canSnapshot.value || !snapname) return;
  loading.value = true;
  try {
    await updateVmSnapshotConfig(
      props.node,
      props.vmid,
      snapname,
      {
        description: editDescription.value,
      },
      props.guestType
    );
    editVisible.value = false;
    await reload();
  } finally {
    loading.value = false;
  }
}

async function runAction() {
  const snapname = selectedSnapshotName.value;
  if (!snapname) return;
  loading.value = true;
  try {
    const response =
      action.value === 'rollback'
        ? await rollbackVmSnapshot(props.node, props.vmid, snapname, props.guestType)
        : await deleteVmSnapshot(props.node, props.vmid, snapname, props.guestType);
    actionVisible.value = false;
    emit(
      'task',
      props.node,
      String(response.data || ''),
      action.value === 'rollback' ? gettext('Rollback') : gettext('Remove')
    );
    await reload();
  } finally {
    loading.value = false;
  }
}

function startAutoReload() {
  window.clearInterval(autoReloadTimer.value);
  autoReloadTimer.value = window.setInterval(() => void reload(), 3000);
}

watch(
  () => [props.node, props.vmid],
  () => {
    selectedName.value = '';
    void reload();
  },
  { immediate: true }
);

onMounted(startAutoReload);
onBeforeUnmount(() => window.clearInterval(autoReloadTimer.value));
</script>

<template>
  <div class="vm-snapshots-tab">
    <div class="row items-center q-gutter-sm q-py-sm snapshots-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        icon="add"
        :color="canTakeSnapshot ? 'primary' : 'grey'"
        :disable="!canTakeSnapshot"
        :label="gettext('Take Snapshot')"
        @click="openCreate"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRollback ? 'primary' : 'grey'"
        :disable="!canRollback"
        :label="gettext('Rollback')"
        @click="confirm('rollback')"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canEditView ? 'primary' : 'grey'"
        :disable="!canEditView"
        :label="editButtonText"
        @click="openEdit"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRemove ? 'negative' : 'grey'"
        :disable="!canRemove"
        :label="gettext('Remove')"
        @click="confirm('delete')"
      />
      <div
        v-if="!canTakeSnapshot"
        class="snapshot-feature-warning"
      >
        {{ gettext('The current guest configuration does not support taking new snapshots') }}
      </div>
    </div>

    <div class="snapshot-tree u-border">
      <div
        class="snapshot-tree-header snapshot-tree-row"
        :class="{ 'snapshot-tree-row--without-ram': !isQemu }"
      >
        <div class="snapshot-name-cell">{{ gettext('Name') }}</div>
        <div
          v-if="isQemu"
          class="snapshot-ram-cell"
        >
          {{ gettext('RAM') }}
        </div>
        <div class="snapshot-status-cell">{{ gettext('Date/Status') }}</div>
        <div class="snapshot-description-cell">{{ gettext('Description') }}</div>
      </div>
      <div
        v-if="!visibleRows.length && !loading"
        class="snapshot-empty"
      >
        {{ gettext('No snapshots') }}
      </div>
      <div
        v-for="row in visibleRows"
        :key="row.id"
        class="snapshot-tree-row snapshot-tree-body-row cursor-pointer"
        :class="{
          'is-selected': selectedName === row.displayName,
          'is-current': row.isCurrent,
          'snapshot-tree-row--without-ram': !isQemu,
        }"
        @click="selectRow(row)"
        @dblclick="openEdit"
      >
        <div class="snapshot-name-cell">
          <div
            class="snapshot-name-content"
            :style="{ paddingLeft: `${row.level * 22}px` }"
          >
            <q-icon
              :name="row.isCurrent ? 'desktop_windows' : 'history'"
              size="16px"
              class="snapshot-row-icon"
            />
            <span class="snapshot-row-name">{{ row.displayName }}</span>
          </div>
        </div>
        <div
          v-if="isQemu"
          class="snapshot-ram-cell"
        >
          {{ ramText(row) }}
        </div>
        <div class="snapshot-status-cell">{{ dateOrStatusText(row) }}</div>
        <div class="snapshot-description-cell">{{ descriptionText(row) }}</div>
      </div>
      <q-inner-loading :showing="loading" />
    </div>

    <q-dialog
      v-model="createVisible"
      persistent
    >
      <UWindow
        :title="`${isQemu ? 'VM' : 'CT'} ${vmid} ${gettext('Snapshot')}`"
        width="450px"
        :loading="loading"
      >
        <q-form
          class="snapshot-dialog-form u-dense u-border q-ma-sm q-pa-md u-hidden-error"
          @submit.prevent="create"
        >
          <q-input
            v-model="form.snapname"
            dense
            autofocus
            :label="gettext('Name')"
            :rules="[
              (value) =>
                isConfigId(String(value || '').trim()) ||
                gettext(
                  'Name must start with a letter and contain at least 2 letters, numbers, underscores, or hyphens'
                ),
            ]"
          />
          <q-checkbox
            v-if="isQemu && running"
            v-model="form.vmstate"
            dense
            color="primary"
            :label="gettext('Include RAM')"
          />
          <div
            v-if="warningVisible"
            class="snapshot-form-warning"
          >
            <q-icon
              name="warning_amber"
              size="18px"
              class="q-mr-sm"
            />
            <span>
              {{
                gettext(
                  'It is recommended to either include the RAM or use the QEMU Guest Agent when taking a snapshot of a running VM to avoid inconsistencies.'
                )
              }}
            </span>
          </div>
          <q-input
            v-model="form.description"
            dense
            type="textarea"
            autogrow
            :label="gettext('Description')"
          />
        </q-form>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="loading"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Take Snapshot')"
            :loading="loading"
            @click="create"
          />
        </template>
      </UWindow>
    </q-dialog>

    <q-dialog
      v-model="editVisible"
      persistent
    >
      <UWindow
        :title="`${gettext('Snapshot')} ${selectedSnapshotName}`"
        width="620px"
        :loading="loading"
      >
        <div
          class="snapshot-dialog-form snapshot-edit-form u-dense u-border q-ma-sm q-pa-md u-hidden-error"
        >
          <q-input
            :model-value="selectedSnapshotName"
            dense
            readonly
            :label="gettext('Name')"
          />
          <q-input
            :model-value="formatTime(editConfig.snaptime)"
            dense
            readonly
            :label="gettext('Timestamp')"
          />
          <q-input
            v-model="editDescription"
            dense
            type="textarea"
            autogrow
            :readonly="!canSnapshot"
            :label="gettext('Description')"
          />
          <q-table
            flat
            bordered
            dense
            row-key="key"
            :rows="editSettingsRows"
            :columns="editSettingsColumns"
            :pagination="{ rowsPerPage: 0 }"
            hide-bottom
            class="snapshot-settings-table"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="canSnapshot ? gettext('Cancel') : gettext('Close')"
            :disable="loading"
          />
          <q-btn
            v-if="canSnapshot"
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Save')"
            :loading="loading"
            @click="saveEdit"
          />
        </template>
      </UWindow>
    </q-dialog>

    <q-dialog
      v-model="actionVisible"
      persistent
    >
      <UWindow
        :title="action === 'rollback' ? gettext('Rollback') : gettext('Remove')"
        width="480px"
        :loading="loading"
      >
        <div class="q-pa-md">
          <template v-if="action === 'rollback'">
            <div>
              {{ gettext('Are you sure you want to rollback to snapshot') }}
              <strong>{{ selectedSnapshotName }}</strong>
              ?
            </div>
            <div class="q-mt-sm text-negative">{{ gettext('Current state will be lost.') }}</div>
          </template>
          <template v-else>
            {{
              gettext('Are you sure you want to remove entry {0}').replace(
                '{0}',
                `'${selectedSnapshotName}'`
              )
            }}
          </template>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="loading"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :class="action === 'delete' ? 'bg-negative text-grey-1' : 'bg-primary text-grey-1'"
            class="u-button"
            :label="gettext('Confirm')"
            :loading="loading"
            @click="runAction"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.vm-snapshots-tab {
  padding: 8px;
  font-size: 13px;
}
.snapshots-toolbar {
  margin-top: 0;
  margin-bottom: 4px;
}
.snapshot-feature-warning {
  display: flex;
  align-items: center;
  min-height: 28px;
  color: #52606d;
  font-size: 12px;
}
.snapshot-tree {
  position: relative;
  min-height: 160px;
  overflow: hidden;
  background: #fff;
}
.snapshot-tree-row {
  display: grid;
  grid-template-columns: minmax(220px, 1.25fr) 88px 180px minmax(180px, 1fr);
  align-items: center;
}
.snapshot-tree-row--without-ram {
  grid-template-columns: minmax(220px, 1.25fr) 180px minmax(180px, 1fr);
}
.snapshot-tree-header {
  min-height: 32px;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  background: #f5f7fa;
  border-bottom: 1px solid #d7dce2;
}
.snapshot-tree-body-row {
  min-height: 34px;
  color: #334155;
  border-bottom: 1px solid #eef0f3;
}
.snapshot-tree-body-row:hover {
  background: #f4f8fc;
}
.snapshot-tree-body-row.is-selected {
  background: #e6f1fb;
  color: #1f4f78;
}
.snapshot-tree-body-row.is-current {
  font-weight: 500;
}
.snapshot-name-cell,
.snapshot-ram-cell,
.snapshot-status-cell,
.snapshot-description-cell {
  min-width: 0;
  padding: 6px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.snapshot-name-content {
  display: flex;
  align-items: center;
  min-width: 0;
}
.snapshot-row-icon {
  flex: 0 0 auto;
  margin-right: 6px;
  color: #64748b;
}
.snapshot-row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.snapshot-empty {
  padding: 16px;
  color: #6b7280;
  font-size: 13px;
  text-align: center;
}
.snapshot-dialog-form {
  display: grid;
  gap: 12px;
}
.snapshot-form-warning {
  display: flex;
  align-items: flex-start;
  padding: 8px 10px;
  color: #6b4f00;
  font-size: 12px;
  line-height: 18px;
  background: #fff8e1;
  border: 1px solid #ead79a;
  border-radius: 3px;
}
.snapshot-settings-table :deep(tbody td) {
  height: 32px;
  font-size: 12px;
}
</style>
