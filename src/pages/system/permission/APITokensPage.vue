<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { getApiTokens, type PveRecord } from '@/api/resources';
import { createApiToken, getUsers, removeApiToken, updateApiToken } from '@/api/users';
import SelectTable from '@/components/SelectTable.vue';
import UWindow from '@/components/UWindow.vue';
import GrantedPermissionsDialog from './GrantedPermissionsDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { formatDate, yesNo } from '@/utils/format';

type TokenRow = {
  id: string;
  userid: string;
  tokenid: string;
  expire?: number;
  comment?: string;
  privsep: boolean;
};
type UserOption = { label: string; value: string; name: string; comment: string };
const { embedded = false } = defineProps<{ embedded?: boolean }>();
const session = useSessionStore();
const filter = ref('');
const loading = shallowRef(false);
const selected = shallowRef<TokenRow[]>([]);
const rows = shallowRef<TokenRow[]>([]);
const editorVisible = shallowRef(false);
const secretVisible = shallowRef(false);
const editing = shallowRef(false);
const secret = shallowRef('');
const permissionsVisible = shallowRef(false);
const fullTokenId = shallowRef('');
const userOptions = shallowRef<UserOption[]>([]);
const form = reactive({ userid: '', tokenid: '', privsep: true, expire: '', comment: '' });
const selectedRow = computed(() => selected.value[0]);
const canModify = computed(() =>
  Boolean((session.caps.access as Record<string, unknown> | undefined)?.['User.Modify'])
);
const canManageSelected = computed(() =>
  Boolean(selectedRow.value && (canModify.value || selectedRow.value.userid === session.userid))
);
const filteredRows = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return rows.value;
  return rows.value.filter((row) =>
    [row.userid, row.tokenid, row.comment, row.privsep ? 'yes' : 'no']
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  );
});
const columns: QTableColumn<TokenRow>[] = [
  { name: 'userid', label: gettext('Username'), field: 'userid', align: 'left', sortable: true },
  {
    name: 'tokenid',
    label: gettext('Token Name'),
    field: 'tokenid',
    align: 'left',
    sortable: true,
  },
  {
    name: 'expire',
    label: gettext('Expire'),
    field: (row) => formatDate(row.expire),
    align: 'left',
  },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
  {
    name: 'privsep',
    label: gettext('Privilege Separation'),
    field: (row) => yesNo(row.privsep),
    align: 'left',
  },
];
const userRows = computed<PveRecord[]>(() => userOptions.value.map((user) => ({ ...user })));
const userColumns: QTableColumn<PveRecord>[] = [
  { name: 'value', label: gettext('User'), field: 'value', align: 'left', sortable: true },
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
function resetForm() {
  Object.assign(form, {
    userid: session.userid,
    tokenid: '',
    privsep: true,
    expire: '',
    comment: '',
  });
}
function fillForm(row: TokenRow) {
  Object.assign(form, {
    userid: row.userid,
    tokenid: row.tokenid,
    privsep: row.privsep,
    expire: row.expire ? new Date(row.expire * 1000).toISOString().slice(0, 10) : '',
    comment: row.comment || '',
  });
}
function payload() {
  return {
    privsep: form.privsep ? (1 as const) : (0 as const),
    expire: form.expire ? Math.floor(new Date(form.expire).getTime() / 1000) : 0,
    comment: form.comment,
  };
}
async function reload() {
  loading.value = true;
  try {
    const response = await getApiTokens();
    rows.value = (response.data || [])
      .flatMap((user) =>
        Array.isArray(user.tokens)
          ? (user.tokens as PveRecord[]).map((token) => ({
              id: `${String(user.userid)}!${String(token.tokenid)}`,
              userid: String(user.userid),
              tokenid: String(token.tokenid),
              expire: Number(token.expire) || 0,
              comment: typeof token.comment === 'string' ? token.comment : '',
              privsep: Number(token.privsep) === 1,
            }))
          : []
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  } finally {
    loading.value = false;
  }
}
async function loadUserOptions() {
  const response = await getUsers();
  const users = (response.data || [])
    .filter((user) => user.enable !== 0 && user.enable !== false)
    .map((user) => ({
      label: user.userid,
      value: user.userid,
      name: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
      comment: user.comment || '',
    }));
  if (session.userid && !users.some((user) => user.value === session.userid))
    users.unshift({ label: session.userid, value: session.userid, name: '', comment: '' });
  userOptions.value = users;
}
async function openAdd() {
  resetForm();
  editing.value = false;
  editorVisible.value = true;
  await loadUserOptions();
}
function openEdit() {
  if (!selectedRow.value || !canManageSelected.value) return;
  fillForm(selectedRow.value);
  editing.value = true;
  editorVisible.value = true;
}
async function save() {
  if (!form.userid || form.tokenid.length < 2) {
    Notify.create({
      type: 'warning',
      message: gettext('Token ID must be at least 2 characters long.'),
    });
    return;
  }
  loading.value = true;
  try {
    const result = editing.value
      ? await updateApiToken(form.userid, form.tokenid, payload())
      : await createApiToken(form.userid, form.tokenid, payload());
    editorVisible.value = false;
    if (!editing.value && result.data?.value) {
      secret.value = result.data.value;
      fullTokenId.value = result.data['full-tokenid'] || `${form.userid}!${form.tokenid}`;
      secretVisible.value = true;
    }
    await reload();
  } finally {
    loading.value = false;
  }
}
function remove() {
  const row = selectedRow.value;
  if (!row || !canManageSelected.value) return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure you want to remove this?'),
    cancel: true,
  }).onOk(
    () =>
      void (async () => {
        await removeApiToken(row.userid, row.tokenid);
        await reload();
      })()
  );
}
function regenerate() {
  const row = selectedRow.value;
  if (!row || !canManageSelected.value) return;
  Dialog.create({
    title: gettext('Regenerate Secret'),
    message: gettext('The old secret will immediately become invalid.'),
    cancel: true,
  }).onOk(
    () =>
      void (async () => {
        const result = await updateApiToken(row.userid, row.tokenid, { regenerate: 1 });
        secret.value = result.data?.value || '';
        fullTokenId.value = result.data?.['full-tokenid'] || row.id;
        secretVisible.value = Boolean(secret.value);
        await reload();
      })()
  );
}
async function copySecret() {
  await navigator.clipboard?.writeText(secret.value);
  Notify.create({ type: 'positive', message: gettext('Copied') });
}
function openGrantedPermissions() {
  if (selectedRow.value) permissionsVisible.value = true;
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
        row-key="id"
        table-header-class="u-table-header"
        :rows="filteredRows"
        :columns="columns"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        :no-data-label="gettext('no record can be found')"
        @row-dblclick="openEdit"
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
              @click="openAdd"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canManageSelected ? 'primary' : 'grey'"
              :disable="!canManageSelected"
              :label="gettext('Edit')"
              @click="openEdit"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canManageSelected ? 'red' : 'grey'"
              :disable="!canManageSelected"
              :label="gettext('Remove')"
              @click="remove"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canManageSelected ? 'primary' : 'grey'"
              :disable="!canManageSelected"
              :label="gettext('Regenerate Secret')"
              @click="regenerate"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="selectedRow ? 'primary' : 'grey'"
              :disable="!selectedRow"
              :label="gettext('Show Permissions')"
              @click="openGrantedPermissions"
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
    <q-dialog
      v-model="editorVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="420px"
        :title="`${gettext(editing ? 'Edit' : 'Add')}: ${gettext('API Token')}`"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <SelectTable
            v-if="!editing"
            v-model="form.userid"
            :label="`${gettext('User')} *`"
            class="q-field--with-bottom"
            row-key="value"
            field-style="standard"
            :rows="userRows"
            :columns="userColumns"
            :display-value="form.userid"
            :get-row-value="(row) => String(row.value || '')"
          />
          <q-input
            v-else
            v-model="form.userid"
            dense
            disable
            :label="gettext('User')"
            class="q-field--with-bottom"
          />
          <q-input
            v-model="form.tokenid"
            dense
            :disable="editing"
            :label="`${gettext('Token ID')} *`"
            hint="minimum 2 characters"
            class="q-field--with-bottom"
          />
          <q-checkbox
            v-model="form.privsep"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Privilege Separation')"
          />
          <q-input
            v-model="form.expire"
            dense
            type="date"
            :label="gettext('Expire')"
            class="q-field--with-bottom"
          />
          <q-input
            v-model="form.comment"
            dense
            :label="gettext('Comment')"
            class="q-field--with-bottom"
          />
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
            no-caps
            flat
            size="12px"
            :label="gettext('OK')"
            :class="loading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'"
            @click="save"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="secretVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="460px"
        :title="gettext('Token Secret')"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <p class="q-mb-md">
            {{ gettext('Please record the API token secret - it will only be displayed now') }}
          </p>
          <q-input
            :model-value="fullTokenId"
            dense
            readonly
            :label="gettext('Token ID')"
            class="q-field--with-bottom"
          />
          <q-input
            :model-value="secret"
            dense
            readonly
            type="textarea"
            :label="gettext('Secret')"
            class="q-field--with-bottom"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Close')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :label="gettext('Copy Secret Value')"
            class="bg-primary text-grey-1 u-button"
            @click="copySecret"
          />
        </template>
      </UWindow>
    </q-dialog>
    <GrantedPermissionsDialog
      v-model="permissionsVisible"
      :userid="selectedRow ? `${selectedRow.userid}!${selectedRow.tokenid}` : ''"
    />
  </q-card>
</template>
