<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import StorageDetailPage from '@/pages/storage/modules/storage/StorageDetailPage.vue';
import StorageEditDialog from '@/pages/storage/modules/storage/StorageEditDialog.vue';
import type { PveNode, PveRecord } from '@/api/resources';
import { getClusterResources } from '@/api/resources';
import { deleteStorage, getStorages } from '@/api/storage';
import { gettext } from '@/locale';
import { formatContent, textValue } from '@/utils/pveFormat';

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const current = ref<PveRecord | null>(null);
const selectedNode = shallowRef('');
const treeSelected = ref('all');
const treeExpanded = ref<string[]>([]);
type StorageType = 'dir' | 'lvm' | 'lvmthin' | 'btrfs' | 'nfs' | 'cifs' | 'iscsi' | 'cephfs' | 'rbd' | 'zfs' | 'zfspool' | 'pbs' | 'esxi';
const editorVisible = shallowRef(false);
const editorType = shallowRef<StorageType>('dir');
const editorStorage = shallowRef<string>();
const clusterNodes = shallowRef<PveNode[]>([]);
const addTypes: StorageType[] = ['dir', 'lvm', 'lvmthin', 'btrfs', 'nfs', 'cifs', 'iscsi', 'cephfs', 'rbd', 'zfs', 'zfspool', 'pbs', 'esxi'];

function formatStorageType(row: PveRecord) {
  const type = textValue(row.type);
  const labels: Record<string, string> = {
    dir: 'Directory',
    lvm: 'LVM',
    lvmthin: 'LVM-Thin',
    btrfs: 'BTRFS',
    nfs: 'NFS',
    cifs: 'SMB/CIFS',
    iscsi: 'iSCSI',
    cephfs: 'CephFS',
    rbd: 'RBD',
    zfs: 'ZFS over iSCSI',
    zfspool: 'ZFS',
    pbs: 'Proxmox Backup Server',
    esxi: 'ESXi',
  };

  if ((type === 'rbd' || type === 'cephfs') && !textValue(row.monhost)) {
    return `${labels[type]} (PVE)`;
  }
  return labels[type] || type || '-';
}

function storageTypeLabel(type: StorageType) {
  return {
    dir: 'Directory', lvm: 'LVM', lvmthin: 'LVM-Thin', btrfs: 'BTRFS', nfs: 'NFS',
    cifs: 'SMB/CIFS', iscsi: 'iSCSI', cephfs: 'CephFS', rbd: 'RBD',
    zfs: 'ZFS over iSCSI', zfspool: 'ZFS', pbs: 'Proxmox Backup Server', esxi: 'ESXi',
  }[type];
}

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'node',
    label: gettext('Node'),
    align: 'left',
    field: (row) => row.node || '-',
    sortable: true,
  },
  {
    name: 'storage',
    required: true,
    label: gettext('ID'),
    align: 'left',
    field: (row) => row.storage || '-',
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    align: 'left',
    field: formatStorageType,
    sortable: true,
  },
  {
    name: 'content',
    label: gettext('Content'),
    align: 'left',
    field: (row) => formatContent(row.content),
    sortable: true,
  },
  {
    name: 'path',
    label: `${gettext('Path')}/${gettext('Target')}`,
    align: 'left',
    field: (row) => row.target || row.path || '-',
    sortable: true,
  },
  {
    name: 'shared',
    label: gettext('Shared'),
    align: 'left',
    field: (row) => (row.shared ? gettext('Yes') : gettext('No')),
    sortable: true,
  },
  {
    name: 'disable',
    label: gettext('Enabled'),
    align: 'left',
    field: (row) => (Number(row.disable || 0) === 0 ? gettext('Yes') : gettext('No')),
    sortable: true,
  },
  {
    name: 'bwlimit',
    label: gettext('Bandwidth Limit'),
    align: 'left',
    field: (row) => row.bwlimit || '-',
    sortable: true,
  },
];

const nodeRows = computed(() => selectedNode.value
  ? rows.value.filter((row) => row.node === selectedNode.value)
  : rows.value);

