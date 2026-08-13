<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import StorageDetailPage from '@/pages/storage/modules/storage/StorageDetailPage.vue';
import StorageEditDialog from '@/pages/storage/modules/storage/StorageEditDialog.vue';
import type { PveNode, PveRecord } from '@/api/resources';
import { getClusterResources, getNodes } from '@/api/resources';
import { deleteStorage, getStorages } from '@/api/storage';
import { gettext } from '@/locale';
import { formatContent, textValue } from '@/utils/pveFormat';

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const current = ref<PveRecord | null>(null);
const storageNodes = shallowRef<Record<string, string>>({});
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

const treeNodes = computed(() => {
  const byType = new Map<string, PveRecord[]>();
  rows.value.forEach((row) => {
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
          label: textValue(item.storage),
          id: `storage:${textValue(item.storage)}`,
          icon: 'dns',
        })),
      })),
    },
  ];
});

const detailNode = computed(() => {
  const storage = textValue(current.value?.storage);
  return storageNodes.value[storage] || textValue(current.value?.node) || 'localhost';
});

const tableRows = computed(() => {
  if (!treeSelected.value.startsWith('type:')) return rows.value;
  const type = treeSelected.value.replace(/^type:/, '');
  return rows.value.filter((row) => (textValue(row.type) || gettext('Unknown')) === type);
});

async function refreshData() {
  loading.value = true;
  try {
    const configResponse = await getStorages();
    rows.value = [...(configResponse.data || [])].sort((a, b) =>
      textValue(a.storage).localeCompare(textValue(b.storage)),
    );

    // The detail page is a project extension, so its node lookup must never prevent
    // the PVE-compatible storage configuration list from loading.
    const resourceResponse = await getClusterResources({ type: 'storage' }).catch(() => null);
    const resourceNodeMap: Record<string, string> = {};
    (resourceResponse?.data || []).forEach((item) => {
      const storageName = textValue(item.storage);
      if (storageName && item.node) resourceNodeMap[storageName] = textValue(item.node);
    });
    storageNodes.value = resourceNodeMap;
    treeExpanded.value = [
      'all',
      ...new Set(rows.value.map((item) => `type:${textValue(item.type) || gettext('Unknown')}`)),
    ];
    selected.value = [];
    if (current.value) {
      current.value = rows.value.find((item) => item.storage === current.value?.storage) || null;
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
  treeSelected.value = `storage:${textValue(target.storage)}`;
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
  const storage = id.replace(/^storage:/, '');
  const row = rows.value.find((item) => textValue(item.storage) === storage);
  if (row) openDetail(row);
}

function backToStorageList() {
  current.value = null;
  selected.value = [];
  treeSelected.value = 'all';
}

onMounted(() => {
  void refreshData();
  void getNodes()
    .then((response) => {
      clusterNodes.value = response.data || [];
    })
    .catch(() => {
      clusterNodes.value = [];
    });
});
</script>

<template>
  <div class="q-ma-md row no-wrap storage-page">
    <div class="storage-tree bg-white q-pa-sm">
      <q-tree
        v-model:selected="treeSelected"
        v-model:expanded="treeExpanded"
        :nodes="treeNodes"
        node-key="id"
        selected-color="primary"
        @update:selected="onTreeSelect"
      />
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
        row-key="storage"
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
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
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
.storage-page {
  min-height: calc(100vh - 96px);
}

.storage-tree {
  width: 240px;
  min-width: 240px;
  border-right: 1px solid #eeeeee;
}

</style>
