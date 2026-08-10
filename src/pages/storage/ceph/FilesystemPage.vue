<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  changeCephMetadataServer,
  createCephFilesystem,
  createCephMetadataServer,
  destroyCephMetadataServer,
  getCephFilesystems,
  getCephMetadataServers,
  getCephMetadataServerSyslog,
  getCephServiceSafety,
} from '@/api/ceph';
import { getClusterNodes } from '@/api/resources';
import { gettext } from '@/locale';
import UWindow from '@/components/UWindow.vue';
import { textValue } from '@/utils/pveFormat';

const filesystems = shallowRef<PveRecord[]>([]);
const metadataServers = shallowRef<PveRecord[]>([]);
const nodes = shallowRef<PveRecord[]>([]);
const selectedMetadataServers = ref<PveRecord[]>([]);
const loading = ref(false);
const actionLoading = ref(false);
const createFilesystemVisible = ref(false);
const createMetadataServerVisible = ref(false);
const filesystemName = ref('cephfs');
const metadataServerNode = ref('');
const metadataServerId = ref('');
const syslogVisible = ref(false);
const syslogText = ref('');
const syslogTitle = ref('');
const confirmAction = ref<{ title: string; message: string; execute: () => Promise<void> } | null>(
  null,
);

const filesystemColumns: QTableColumn<PveRecord>[] = [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  {
    name: 'data_pool',
    label: gettext('Data Pool'),
    field: 'data_pool',
    align: 'left',
    sortable: true,
  },
  {
    name: 'metadata_pool',
    label: gettext('Metadata Pool'),
    field: 'metadata_pool',
    align: 'left',
    sortable: true,
  },
];
const metadataServerColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    label: gettext('Name'),
    field: (row) => `mds.${textValue(row.name)}`,
    align: 'left',
    sortable: true,
  },
  { name: 'host', label: gettext('Host'), field: 'host', align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'state', align: 'left', sortable: true },
  { name: 'address', label: gettext('Address'), field: 'addr', align: 'left', sortable: true },
  {
    name: 'version',
    label: gettext('Version'),
    field: 'ceph_version_short',
    align: 'left',
    sortable: true,
  },
];

const nodeOptions = computed(() => nodes.value.map((node) => textValue(node.node)).filter(Boolean));
const selectedMetadataServer = computed(() => selectedMetadataServers.value[0]);
const selectedMetadataServerState = computed(() =>
  textValue(selectedMetadataServer.value?.state).toLowerCase(),
);
const canCreateFilesystem = computed(() =>
  metadataServers.value.some((server) => textValue(server.state) === 'up:standby'),
);
const canStart = computed(
  () =>
    Boolean(selectedMetadataServer.value) &&
    ['stopped', 'unknown'].includes(selectedMetadataServerState.value),
);
const canStopOrRestart = computed(
  () => Boolean(selectedMetadataServer.value) && selectedMetadataServerState.value !== 'stopped',
);
const canDestroy = computed(() => selectedMetadataServerState.value === 'stopped');
const metadataServerIdValid = computed(() =>
  /^([a-zA-Z]([-a-zA-Z0-9]*[a-zA-Z0-9])?)$/.test(metadataServerId.value.trim()),
);

function normalizeRows(value: unknown): PveRecord[] {
  if (Array.isArray(value)) return value as PveRecord[];
  if (value && typeof value === 'object' && Array.isArray((value as PveRecord).data))
    return (value as PveRecord).data as PveRecord[];
  return [];
}

function serviceHost(row: PveRecord) {
  return textValue(row.host || row.hostname);
}
function serviceName(row: PveRecord) {
  return textValue(row.name || row.id);
}