const treeNodes = computed(() => {
  const byType = new Map<string, PveRecord[]>();
  nodeRows.value.forEach((row) => {
    const type = textValue(row.type) || gettext('Unknown');
    byType.set(type, [...(byType.get(type) || []), row]);
  });

  return [
    {
      label: gettext('Storage Services'),
      id: 'all',
      icon: 'storage',
      children: [...byType.entries()].map(([type, items]) => ({
        label: type,
        id: `type:${type}`,
        icon: 'folder',
        children: items.map((item) => ({
          label: `${textValue(item.storage)} (${textValue(item.node)})`,
          id: `storage:${textValue(item.id)}`,
          icon: 'dns',
        })),
      })),
    },
  ];
});

const detailNode = computed(() => textValue(current.value?.node));

const tableRows = computed(() => {
  if (!treeSelected.value.startsWith('type:')) return nodeRows.value;
  const type = treeSelected.value.replace(/^type:/, '');
  return nodeRows.value.filter((row) => (textValue(row.type) || gettext('Unknown')) === type);
});

function onNodeChange() {
  backToStorageList();
}

async function refreshData() {
  loading.value = true;
  try {
    const [resourceResponse, configResponse] = await Promise.all([
      getClusterResources({ type: 'storage' }),
      getStorages().catch(() => null),
    ]);
    const configs = new Map((configResponse?.data || []).map((item) => [textValue(item.storage), item]));
    rows.value = (resourceResponse.data || []).map<PveRecord>((resource) => {
      const config = configs.get(textValue(resource.storage));
      return {
        ...config,
        ...resource,
        id: resource.id || `storage/${textValue(resource.node)}/${textValue(resource.storage)}`,
        type: resource.plugintype || config?.type || '',
      };
    }).sort((a, b) =>
      textValue(a.storage).localeCompare(textValue(b.storage)) ||
      textValue(a.node).localeCompare(textValue(b.node)),
    );
    treeExpanded.value = [
      'all',
      ...new Set(rows.value.map((item) => `type:${textValue(item.type) || gettext('Unknown')}`)),
    ];
    selected.value = [];
    if (current.value) {
      current.value = rows.value.find((item) => item.id === current.value?.id) || null;
    }
  } finally {
    loading.value = false;
  }
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = [row];
}

function openDetail(row?: PveRecord) {
  const target = row || selected.value[0];
  if (!target) return;
  current.value = target;
  treeSelected.value = `storage:${textValue(target.id)}`;
}

function removeSelected() {
  const row = selected.value[0];
  if (!row) return;
  const name = textValue(row.storage);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', name),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteStorage(name)
      .then(() => refreshData())
      .finally(() => {
        loading.value = false;
      });
  });
}

function openCreate(type: StorageType) {
  editorType.value = type;
  editorStorage.value = undefined;
  editorVisible.value = true;
}

function openEdit(row = selected.value[0]) {
  if (!row) return;
  editorType.value = textValue(row.type) as StorageType;
  editorStorage.value = textValue(row.storage);
  editorVisible.value = true;
}

function onTreeSelect(id: string) {
  if (id === 'all' || id.startsWith('type:')) {
    current.value = null;
    selected.value = [];
    return;
  }
  const resourceId = id.replace(/^storage:/, '');
  const row = nodeRows.value.find((item) => textValue(item.id) === resourceId);
  if (row) openDetail(row);
}

function backToStorageList() {
  current.value = null;
  selected.value = [];
  treeSelected.value = 'all';
}

onMounted(() => {
  void refreshData();
});
</script>

