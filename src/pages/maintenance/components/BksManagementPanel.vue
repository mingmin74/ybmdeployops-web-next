<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref } from 'vue';
import { getNodes, type PveNode, type PveRecord } from '@/api/resources';
import { createStorage, deleteStorage, getStorages, updateStorage } from '@/api/storage';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type BksRow = PveRecord & {
  storage: string;
  type?: string;
  disable?: boolean | number;
  shared?: boolean | number;
  content?: string;
  nodes?: string;
  username?: string;
  server?: string;
  datastore?: string;
  digest?: string;
  'encryption-key'?: string;
};
const loading = ref(false);
const filter = ref('');
const rows = ref<BksRow[]>([]);
const selected = ref<BksRow[]>([]);
const nodes = ref<PveNode[]>([]);
const visible = ref(false);
const formLoading = ref(false);
const saving = ref(false);
const action = ref<'add' | 'edit'>('add');
const formTab = ref('convention');
const form = reactive({
  storage: '',
  server: '',
  username: '',
  password: '',
  nodes: '',
  content: 'backup',
  datastore: '',
  namespace: '',
  fingerprint: '',
  disable: false,
  keepAll: true,
  keepLast: '',
  keepHourly: '',
  keepDaily: '',
  keepWeekly: '',
  keepMonthly: '',
  keepYearly: '',
  maxProtected: '',
  encryption: 'none',
  encryptionValue: '',
  digest: '',
});
const selectedRow = computed(() => selected.value[0]);
const canOperate = computed(() => Boolean(selectedRow.value));
const title = computed(
  () => `${gettext(action.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Proxmox Backup Server')}`,
);
const filteredRows = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return !key
    ? rows.value
    : rows.value.filter((row) =>
        [row.storage, row.server, row.username, row.datastore, row.nodes]
          .join(' ')
          .toLowerCase()
          .includes(key),
      );
});
const columns: QTableColumn<BksRow>[] = [
  { name: 'storage', label: gettext('ID'), field: 'storage', align: 'left', sortable: true },
  {
    name: 'type',
    label: gettext('Type'),
    field: () => gettext('Proxmox Backup Server'),
    align: 'left',
  },
  { name: 'content', label: gettext('Content'), field: 'content', align: 'left' },
  {
    name: 'nodes',
    label: `${gettext('Path')}/${gettext('Target')}`,
    field: 'nodes',
    align: 'left',
  },
  {
    name: 'shared',
    label: gettext('Shared'),
    field: (row) => (row.shared ? gettext('Yes') : gettext('No')),
    align: 'left',
  },
  {
    name: 'enabled',
    label: gettext('Enabled'),
    field: (row) => (row.disable ? gettext('Disabled') : gettext('Enabled')),
    align: 'left',
  },
  { name: 'username', label: gettext('Username'), field: 'username', align: 'left' },
  { name: 'server', label: gettext('Server'), field: 'server', align: 'left' },
  { name: 'datastore', label: gettext('Datastore'), field: 'datastore', align: 'left' },
];
function rowClick(_: Event, row: BksRow) {
  selected.value = selectedRow.value === row ? [] : [row];
}
function parsePrune(value: unknown) {
  const result: Record<string, string> = {};
  textValue(value)
    .split(',')
    .forEach((pair) => {
      const [key, item] = pair.split('=');
      if (key && item) result[key] = item;
    });
  return result;
}
function reset() {
  Object.assign(form, {
    storage: '',
    server: '',
    username: '',
    password: '',
    nodes: '',
    content: 'backup',
    datastore: '',
    namespace: '',
    fingerprint: '',
    disable: false,
    keepAll: true,
    keepLast: '',
    keepHourly: '',
    keepDaily: '',
    keepWeekly: '',
    keepMonthly: '',
    keepYearly: '',
    maxProtected: '',
    encryption: 'none',
    encryptionValue: '',
    digest: '',
  });
}
async function reload() {
  loading.value = true;
  try {
    const response = await getStorages();
    rows.value = ((response.data || []) as BksRow[])
      .filter((row) => row.type === 'pbs')
      .sort((a, b) => a.storage.localeCompare(b.storage));
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
function openForm(nextAction: 'add' | 'edit') {
  action.value = nextAction;
  reset();
  formTab.value = 'convention';
  if (nextAction === 'edit' && selectedRow.value) {
    formLoading.value = true;
    const row = selectedRow.value;
    const prune = parsePrune(row['prune-backups']);
    Object.assign(form, {
      storage: row.storage,
      server: textValue(row.server),
      username: textValue(row.username),
      password: '********',
      nodes: textValue(row.nodes),
      content: textValue(row.content, 'backup'),
      datastore: textValue(row.datastore),
      namespace: textValue(row.namespace),
      fingerprint: textValue(row.fingerprint),
      disable: Boolean(row.disable),
      keepAll: prune['keep-all'] === '1',
      keepLast: prune['keep-last'] || '',
      keepHourly: prune['keep-hourly'] || '',
      keepDaily: prune['keep-daily'] || '',
      keepWeekly: prune['keep-weekly'] || '',
      keepMonthly: prune['keep-monthly'] || '',
      keepYearly: prune['keep-yearly'] || '',
      maxProtected: textValue(row['max-protected-backups']),
      encryption: row['encryption-key'] ? 'keep' : 'none',
      digest: textValue(row.digest),
    });
    formLoading.value = false;
  }
  visible.value = true;
}
function pruneBackups() {
  if (form.keepAll) return 'keep-all=1';
  return [
    ['keep-last', form.keepLast],
    ['keep-hourly', form.keepHourly],
    ['keep-daily', form.keepDaily],
    ['keep-weekly', form.keepWeekly],
    ['keep-monthly', form.keepMonthly],
    ['keep-yearly', form.keepYearly],
  ]
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}
async function save() {
  if (
    !form.storage ||
    !form.server ||
    !form.username ||
    !form.datastore ||
    (form.encryption === 'upload' && !form.encryptionValue)
  )
    return;
  saving.value = true;
  try {
    const encryptionKey =
      form.encryption === 'autogen'
        ? 'autogen'
        : form.encryption === 'upload'
          ? form.encryptionValue
          : undefined;
    const base: PveRecord = {
      type: 'pbs',
      storage: form.storage,
      server: form.server,
      username: form.username,
      password: action.value === 'add' ? form.password : undefined,
      nodes: form.nodes || undefined,
      content: form.content,
      datastore: form.datastore,
      namespace: form.namespace || undefined,
      fingerprint: form.fingerprint || undefined,
      disable: form.disable ? 1 : 0,
      'prune-backups': pruneBackups(),
      'max-protected-backups': form.maxProtected || undefined,
      'encryption-key': encryptionKey,
    };
    if (action.value === 'add') await createStorage(base);
    else
      await updateStorage(form.storage, {
        ...base,
        storage: undefined,
        server: undefined,
        username: undefined,
        password: undefined,
        datastore: undefined,
        type: undefined,
        digest: form.digest || undefined,
        delete: form.encryption === 'none' ? ['encryption-key'] : undefined,
      });
    Notify.create({ type: 'positive', message: gettext('BKS storage saved successfully') });
    visible.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}
function removeSelected() {
  const row = selectedRow.value;
  if (!row) return;
  Dialog.create({
    title: gettext('Delete'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', row.storage),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      await deleteStorage(row.storage);
      Notify.create({ type: 'positive', message: gettext('BKS storage deleted successfully') });
      await reload();
    })();
  });
}
onMounted(async () => {
  const [storageResponse, nodeResponse] = await Promise.all([getStorages(), getNodes()]);
  rows.value = ((storageResponse.data || []) as BksRow[]).filter((row) => row.type === 'pbs');
  nodes.value = nodeResponse.data || [];
});
</script>

<template>
  <div class="row column q-px-md q-py-sm">
    <q-table
      flat
      :rows="filteredRows"
      :columns="columns"
      row-key="storage"
      selection="single"
      v-model:selected="selected"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      :pagination="{ rowsPerPage: 20 }"
      table-header-class="u-table-header"
      @row-click="rowClick"
    >
      <template #top>
        <div class="q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="openForm('add')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Edit')"
            @click="openForm('edit')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'negative' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Delete')"
            @click="removeSelected"
          /><q-btn
            flat
            round
            dense
            icon="refresh"
            :aria-label="gettext('Refresh')"
            @click="reload"
          />
        </div>
        <q-space /><q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
          ><template #append><q-icon name="search" /></template></q-input></template
      ><template #body-cell-enabled="props"
        ><q-td :props="props"
          ><q-badge
            :color="props.value === gettext('Enabled') ? 'green' : 'red'"
            :label="props.value" /></q-td></template
    ></q-table>
  </div>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale"
    ><UWindow :title="title" width="580px" :loading="formLoading"
      ><q-form class="bks-form u-dense" @submit="save"
        ><q-tabs
          v-model="formTab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="justify"
          narrow-indicator
          ><q-tab no-caps name="convention" :label="gettext('Convention')" /><q-tab
            no-caps
            name="retention"
            :label="gettext('Backup retention')" /><q-tab
            no-caps
            name="encrypt"
            :label="gettext('Encrypt')" /></q-tabs
        ><q-separator /><q-tab-panels v-model="formTab" animated
          ><q-tab-panel name="convention"
            ><div class="row q-col-gutter-lg">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.storage"
                  dense
                  :disable="action === 'edit'"
                  class="q-field--with-bottom"
                  :label="gettext('ID')"
                /><q-input
                  v-model="form.server"
                  dense
                  :disable="action === 'edit'"
                  class="q-field--with-bottom"
                  :label="gettext('Server')"
                /><q-input
                  v-model="form.username"
                  dense
                  :disable="action === 'edit'"
                  class="q-field--with-bottom"
                  :label="gettext('Username')"
                /><q-input
                  v-model="form.password"
                  dense
                  :disable="action === 'edit'"
                  type="password"
                  class="q-field--with-bottom"
                  :label="gettext('Password')"
                /><q-checkbox
                  v-model="form.disable"
                  dense
                  color="primary"
                  :label="gettext('Enable')"
                  :true-value="false"
                  :false-value="true"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.nodes"
                  dense
                  options-dense
                  emit-value
                  map-options
                  clearable
                  option-value="node"
                  option-label="node"
                  :options="nodes"
                  class="q-field--with-bottom"
                  :label="gettext('Node')"
                /><q-input
                  v-model="form.content"
                  dense
                  readonly
                  class="q-field--with-bottom"
                  :label="gettext('Content')"
                /><q-input
                  v-model="form.datastore"
                  dense
                  :disable="action === 'edit'"
                  class="q-field--with-bottom"
                  :label="gettext('Datastore')"
                /><q-input
                  v-model="form.namespace"
                  dense
                  :disable="action === 'edit'"
                  class="q-field--with-bottom"
                  :label="gettext('Namespace')"
                />
              </div>
            </div>
            <q-input
              v-model="form.fingerprint"
              dense
              :label="gettext('Fingerprint')" /></q-tab-panel
          ><q-tab-panel name="retention"
            ><q-checkbox
              v-model="form.keepAll"
              dense
              color="primary"
              :label="gettext('Keep all backups')" />
            <div v-if="!form.keepAll" class="row q-col-gutter-lg">
              <div class="col">
                <q-input
                  v-model="form.keepLast"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Keep last time')"
                /><q-input
                  v-model="form.keepDaily"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Keep every day')"
                /><q-input
                  v-model="form.keepMonthly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Retain monthly')"
                />
              </div>
              <div class="col">
                <q-input
                  v-model="form.keepHourly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Keep every hour')"
                /><q-input
                  v-model="form.keepWeekly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Retain every week')"
                /><q-input
                  v-model="form.keepYearly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Retain every year')"
                />
              </div>
            </div>
            <q-input
              v-model="form.maxProtected"
              dense
              type="number"
              :label="gettext('maximum protection')" /></q-tab-panel
          ><q-tab-panel name="encrypt"
            ><q-select
              v-model="form.encryption"
              dense
              options-dense
              emit-value
              map-options
              :label="gettext('encryption key')"
              :options="[
                { label: gettext('Do not encrypt backups'), value: 'none' },
                { label: gettext('Keep encryption key'), value: 'keep' },
                {
                  label: gettext('Automatically generate client encryption key'),
                  value: 'autogen',
                },
                { label: gettext('Upload existing client encryption key'), value: 'upload' },
              ]" /><q-input
              v-if="form.encryption === 'upload'"
              v-model="form.encryptionValue"
              dense
              :label="gettext('Public Key')" /></q-tab-panel></q-tab-panels></q-form
      ><template #foot
        ><q-btn v-close-popup no-caps flat size="12px" :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="
            saving ||
            !form.storage ||
            !form.server ||
            !form.username ||
            !form.datastore ||
            (action === 'add' && !form.password) ||
            (form.encryption === 'upload' && !form.encryptionValue)
          "
          :loading="saving"
          :label="gettext(action === 'add' ? 'Add' : 'Save')"
          @click="save" /></template></UWindow
  ></q-dialog>
</template>
<style scoped>
.bks-form :deep(.q-tab-panel) {
  min-height: 390px;
}
.bks-form :deep(.q-field--with-bottom) {
  padding-bottom: 15px;
}
.bks-form :deep(.q-field__bottom) {
  display: none;
}
</style>
