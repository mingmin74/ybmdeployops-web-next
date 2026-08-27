<script setup lang="ts">
import { Dialog, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createRealm,
  getRealm,
  getRealms,
  removeRealm,
  syncRealm,
  updateRealm,
  type PveRealm,
} from '@/api/resources';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import RealmSyncJobsPage from '@/pages/system/RealmSyncJobsPage.vue';
import { gettext } from '@/locale';

defineProps<{ embedded?: boolean }>();
type AuthType = 'ldap' | 'ad' | 'openid' | 'pam' | 'pve';
type Scalar = string | number | boolean;
const addTypes: { value: AuthType; label: string }[] = [
  { value: 'ldap', label: 'LDAP' },
  { value: 'ad', label: gettext('Active Directory') },
  { value: 'openid', label: 'OpenID Connect' },
];
const deletableKeys = [
  'server2',
  'port',
  'mode',
  'verify',
  'client-key',
  'scopes',
  'groups-claim',
  'prompt',
  'acr-values',
  'audiences',
  'sync_attributes',
  'sync-defaults-options',
  'tfa',
  'bind_dn',
  'group_name_attr',
  'user_classes',
  'group_classes',
  'filter',
  'group_filter',
  'secure',
];
const loading = ref(false),
  saving = ref(false),
  dialog = ref(false),
  syncDialog = ref(false),
  formTab = ref<'general' | 'sync'>('general');
const rows = ref<PveRealm[]>([]),
  selected = ref<PveRealm[]>([]),
  filter = ref('');