<template>
  <div class="q-ma-md row no-wrap storage-page">
    <div class="storage-tree bg-white q-pa-sm">
      <q-tree
        v-model:selected="treeSelected"
        v-model:expanded="treeExpanded"
        class="storage-tree__control"
        :nodes="treeNodes"
        node-key="id"
        selected-color="primary"
        @update:selected="onTreeSelect"
      >
        <template #default-header="{ node }">
          <div class="row items-center no-wrap storage-tree__node">
            <q-icon
              :name="node.icon"
              size="15px"
              class="storage-tree__node-icon q-mr-xs"
            />
            <span class="ellipsis">{{ node.label }}</span>
          </div>
        </template>
      </q-tree>
    </div>
    <div class="col q-ml-md bg-white q-pa-md">
      <div v-if="current">
        <div class="row items-center q-mb-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Back')"
            @click="backToStorageList"
          />
          <div class="text-subtitle2 q-ml-sm">{{ current.storage }}</div>
        </div>
        <StorageDetailPage :node="detailNode" :storage="current" />
      </div>
      <q-table
        v-else
        flat
        row-key="id"
        table-header-class="u-table-header"
        selection="single"
        :rows="tableRows"
        :columns="columns"
        :selected="selected"
        :filter="filter"
        :pagination="{ page: 1, rowsPerPage: 10, sortBy: 'storage', descending: false }"
        :rows-per-page-options="[10]"
        :loading="loading"
        :no-data-label="gettext('no record can be found')"
        @row-click="rowClick"
        @row-dblclick="(_, row) => openEdit(row)"
        @update:selected="selected = [...$event]"
      >
        <template #top>
          <div class="row items-center q-gutter-sm">
            <NodeSelectTable
              v-model="selectedNode"
              clearable
              field-style="outlined"
              class="storage-node-filter"
              :auto-select="false"
              :label="selectedNode ? '' : `${gettext('Node')}: ${gettext('All')}`"
              @loaded="clusterNodes = $event"
              @update:model-value="onNodeChange"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
              icon-right="arrow_drop_down"
            >
              <q-menu>
                <q-list dense style="min-width: 220px">
                  <q-item
                    v-for="type in addTypes"
                    :key="type"
                    v-close-popup
                    clickable
                    @click="openCreate(type)"
                  >
                    <q-item-section>{{ storageTypeLabel(type) }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="selected.length !== 1"
              :label="gettext('Edit')"
              @click="openEdit()"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshData"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="selected.length !== 1"
              :label="gettext('Detail')"
              @click="openDetail()"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="selected.length !== 1 ? 'grey' : 'red'"
              class="u-button"
              :disable="selected.length !== 1"
              :label="gettext('Remove')"
              @click="removeSelected"
            />
          </div>
          <q-space />
          <q-input
            v-model="filter"
            borderless
            dense
            debounce="300"
            :placeholder="gettext('Search')"
          >
            <template #append>
              <q-icon name="search" />
            </template>
          </q-input>
        </template>
      </q-table>
    </div>
    <StorageEditDialog
      v-model="editorVisible"
      :type="editorType"
      :storage="editorStorage"
      :nodes="clusterNodes"
      @saved="refreshData"
    />
  </div>
</template>

<style scoped>
.storage-node-filter {
  min-width: 180px;
}

.storage-node-filter :deep(.q-field__label) {
  top: 50%;
  font-size: 12px;
  line-height: 18px;
  transform: translateY(-50%);
}

.storage-node-filter :deep(.q-field__native) {
  min-height: 28px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 12px;
  align-items: center;
}

.storage-node-filter :deep(.q-field__focusable-action) {
  font-size: 16px;
}

.storage-page {
  min-height: calc(100vh - 96px);
}

.storage-tree {
  width: 240px;
  min-width: 240px;
  border-right: 1px solid #eeeeee;
}

.storage-tree__control {
  color: #333333;
  font-size: 12px;
}

.storage-tree__control :deep(.q-tree__node-header) {
  min-height: 30px;
  padding: 0 6px 0 2px;
  transition: background-color 0.15s ease-out;
}

.storage-tree__control :deep(.q-tree__node-header:hover) {
  background: #f2f5fc;
}

.storage-tree__control :deep(.q-tree__node--selected > .q-tree__node-header) {
  background: #e6f1fc;
}

.storage-tree__control :deep(.q-tree__arrow) {
  width: 18px;
  color: #9aa3b2;
  font-size: 16px;
}

.storage-tree__node {
  min-width: 0;
  line-height: 30px;
}

.storage-tree__node-icon {
  flex: 0 0 auto;
  color: #7c8798;
}

.storage-tree__control
  :deep(.q-tree__node--selected > .q-tree__node-header)
  .storage-tree__node-icon {
  color: #1976d2;
}
</style>