async function refreshData() {
  loading.value = true;
  try {
    const [filesystemResponse, metadataServerResponse, nodeResponse] = await Promise.allSettled([
      getCephFilesystems(),
      getCephMetadataServers(),
      getClusterNodes(),
    ]);
    if (filesystemResponse.status === 'fulfilled')
      filesystems.value = normalizeRows(filesystemResponse.value.data);
    if (metadataServerResponse.status === 'fulfilled')
      metadataServers.value = normalizeRows(metadataServerResponse.value.data);
    if (nodeResponse.status === 'fulfilled') nodes.value = normalizeRows(nodeResponse.value.data);
  } finally {
    loading.value = false;
  }
}

async function runAfterAction(action: () => Promise<unknown>) {
  actionLoading.value = true;
  try {
    await action();
    await refreshData();
  } finally {
    actionLoading.value = false;
  }
}

function openCreateFilesystem() {
  filesystemName.value = 'cephfs';
  createFilesystemVisible.value = true;
}

async function createFilesystem() {
  const name = filesystemName.value.trim();
  if (!name) return;
  await runAfterAction(() => createCephFilesystem('localhost', name));
  createFilesystemVisible.value = false;
}

function openCreateMetadataServer() {
  metadataServerNode.value = nodeOptions.value[0] || 'localhost';
  metadataServerId.value = metadataServerNode.value;
  createMetadataServerVisible.value = true;
}

async function createMetadataServer() {
  const id = metadataServerId.value.trim();
  if (!metadataServerNode.value || !metadataServerIdValid.value) return;
  await runAfterAction(() => createCephMetadataServer(metadataServerNode.value, id));
  createMetadataServerVisible.value = false;
}

function requestServiceAction(action: 'start' | 'stop' | 'restart') {
  const row = selectedMetadataServer.value;
  if (!row) return;
  const execute = () =>
    runAfterAction(() => changeCephMetadataServer(serviceHost(row), serviceName(row), action));
  if (action !== 'stop') {
    void execute();
    return;
  }
  void getCephServiceSafety(serviceHost(row), 'mds', serviceName(row), 'stop').then((response) => {
    const data = response.data || {};
    if (data.safe) void execute();
    else
      confirmAction.value = {
        title: gettext('Warning'),
        message: textValue(data.status, `${gettext('Stop')} mds.${serviceName(row)}?`),
        execute,
      };
  });
}

function requestDestroy() {
  const row = selectedMetadataServer.value;
  if (!row) return;
  confirmAction.value = {
    title: gettext('Destroy'),
    message: `${gettext('Destroy')} mds.${serviceName(row)}?`,
    execute: () =>
      runAfterAction(() => destroyCephMetadataServer(serviceHost(row), serviceName(row))),
  };
}

async function executeConfirmed() {
  const action = confirmAction.value;
  confirmAction.value = null;
  if (action) await action.execute();
}

async function openSyslog() {
  const row = selectedMetadataServer.value;
  if (!row) return;
  actionLoading.value = true;
  try {
    const response = await getCephMetadataServerSyslog(serviceHost(row), serviceName(row));
    syslogText.value = Array.isArray(response.data)
      ? response.data.join('\n')
      : String(response.data || '');
    syslogTitle.value = `${gettext('Syslog')}: ceph-mds@${serviceName(row)}`;
    syslogVisible.value = true;
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  void refreshData();
});
</script>