const action = ref<'add' | 'edit'>('add');
const original = ref<Record<string, unknown>>({});
const task = reactive({ visible: false, upid: '', node: '', title: '' });
const form = reactive<Record<string, Scalar | null | undefined>>({});
const sync = reactive({ scope: '', enableNew: true, acl: false, entry: false, properties: false });
const selectedRealm = computed(() => selected.value[0]);
const syncable = computed(() => ['ldap', 'ad'].includes(selectedRealm.value?.type || ''));
const removable = computed(() =>
  ['ldap', 'ad', 'openid'].includes(selectedRealm.value?.type || '')
);
const supportsTfa = computed(() => form.type !== 'openid');
const isDirectory = computed(() => form.type === 'ldap' || form.type === 'ad');
const columns: QTableColumn<PveRealm>[] = [
  { name: 'realm', label: gettext('Realm'), field: 'realm', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left', sortable: true },
  { name: 'tfa', label: gettext('TFA'), field: 'tfa', align: 'left', sortable: true },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const filtered = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return key
    ? rows.value.filter((row) =>
        [row.realm, row.type, row.tfa, row.comment].join(' ').toLowerCase().includes(key)
      )
    : rows.value;
});
function reset(type: AuthType) {
  Object.assign(form, {
    realm: '',
    type,
    comment: '',
    default: false,
    tfa: '',
    tfaType: '__default__',
    tfaStep: '',
    tfaDigits: '',
    tfaId: '',
    tfaKey: '',
    tfaUrl: '',
    server1: '',
    server2: '',
    port: '',
    mode: '__default__',
    verify: false,
    'check-connection': true,
    base_dn: '',
    user_attr: '',
    domain: '',
    'case-sensitive': true,
    'issuer-url': '',
    'client-id': '',
    'client-key': '',
    scopes: '',
    autocreate: false,
    'username-claim': '__default__',
    'groups-autocreate': false,
    'groups-claim': '',
    'groups-overwrite': false,
    prompt: '__default__',
    'acr-values': '',
    'query-userinfo': true,
    audiences: '',
    bind_dn: '',
    password: '',
    email: '',
    group_name_attr: '',
    user_classes: '',
    group_classes: '',
    filter: '',
    group_filter: '',
    scope: '__default__',
    'enable-new': '__default__',
    'remove-vanished-acl': false,
    'remove-vanished-entry': false,
    'remove-vanished-properties': false,
  });
  original.value = {};
  formTab.value = 'general';
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
    .forEach((pair) => {
      const index = pair.indexOf('=');
      if (index > 0) result[pair.slice(0, index)] = pair.slice(index + 1);
    });
  return result;
}
function printProperties(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => `${k}=${textValue(v)}`)
    .join(',');
}
function setSyncDefaults(value: unknown, target: Record<string, Scalar>) {
  const opts = parseProperties(value);
  target.scope = opts.scope || '__default__';
  target['enable-new'] = opts['enable-new'] || '__default__';
  const vanished = String(opts['remove-vanished'] || '').split(';');
  target['remove-vanished-acl'] = vanished.includes('acl');
  target['remove-vanished-entry'] = vanished.includes('entry');
  target['remove-vanished-properties'] = vanished.includes('properties');
}
function setTfa(value: unknown) {
  const tfa = parseProperties(value);
  form.tfaType = tfa.type || '__default__';
  form.tfaStep = tfa.step || '';
  form.tfaDigits = tfa.digits || '';
  form.tfaId = tfa.id || '';
  form.tfaKey = tfa.key || '';
  form.tfaUrl = tfa.url || '';
}
function composeTfa() {
  if (form.tfaType === '__default__') return '';
  const data: Record<string, unknown> = { type: form.tfaType };
  if (form.tfaType === 'oath') {
    data.step = form.tfaStep;
    data.digits = form.tfaDigits;
  } else if (form.tfaType === 'yubico') {
    data.id = form.tfaId;
    data.key = form.tfaKey;
    data.url = form.tfaUrl;
  }
  return printProperties(data);
}
function rowClick(_: Event, row: PveRealm) {
  selected.value = [row];
}
async function reload() {
  loading.value = true;
  try {
    const response = await getRealms();
    rows.value = [...(response.data || [])].sort((a, b) => a.realm.localeCompare(b.realm));
    selected.value = selectedRealm.value
      ? rows.value.filter((row) => row.realm === selectedRealm.value?.realm)
      : [];
  } finally {
    loading.value = false;
  }
}
async function open(next: 'add' | 'edit', type: AuthType = 'ldap') {
  if (next === 'edit' && !selectedRealm.value) return;
  action.value = next;
  reset(next === 'edit' ? (selectedRealm.value?.type as AuthType) : type);
  dialog.value = true;
  if (next === 'edit' && selectedRealm.value) {
    saving.value = true;
    try {
      const response = await getRealm(selectedRealm.value.realm);
      const data = response.data || {};
      original.value = { ...data };
      Object.assign(form, data, {
        realm: selectedRealm.value.realm,
        type: selectedRealm.value.type || 'pam',
      });
      form.mode =
        typeof data.mode === 'string' ? data.mode : data.secure === true ? 'ldaps' : '__default__';
      const attrs = parseProperties(data.sync_attributes);
      form.email = attrs.email || '';
      setTfa(data.tfa);
      setSyncDefaults(data['sync-defaults-options'], form);
    } finally {
      saving.value = false;
    }
  }
}
function validate() {
  if (!String(form.realm).trim()) return false;
  if (form.type === 'ldap' && (!form.base_dn || !form.user_attr || !form.server1)) return false;
  if (form.type === 'ad' && (!form.domain || !form.server1)) return false;
  if (form.type === 'openid' && (!form['issuer-url'] || !form['client-id'])) return false;
  const port = Number(form.port);
  if (form.port && (!Number.isInteger(port) || port < 1 || port > 65535)) return false;
  if (form.tfaType === 'yubico' && (!form.tfaId || !form.tfaKey)) return false;
  if (
    form.tfaType === 'oath' &&
    ((form.tfaStep && Number(form.tfaStep) < 10) ||
      (form.tfaDigits && (Number(form.tfaDigits) < 6 || Number(form.tfaDigits) > 8)))
  )
    return false;
  return true;
}
function payload() {
  const common = ['realm', 'type', 'comment', 'default'];
  const directory = [
    'server1',
    'server2',
    'port',
    'mode',
    'verify',
    'check-connection',
    'bind_dn',
    'group_name_attr',
    'user_classes',
    'group_classes',
    'filter',
    'group_filter',
  ];
  const byType: Record<string, string[]> = {
    ldap: ['base_dn', 'user_attr'],
    ad: ['domain', 'case-sensitive'],
    openid: [
      'issuer-url',
      'client-id',
      'client-key',
      'scopes',
      'autocreate',
      'username-claim',
      'groups-autocreate',
      'groups-claim',
      'groups-overwrite',
      'prompt',
      'acr-values',
      'query-userinfo',
      'audiences',
    ],
    pam: [],
    pve: [],
  };
  const keys = [
    ...common,
    ...(byType[String(form.type)] || []),
    ...(isDirectory.value ? directory : []),
    ...(supportsTfa.value ? ['tfa'] : []),
  ];
  const data: Record<string, unknown> = Object.fromEntries(keys.map((key) => [key, form[key]]));
  data.tfa = composeTfa();
  if (isDirectory.value) {
    const vanished = ['acl', 'entry', 'properties']
      .filter((key) => form[`remove-vanished-${key}`])
      .join(';');
    const defaults: Record<string, unknown> = {};
    if (form.scope !== '__default__') defaults.scope = form.scope;
    if (form['enable-new'] !== '__default__') defaults['enable-new'] = form['enable-new'];
    if (vanished) defaults['remove-vanished'] = vanished;
    data['sync-defaults-options'] = printProperties(defaults);
    data.sync_attributes = printProperties({ email: form.email });
    if (form.password) data.password = form.password;
  }
  Object.keys(data).forEach((key) => {
    if (typeof data[key] === 'boolean') data[key] = data[key] ? 1 : 0;
    if (data[key] === '' || data[key] === '__default__') delete data[key];
  });
  if (action.value === 'edit') {
    if (!form.verify) {
      delete data.verify;
    }
    delete data.realm;
    delete data.type;
    const deleted = deletableKeys.filter(
      (key) => original.value[key] !== undefined && data[key] === undefined
    );
    if (original.value.secure !== undefined && !deleted.includes('secure')) deleted.push('secure');
    if (deleted.length) data.delete = deleted.join(',');
  }
  return data;
}
async function save() {
  if (!validate()) return;
  saving.value = true;
  try {
    if (action.value === 'add') await createRealm(payload());
    else if (selectedRealm.value) await updateRealm(selectedRealm.value.realm, payload());
    dialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}
function remove() {
  if (!selectedRealm.value || !removable.value) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', selectedRealm.value.realm),
    cancel: true,
    persistent: true,
  }).onOk(
    () =>
      void (async () => {
        await removeRealm(selectedRealm.value!.realm);
        await reload();
      })()
  );
}
async function openSync() {
  if (!selectedRealm.value) return;
  Object.assign(sync, { scope: '', enableNew: true, acl: false, entry: false, properties: false });
  saving.value = true;
  try {
    const response = await getRealm(selectedRealm.value.realm);
    const options = parseProperties(response.data?.['sync-defaults-options']);
    sync.scope = options.scope || '';
    sync.enableNew = options['enable-new'] !== '0';
    const vanished = String(options['remove-vanished'] || '').split(';');
    sync.acl = vanished.includes('acl');
    sync.entry = vanished.includes('entry');
    sync.properties = vanished.includes('properties');
    syncDialog.value = true;
  } finally {
    saving.value = false;
  }
}
function startTask(upid: unknown, title: string) {
  task.upid = textValue(upid);
  task.node = task.upid.match(/^UPID:([^:]+)/)?.[1] || '';
  task.title = title;
  task.visible = Boolean(task.upid);
}
async function submitSync(preview: boolean) {
  if (!selectedRealm.value || !sync.scope) return;
  saving.value = true;
  try {
    const vanished =
      ['acl', 'entry', 'properties']
        .filter((key) => sync[key as 'acl' | 'entry' | 'properties'])
        .join(';') || 'none';
    const response = await syncRealm(selectedRealm.value.realm, {
      scope: sync.scope,
      'enable-new': sync.enableNew ? 1 : 0,
      'remove-vanished': vanished,
      'dry-run': preview ? 1 : 0,
    });
    startTask(response.data, preview ? gettext('Preview') : gettext('Sync'));
    if (!preview) syncDialog.value = false;
  } finally {
    saving.value = false;
  }
}
onMounted(() => void reload());
defineExpose({ reload });
</script>
<template>
  <q-card
    class="no-border-radius no-shadow"
    :class="embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'"
  >
    <q-card-section :class="embedded ? 'q-pa-none' : undefined">
      <q-table
        v-model:selected="selected"
        flat
        selection="single"
        hide-selected-banner
        row-key="realm"
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
            <q-btn-dropdown
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
            >
              <q-list dense>
                <q-item
                  v-for="type in addTypes"
                  :key="type.value"
                  clickable
                  v-close-popup
                  @click="open('add', type.value)"
                >
                  <q-item-section>{{ type.label }}</q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="selectedRealm ? 'primary' : 'grey'"
              :disable="!selectedRealm"
              :label="gettext('Edit')"
              @click="open('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="negative"
              class="u-button"
              :disable="!removable"
              :label="gettext('Remove')"
              @click="remove"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="syncable ? 'primary' : 'grey'"
              :disable="!syncable"
              :label="gettext('Sync')"
              @click="openSync"
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
      </q-table>
    </q-card-section>
    <RealmSyncJobsPage embedded />
    <q-dialog
      v-model="dialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="720px"
        :title="`${gettext(action === 'add' ? 'Add' : 'Edit')}: ${form.type}`"
        :loading="saving"
      >
        <q-tabs
          v-if="isDirectory"
          v-model="formTab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="justify"
          narrow-indicator
        >
          <q-tab
            no-caps
            name="general"
            :label="gettext('General')"
          />
          <q-tab
            no-caps
            name="sync"
            :label="gettext('Sync Options')"
          />
        </q-tabs>
        <q-separator v-if="isDirectory" />
        <div
          v-show="formTab === 'general'"
          class="u-border q-ma-sm q-pa-md u-dense realm-form-grid"
        >
          <q-input
            v-model="form.realm"
            dense
            :disable="action === 'edit'"
            :label="`${gettext('Realm')} *`"
          />
          <q-toggle
            v-model="form.default"
            :label="gettext('Default')"
          />
          <q-select
            v-if="supportsTfa"
            v-model="form.tfaType"
            dense
            options-dense
            emit-value
            map-options
            :options="[
              { label: gettext('None'), value: '__default__' },
              { label: 'OATH/TOTP', value: 'oath' },
              { label: 'Yubico', value: 'yubico' },
            ]"
            :label="gettext('Require TFA')"
          />
          <template v-if="form.tfaType === 'oath'">
            <q-input
              v-model="form.tfaStep"
              dense
              type="number"
              min="10"
              :label="gettext('Time Step')"
            />
            <q-input
              v-model="form.tfaDigits"
              dense
              type="number"
              min="6"
              max="8"
              :label="gettext('Secret Length')"
            />
          </template>
          <template v-if="form.tfaType === 'yubico'">
            <q-input
              v-model="form.tfaId"
              dense
              label="Yubico API Id"
            />
            <q-input
              v-model="form.tfaKey"
              dense
              label="Yubico API Key"
            />
            <q-input
              v-model="form.tfaUrl"
              dense
              label="Yubico URL"
            />
          </template>
          <template v-if="form.type === 'ldap'">
            <q-input
              v-model="form.base_dn"
              dense
              :label="`${gettext('Base Domain Name')} *`"
            />
            <q-input
              v-model="form.user_attr"
              dense
              :label="`${gettext('User Attribute Name')} *`"
            />
          </template>
          <template v-if="form.type === 'ad'">
            <q-input
              v-model="form.domain"
              dense
              :label="`${gettext('Domain')} *`"
            />
            <q-toggle
              v-model="form['case-sensitive']"
              :label="gettext('Case-Sensitive')"
            />
          </template>
          <template v-if="isDirectory">
            <q-input
              v-model="form.server1"
              dense
              :label="`${gettext('Server')} *`"
            />
            <q-input
              v-model="form.server2"
              dense
              :label="gettext('Fallback Server')"
            />
            <q-input
              v-model="form.port"
              dense
              type="number"
              min="1"
              max="65535"
              :label="gettext('Port')"
            />
            <q-select
            v-model="form.mode"
            dense
            options-dense
              emit-value
              map-options
              :options="[
                { label: gettext('Default'), value: '__default__' },
                { label: 'LDAP', value: 'ldap' },
                { label: 'STARTTLS', value: 'ldap+starttls' },
                { label: 'LDAPS', value: 'ldaps' },
              ]"
              :label="gettext('Mode')"
            />
            <q-toggle
              v-model="form.verify"
              :disable="form.mode === 'ldap' || form.mode === '__default__'"
              :label="gettext('Verify Certificate')"
            />
            <q-toggle
              v-model="form['check-connection']"
              :label="gettext('Check connection')"
            />
          </template>
          <template v-if="form.type === 'openid'">
            <q-input
              v-model="form['issuer-url']"
              dense
              :label="`${gettext('Issuer URL')} *`"
            />
            <q-input
              v-model="form['client-id']"
              dense
              :label="`${gettext('Client ID')} *`"
            />
            <q-input
              v-model="form['client-key']"
              dense
              :label="gettext('Client Key')"
            />
            <q-input
              v-model="form.scopes"
              dense
              :label="gettext('Scopes')"
            />
            <q-select
            v-model="form['username-claim']"
            dense
            options-dense
              :options="['__default__', 'subject', 'username', 'email']"
              :label="gettext('Username Claim')"
            />
            <q-toggle
              v-model="form.autocreate"
              :label="gettext('Autocreate Users')"
            />
            <q-toggle
              v-model="form['groups-autocreate']"
              :label="gettext('Autocreate Groups')"
            />
            <q-input
              v-model="form['groups-claim']"
              dense
              :label="gettext('Groups Claim')"
            />
            <q-toggle
              v-model="form['groups-overwrite']"
              :label="gettext('Overwrite Groups')"
            />
            <q-select
            v-model="form.prompt"
            dense
            options-dense
              :options="['__default__', 'none', 'login', 'consent', 'select_account']"
              :label="gettext('Prompt')"
            />
            <q-input
              v-model="form['acr-values']"
              dense
              :label="gettext('ACR Values')"
            />
            <q-toggle
              v-model="form['query-userinfo']"
              :label="gettext('Query userinfo endpoint')"
            />
            <q-input
              v-model="form.audiences"
              dense
              :label="gettext('Audiences')"
            />
          </template>
          <q-input
            v-model="form.comment"
            dense
            :label="gettext('Comment')"
          />
        </div>
        <div
          v-show="formTab === 'sync' && isDirectory"
          class="u-border q-ma-sm q-pa-md u-dense realm-form-grid"
        >
          <q-input
            v-model="form.bind_dn"
            dense
            :label="gettext('Bind User')"
          />
          <q-input
            v-model="form.password"
            dense
            type="password"
            :label="gettext('Bind Password')"
          />
          <q-input
            v-model="form.email"
            dense
            :label="gettext('E-Mail attribute')"
          />
          <q-input
            v-model="form.group_name_attr"
            dense
            :label="gettext('Groupname attr.')"
          />
          <q-select
            v-model="form.scope"
            dense
            options-dense
            emit-value
            map-options
            :options="[
              { label: gettext('None'), value: '__default__' },
              { label: gettext('Users'), value: 'users' },
              { label: gettext('Groups'), value: 'groups' },
              { label: gettext('Users and Groups'), value: 'both' },
            ]"
            :label="gettext('Scope')"
          />
          <q-select
            v-model="form['enable-new']"
            dense
            options-dense
            emit-value
            map-options
            :options="[
              { label: gettext('Default'), value: '__default__' },
              { label: gettext('Yes'), value: '1' },
              { label: gettext('No'), value: '0' },
            ]"
            :label="gettext('Enable new users')"
          />
          <q-input
            v-model="form.user_classes"
            dense
            :label="gettext('User classes')"
          />
          <q-input
            v-model="form.group_classes"
            dense
            :label="gettext('Group classes')"
          />
          <q-input
            v-model="form.filter"
            dense
            :label="gettext('User Filter')"
          />
          <q-input
            v-model="form.group_filter"
            dense
            :label="gettext('Group Filter')"
          />
          <q-list bordered>
            <q-item-label header>{{ gettext('Remove Vanished Options') }}</q-item-label>
            <q-item>
              <q-checkbox
                v-model="form['remove-vanished-acl']"
                :label="gettext('ACL')"
              />
            </q-item>
            <q-item>
              <q-checkbox
                v-model="form['remove-vanished-entry']"
                :label="gettext('Entry')"
              />
            </q-item>
            <q-item>
              <q-checkbox
                v-model="form['remove-vanished-properties']"
                :label="gettext('Properties')"
              />
            </q-item>
          </q-list>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            flat
            no-caps
            size="12px"
            :disable="saving"
            :class="!saving ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'"
            :label="gettext('OK')"
            @click="save"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="syncDialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="560px"
        :title="gettext('Realm Sync')"
        :loading="saving"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense realm-form-grid">
          <q-select
            v-model="sync.scope"
            dense
            options-dense
            emit-value
            map-options
            :options="[
              { label: gettext('Users'), value: 'users' },
              { label: gettext('Groups'), value: 'groups' },
              { label: gettext('Users and Groups'), value: 'both' },
            ]"
            :label="gettext('Scope')"
          />
          <q-toggle
            v-model="sync.enableNew"
            :label="gettext('Enable new')"
          />
          <q-list bordered>
            <q-item-label header>{{ gettext('Remove Vanished Options') }}</q-item-label>
            <q-item>
              <q-checkbox
                v-model="sync.acl"
                :label="gettext('ACL')"
              />
            </q-item>
            <q-item>
              <q-checkbox
                v-model="sync.entry"
                :label="gettext('Entry')"
              />
            </q-item>
            <q-item>
              <q-checkbox
                v-model="sync.properties"
                :label="gettext('Properties')"
              />
            </q-item>
          </q-list>
          <q-inner-loading :showing="saving" />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            flat
            no-caps
            size="12px"
            outline
            color="primary"
            class="u-button"
            :disable="saving"
            :label="gettext('Preview')"
            @click="submitSync(true)"
          />
          <q-btn
            flat
            no-caps
            size="12px"
            :disable="saving"
            :class="!saving ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'"
            :label="gettext('Sync')"
            @click="submitSync(false)"
          />
        </template>
      </UWindow>
    </q-dialog>
    <TaskOutputDialog
      v-model="task.visible"
      :node="task.node"
      :upid="task.upid"
      :title="task.title"
      @finished="reload"
    />
  </q-card>
</template>
<style scoped>
.realm-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.realm-form-grid :deep(.q-field) {
  padding-bottom: 15px;
}
.realm-form-grid :deep(.q-list) {
  grid-column: 1 / -1;
}
@media (max-width: 640px) {
  .realm-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
