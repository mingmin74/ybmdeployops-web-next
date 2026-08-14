<script setup lang="ts">
import { Dialog, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  createRealmSyncJob,
  getRealm,
  getRealms,
  getRealmSyncJob,
  getRealmSyncJobs,
  removeRealmSyncJob,
  syncRealm,
  updateRealmSyncJob,
  type PveRealm,
  type RealmSyncJob,
} from '@/api/resources';
import { gettext } from '@/locale';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';

const { embedded = false } = defineProps<{ embedded?: boolean }>();
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const action = ref<'add' | 'edit'>('add');
const jobs = ref<RealmSyncJob[]>([]);
const realms = ref<PveRealm[]>([]);
const selected = ref<RealmSyncJob[]>([]);
const filter = ref('');
const form = reactive({
  id: '',
  realm: '',
  schedule: '*/30',
  enabled: true,
  scope: 'both',
  enableNew: true,
  acl: false,
  entry: false,
  properties: false,
  comment: '',
});
const task = reactive({ visible: false, node: '', upid: '', title: '' });
const selectedJob = computed(() => selected.value[0]);
const canEdit = computed(() => Boolean(selectedJob.value));
const title = computed(
  () => `${gettext(action.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Realm Sync Job')}`
);
const scheduleOptions = [
  '*/30',
  '*/2:00',
  '21:00',
  '2,22:30',
  'mon..fri 00:00',
  'mon..fri */1:00',
  'mon..fri 7..18:00/15',
  'sun 01:00',
  'monthly',
  'sat *-1..7 15:00',
  'yearly',
];
const columns: QTableColumn<RealmSyncJob>[] = [
  { name: 'enabled', label: gettext('Enabled'), field: 'enabled', align: 'center', sortable: true },
  { name: 'realm', label: gettext('Realm'), field: 'realm', align: 'left' },
  { name: 'schedule', label: gettext('Schedule'), field: 'schedule', align: 'left' },
  { name: 'next', label: gettext('Next Run'), field: 'next-run', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const filtered = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return key
    ? jobs.value.filter((j) =>
        [j.id, j.realm, j.schedule, j.comment].join(' ').toLowerCase().includes(key)
      )
    : jobs.value;
});
const ldapAdRealms = computed(() =>
  realms.value.filter((realm) => realm.type === 'ldap' || realm.type === 'ad')
);
function rowClick(_: Event, row: RealmSyncJob) {
  selected.value = [row];
}
function reset() {
  Object.assign(form, {
    id: '',
    realm: '',
    schedule: '',
    enabled: true,
    scope: '',
    enableNew: true,
    acl: false,
    entry: false,
    properties: false,
    comment: '',
  });
}
function payload() {
  const vanished =
    ['acl', 'entry', 'properties']
      .filter((key) => form[key as 'acl' | 'entry' | 'properties'])
      .join(';') || 'none';
  return {
    realm: form.realm,
    schedule: form.schedule,
    enabled: form.enabled ? 1 : 0,
    scope: form.scope,
    'enable-new': form.enableNew ? 1 : 0,
    'remove-vanished': vanished,
    ...(action.value === 'add' || form.comment ? { comment: form.comment } : { delete: 'comment' }),
  };
}
function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}
function parseProperties(value: unknown) {
  const result: Record<string, string> = {};
  textValue(value)
    .split(',')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index > 0) result[part.slice(0, index)] = part.slice(index + 1);
    });
  return result;
}
async function reload() {
  loading.value = true;
  try {
    const [jobResult, realmResult] = await Promise.all([getRealmSyncJobs(), getRealms()]);
    jobs.value = jobResult.data || [];
    realms.value = realmResult.data || [];
    selected.value = selectedJob.value
      ? jobs.value.filter((job) => job.id === selectedJob.value?.id)
      : [];
  } finally {
    loading.value = false;
  }
}
async function open(next: 'add' | 'edit') {
  if (next === 'edit' && !selectedJob.value) return;
  action.value = next;
  reset();
  dialog.value = true;
  if (next === 'edit' && selectedJob.value) {
    saving.value = true;
    try {
      const result = await getRealmSyncJob(selectedJob.value.id);
      const job = result.data || selectedJob.value;
      const vanished = String(job['remove-vanished'] || '').split(';');
      Object.assign(form, {
        id: job.id,
        realm: job.realm,
        schedule: job.schedule || '',
        enabled: !(job.enabled === 0 || job.enabled === false),
        scope: job.scope || 'both',
        enableNew: String(job['enable-new'] ?? '1') !== '0',
        acl: vanished.includes('acl'),
        entry: vanished.includes('entry'),
        properties: vanished.includes('properties'),
        comment: job.comment || '',
      });
    } finally {
      saving.value = false;
    }
  }
}
async function save() {
  if (!form.realm || !form.schedule) return;
  saving.value = true;
  try {
    const id = action.value === 'add' ? `realmsync-${crypto.randomUUID().slice(0, 13)}` : form.id;
    if (action.value === 'add') await createRealmSyncJob(id, { id, ...payload() });
    else await updateRealmSyncJob(id, payload());
    dialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}
function remove() {
  if (!selectedJob.value) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', selectedJob.value.id),
    cancel: true,
    persistent: true,
  }).onOk(
    () =>
      void (async () => {
        await removeRealmSyncJob(selectedJob.value!.id);
        await reload();
      })()
  );
}
async function loadRealmDefaults(realm: string) {
  if (action.value !== 'add' || !realm) return;
  saving.value = true;
  try {
    const realmResponse = await getRealm(realm);
    const options = parseProperties(realmResponse.data?.['sync-defaults-options']);
    const vanished = String(options['remove-vanished'] || '').split(';');
    form.scope = options.scope || '';
    form.enableNew = options['enable-new'] !== '0';
    form.acl = vanished.includes('acl');
    form.entry = vanished.includes('entry');
    form.properties = vanished.includes('properties');
  } finally {
    saving.value = false;
  }
}
function startTask(upid: unknown) {
  task.upid = textValue(upid);
  task.node = task.upid.match(/^UPID:([^:]+)/)?.[1] || '';
  task.title = gettext('Realm Sync');
  task.visible = Boolean(task.upid);
}
async function runNow() {
  if (!selectedJob.value) return;
  saving.value = true;
  try {
    const params: Record<string, unknown> = { ...selectedJob.value };
    ['comment', 'realm', 'id', 'type', 'schedule', 'last-run', 'next-run', 'enabled'].forEach(
      (key) => delete params[key]
    );
    const response = await syncRealm(selectedJob.value.realm, params);
    startTask(response.data);
  } finally {
    saving.value = false;
  }
}
function nextRun(value: unknown) {
  return typeof value === 'number' ? new Date(value * 1000).toLocaleString() : '-';
}
watch(
  () => form.realm,
  (realm) => {
    if (dialog.value) void loadRealmDefaults(realm);
  }
);
onMounted(() => void reload());
defineExpose({ reload });
</script>
<template>
  <q-card
    v-if="!embedded"
    class="no-border-radius no-shadow q-ma-md q-mt-sm"
  >
    <q-card-section class="q-pa-none">
      <q-table
        v-model:selected="selected"
        flat
        selection="single"
        hide-selected-banner
        row-key="id"
        table-header-class="u-table-header"
        :rows="filtered"
        :columns="columns"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @row-click="rowClick"
        @row-dblclick="
          (_, row) => {
            selected = [row];
            void open('edit');
          }
        "
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
              @click="open('add')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canEdit ? 'primary' : 'grey'"
              :disable="!canEdit"
              :label="gettext('Edit')"
              @click="open('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canEdit ? 'red' : 'grey'"
              :disable="!canEdit"
              :label="gettext('Remove')"
              @click="remove"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canEdit ? 'primary' : 'grey'"
              :disable="!canEdit"
              :label="gettext('Run Now')"
              @click="runNow"
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
            <template #append><q-icon name="search" /></template>
          </q-input>
        </template>
        <template #body-cell-enabled="props">
          <q-td :props="props">
            <q-icon
              :name="props.value === false || props.value === 0 ? 'close' : 'check'"
              :class="
                props.value === false || props.value === 0 ? 'text-negative' : 'text-positive'
              "
            />
          </q-td>
        </template>
        <template #body-cell-next="props">
          <q-td :props="props">{{ nextRun(props.value) }}</q-td>
        </template>
      </q-table>
    </q-card-section>
  </q-card>

  <template v-else>
    <q-separator class="q-my-sm" />
    <div class="q-pa-sm row items-center q-gutter-x-sm">
      <q-icon
        name="sync"
        size="18px"
        color="primary"
      />
      <div class="text-h6 text-weight-medium">
        {{ gettext('Realm Sync Job') }}
      </div>
    </div>
    <q-table
      v-model:selected="selected"
      flat
      selection="single"
      hide-selected-banner
      row-key="id"
      table-header-class="u-table-header"
      :rows="filtered"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      @row-click="rowClick"
      @row-dblclick="
        (_, row) => {
          selected = [row];
          void open('edit');
        }
      "
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
            @click="open('add')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="canEdit ? 'primary' : 'grey'"
            :disable="!canEdit"
            :label="gettext('Edit')"
            @click="open('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="canEdit ? 'red' : 'grey'"
            :disable="!canEdit"
            :label="gettext('Remove')"
            @click="remove"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="canEdit ? 'primary' : 'grey'"
            :disable="!canEdit"
            :label="gettext('Run Now')"
            @click="runNow"
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
          <template #append><q-icon name="search" /></template>
        </q-input>
      </template>
      <template #body-cell-enabled="props">
        <q-td :props="props">
          <q-icon
            :name="props.value === false || props.value === 0 ? 'close' : 'check'"
            :class="props.value === false || props.value === 0 ? 'text-negative' : 'text-positive'"
          />
        </q-td>
      </template>
      <template #body-cell-next="props">
        <q-td :props="props">{{ nextRun(props.value) }}</q-td>
      </template>
    </q-table>
  </template>
  <q-dialog
    v-model="dialog"
    persistent
  >
    <q-card class="job-dialog">
      <q-card-section class="row items-center bg-blue-8 text-grey-1 q-pa-sm">
        <div class="text-weight-bold">{{ title }}</div>
        <q-space />
        <q-btn
          v-close-popup
          icon="close"
          flat
          dense
        />
      </q-card-section>
      <q-card-section class="q-gutter-sm">
        <q-select
          v-model="form.realm"
          dense
          emit-value
          map-options
          :disable="action === 'edit'"
          option-value="realm"
          option-label="realm"
          :options="ldapAdRealms"
          :label="`${gettext('Realm')} *`"
        />
        <q-select
          v-model="form.schedule"
          dense
          use-input
          fill-input
          hide-selected
          :disable="action === 'add' && !form.realm"
          :options="scheduleOptions"
          :label="`${gettext('Schedule')} *`"
        />
        <q-toggle
          v-model="form.enabled"
          :label="gettext('Enable Job')"
        />
        <q-select
          v-model="form.scope"
          dense
          emit-value
          map-options
          :disable="action === 'add' && !form.realm"
          :options="[
            { label: gettext('Users'), value: 'users' },
            { label: gettext('Groups'), value: 'groups' },
            { label: gettext('Users and Groups'), value: 'both' },
          ]"
          :label="gettext('Scope')"
        />
        <q-toggle
          v-model="form.enableNew"
          :disable="action === 'add' && !form.realm"
          :label="gettext('Enable New')"
        />
        <q-list bordered>
          <q-item-label header>{{ gettext('Remove Vanished Options') }}</q-item-label>
          <q-item>
            <q-checkbox
              v-model="form.acl"
              :label="gettext('ACL')"
            />
          </q-item>
          <q-item>
            <q-checkbox
              v-model="form.entry"
              :label="gettext('Entry')"
            />
          </q-item>
          <q-item>
            <q-checkbox
              v-model="form.properties"
              :label="gettext('Properties')"
            />
          </q-item>
        </q-list>
        <q-input
          v-model="form.comment"
          dense
          :label="gettext('Job Comment')"
        />
        <q-inner-loading :showing="saving" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          v-close-popup
          flat
          no-caps
          :label="gettext('Cancel')"
        />
        <q-btn
          flat
          no-caps
          color="primary"
          :label="gettext('OK')"
          @click="save"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
  <TaskOutputDialog
    v-model="task.visible"
    :node="task.node"
    :upid="task.upid"
    :title="task.title"
    @finished="reload"
  />
</template>
<style scoped>
.job-dialog {
  width: 520px;
  max-width: 95vw;
}
</style>