<template>
  <div class="column q-gutter-md">
    <q-btn
      no-caps
      outline
      size="12px"
      color="primary"
      class="u-button self-start"
      :loading="loading"
      :label="gettext('Refresh')"
      @click="refreshData"
    />
    <q-table
      flat
      row-key="name"
      table-header-class="u-table-header"
      :title="gettext('CephFS')"
      :rows="filesystems"
      :columns="filesystemColumns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 5 }"
      :rows-per-page-options="[5]"
    >
      <template #top
        ><div class="text-subtitle2">CephFS</div>
        <q-space /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          icon="add"
          :disable="!canCreateFilesystem"
          :label="gettext('Create')"
          @click="openCreateFilesystem"
      /></template>
    </q-table>
    <q-table
      v-model:selected="selectedMetadataServers"
      flat
      row-key="name"
      selection="single"
      table-header-class="u-table-header"
      :title="gettext('Metadata Servers')"
      :rows="metadataServers"
      :columns="metadataServerColumns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 5 }"
      :rows-per-page-options="[5]"
    >
      <template #top
        ><div class="text-subtitle2">{{ gettext('Metadata Servers') }}</div>
        <q-space />
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="play_arrow"
            :disable="!canStart"
            :label="gettext('Start')"
            @click="requestServiceAction('start')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="stop"
            :disable="!canStopOrRestart"
            :label="gettext('Stop')"
            @click="requestServiceAction('stop')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="refresh"
            :disable="!canStopOrRestart"
            :label="gettext('Restart')"
            @click="requestServiceAction('restart')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="negative"
            class="u-button"
            icon="delete"
            :disable="!canDestroy"
            :label="gettext('Destroy')"
            @click="requestDestroy"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="article"
            :disable="!selectedMetadataServer"
            :loading="actionLoading"
            :label="gettext('Syslog')"
            @click="openSyslog"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="add"
            :label="gettext('Create')"
            @click="openCreateMetadataServer"
          />
        </div>
      </template>
    </q-table>

    <q-dialog
      v-model="createFilesystemVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
      ><UWindow width="420px" :title="`${gettext('Create')}: CephFS`" :loading="actionLoading"
        ><div class="q-pa-md">
          <q-input
            v-model="filesystemName"
            dense
            autofocus
            class="q-field--with-bottom"
            :label="gettext('Name')"
          />
        </div>
        <template #foot
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!filesystemName.trim()"
            :loading="actionLoading"
            :label="gettext('Create')"
            @click="createFilesystem" /></template></UWindow
    ></q-dialog>
    <q-dialog
      v-model="createMetadataServerVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
      ><UWindow
        width="460px"
        :title="`${gettext('Create')}: ${gettext('Metadata Servers')}`"
        :loading="actionLoading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="metadataServerNode"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :label="gettext('Host')"
            :options="nodeOptions.map((node) => ({ label: node, value: node }))"
            @update:model-value="metadataServerId = String($event)"
          /><q-input
            v-model="metadataServerId"
            dense
            class="q-field--with-bottom"
            :label="gettext('MDS ID')"
            :error="Boolean(metadataServerId) && !metadataServerIdValid"
            :error-message="
              gettext(
                'ID may consist of alphanumeric characters and hyphen. It cannot start with a number or end in a hyphen.',
              )
            "
          />
        </div>
        <template #foot
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            v-close-popup /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!metadataServerNode || !metadataServerIdValid"
            :loading="actionLoading"
            :label="gettext('Create')"
            @click="createMetadataServer" /></template></UWindow
    ></q-dialog>
    <q-dialog
      :model-value="Boolean(confirmAction)"
      persistent
      transition-show="scale"
      transition-hide="scale"
      @update:model-value="
        (visible) => {
          if (!visible) confirmAction = null;
        }
      "
      ><UWindow
        width="420px"
        :title="confirmAction?.title || gettext('Confirm')"
        :loading="actionLoading"
        ><div class="q-pa-md">{{ confirmAction?.message }}</div>
        <template #foot
          ><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Cancel')"
            @click="confirmAction = null" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-negative text-grey-1 u-button"
            :loading="actionLoading"
            :label="gettext('Confirm')"
            @click="executeConfirmed" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="syslogVisible" maximized
      ><q-card
        ><q-card-section class="row items-center"
          ><div class="text-subtitle1">{{ syslogTitle }}</div>
          <q-space /><q-btn flat round dense icon="close" v-close-popup /></q-card-section
        ><q-separator /><q-card-section>
          <pre class="syslog-output">{{ syslogText || '-' }}</pre>
        </q-card-section></q-card
      ></q-dialog
    >
  </div>
</template>

<style scoped>
.syslog-output {
  margin: 0;
  max-height: calc(100vh - 120px);
  overflow: auto;
  white-space: pre-wrap;
}
</style>
