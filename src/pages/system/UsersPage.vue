<script setup lang="ts">
import { Dialog } from 'quasar';
import type { QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useSessionStore } from '@/stores/session';
import {
  createUser,
  getGroups,
  getRealms,
  getUser,
  getUsers,
  removeUser,
  unlockUserTfa,
  updateUser,
  updateUserPassword,
  type EditUserPayload,
  type PveGroup,
  type PveRealm,
  type PveUser,
} from '@/api/users';
import { gettext } from '@/locale';
import GrantedPermissionsDialog from './permission/GrantedPermissionsDialog.vue';

defineProps<{
  embedded?: boolean;
}>();

type UserFormAction = 'add' | 'edit';

type UserFormModel = {
  action: UserFormAction;
  userid: string;
  firstname: string;
  password: string;
  confirmPassword: string;
  realm: string;
  lastname: string;
  groups: string[];
  email: string;
  enable: boolean;
  expire: string;
  comment: string;
  keys: string;
};

type RealmOption = {
  value: string;
  label: string;
};

type UserRow = PveUser & {
  username: string;
  realmName: string;
  fullName: string;
  expireText: string;
  enabled: boolean;
};

const session = useSessionStore();
const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const users = ref<UserRow[]>([]);
const selectedUsers = ref<UserRow[]>([]);
const createDialogVisible = ref(false);
const passwordDialogVisible = ref(false);
const permissionsDialogVisible = ref(false);
const groupOptions = ref<PveGroup[]>([]);
const realmOptions = ref<RealmOption[]>([]);

const createDialogTitle = computed(
  () => `${gettext(formData.action === 'add' ? 'Add' : 'Edit')}: ${gettext('User')}`,
);
const canModifyUsers = computed(() => {
  const access = session.caps.access;
  return Boolean(
    access && typeof access === 'object' && (access as Record<string, unknown>)['User.Modify'],
  );
});
const selectedUser = computed(() => selectedUsers.value[0]);
const canEdit = computed(() => canModifyUsers.value && selectedUsers.value.length === 1);
const canChangePassword = computed(() => {
  if (selectedUsers.value.length !== 1) return false;
  return ['ad', 'ldap', 'pam', 'pve'].includes(selectedUser.value?.['realm-type'] || '');
});
const canRemove = computed(
  () => canModifyUsers.value && selectedUsers.value.length === 1 && selectedUser.value?.userid !== 'root@pam',
);
const isTfaLocked = computed(() => {
  const user = selectedUser.value;
  return Boolean(user?.['totp-locked'] || user?.['tfa-locked-until']);
});
const canUnlockTfa = computed(() => canModifyUsers.value && selectedUsers.value.length === 1 && isTfaLocked.value);
const legacyKeysLocked = computed(() => ['x', 'x!oath', 'x!u2f', 'x!yubico'].includes(formData.keys));
const filteredUsers = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return users.value;

  return users.value.filter((item) => {
    const text = [
      item.userid,
      item.username,
      item.realmName,
      item.firstname || '',
      item.lastname || '',
      item.fullName,
      item.comment || '',
      item.email || '',
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(keyword);
  });
});

const formData = reactive<UserFormModel>(createDefaultForm());
const passwordForm = reactive({
  currentPassword: '',
  password: '',
  confirmPassword: '',
});

const useridRef = ref();
const emailRef = ref();
const passwordRef = ref();
const confirmPasswordRef = ref();
const passwordDialogPasswordRef = ref();
const passwordDialogConfirmRef = ref();
const passwordDialogCurrentRef = ref();

const tableColumns: QTableColumn<UserRow>[] = [
  {
    name: 'userid',
    required: true,
    label: gettext('Username'),
    align: 'left',
    field: 'username',
    sortable: true,
  },
  {
    name: 'realm',
    required: true,
    label: gettext('Realm'),
    align: 'left',
    field: 'realmName',
    sortable: true,
  },
  {
    name: 'enable',
    label: gettext('Enabled'),
    align: 'left',
    field: 'enabled',
    sortable: true,
  },
  {
    name: 'expire',
    label: gettext('Expire'),
    align: 'left',
    field: 'expireText',
    sortable: true,
  },
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: 'fullName',
    sortable: true,
  },
  { name: 'tfa', label: gettext('TFA'), align: 'left', field: (row) => formatUserTfa(row), sortable: true },
  { name: 'groups', label: gettext('Groups'), align: 'left', field: (row) => row.groups || '' },
  {
    name: 'comment',
    label: gettext('Comment'),
    align: 'left',
    field: 'comment',
  },
];
const visibleColumns = ['userid', 'realm', 'enable', 'expire', 'name', 'tfa', 'groups', 'comment'];

function createDefaultForm(): UserFormModel {
  return {
    action: 'add',
    userid: '',
    firstname: '',
    password: '',
    confirmPassword: '',
    realm: '',
    lastname: '',
    groups: [],
    email: '',
    enable: true,
    expire: '',
    comment: '',
    keys: '',
  };
}

function resetForm(action: UserFormAction) {
  Object.assign(formData, createDefaultForm(), { action });
}

function resetPasswordForm() {
  passwordForm.currentPassword = '';
  passwordForm.password = '';
  passwordForm.confirmPassword = '';
}

function rowClick(_: Event, row: UserRow) {
  selectedUsers.value = selectedUser.value === row ? [] : [row];
}

function sortByUserid(items: PveUser[]) {
  return [...items].sort((left, right) => left.userid.localeCompare(right.userid));
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timestampToDateText(timestamp?: number) {
  if (!timestamp) return gettext('never');
  const text = formatDate(new Date(timestamp * 1000));
  return text === '1970-01-01' ? gettext('never') : text;
}

function formatUserTfa(user: PveUser) {
  const keys = user.keys || '';
  if (!keys) return gettext('No');
  if (keys === 'x!oath') return 'totp';
  if (keys.startsWith('x!')) return keys.slice(2);
  if (keys !== '1') return gettext('No');
  if ((user['tfa-locked-until'] || 0) > Date.now() / 1000) return gettext('Locked');
  if (user['totp-locked']) return gettext('TOTP Locked');
  return gettext('Yes');
}

function userToRow(user: PveUser): UserRow {
  const [username = user.userid, realmName = ''] = user.userid.split('@');
  const firstname = user.firstname || '';
  const lastname = user.lastname || '';
  return {
    ...user,
    username,
    realmName,
    enabled: Boolean(user.enable),
    expireText: timestampToDateText(user.expire),
    fullName: `${firstname} ${lastname}`.trim(),
  };
}

function formatRealmOption(realm: PveRealm): RealmOption {
  let label = realm.comment || realm.realm;
  if (realm.tfa) {
    label += ` (+ ${realm.tfa})`;
  }
  return {
    value: realm.realm,
    label,
  };
}

function usernameRules(value: string) {
  return formData.action !== 'add' || value.trim()
    ? true
    : gettext('This field is required');
}

function emailRules(value: string) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? true
    : gettext('Please enter a valid email address');
}

function passwordRules(value: string) {
  if (!value) return gettext('This field is required');
  return value.length >= 8 && value.length <= 64
    ? true
    : `${gettext('The length for this field is')}: [8-64]`;
}

function confirmPasswordRules(value: string, password: string) {
  if (!value) return gettext('This field is required');
  return value === password ? true : gettext('Passwords do not match');
}

function validateRefs(refs: Array<{ validate?: () => boolean | Promise<boolean> } | undefined>) {
  return refs.every((item) => item?.validate?.() !== false);
}

function validateCreateForm() {
  const basePass = validateRefs([useridRef.value, emailRef.value]);
  if (!basePass) return false;

  if (formData.action === 'add' && formData.realm === 'pve') {
    return validateRefs([passwordRef.value, confirmPasswordRef.value]);
  }

  return true;
}

function validatePasswordForm() {
  const refs = [passwordDialogPasswordRef.value, passwordDialogConfirmRef.value];
  if (session.userid !== 'root@pam') refs.unshift(passwordDialogCurrentRef.value);
  return validateRefs(refs);
}

function buildSubmitPayload() {
  const expireTimestamp = formData.expire ? new Date(formData.expire).getTime() / 1000 : 0;
  const payload: EditUserPayload = {
    userid: `${formData.userid}@${formData.realm}`,
    groups: formData.groups.join(','),
    expire: Number.isFinite(expireTimestamp) ? expireTimestamp : 0,
    enable: formData.enable ? 1 : 0,
    firstname: formData.firstname,
    lastname: formData.lastname,
    email: formData.email,
    comment: formData.comment,
    keys: formData.keys,
  };

  if (formData.action === 'add' && formData.realm === 'pve') {
    payload.password = formData.password;
  }

  return payload;
}

async function loadUsersData() {
  loading.value = true;
  try {
    const response = await getUsers(true);
    users.value = sortByUserid(response.data || []).map(userToRow);
    selectedUsers.value = selectedUser.value
      ? users.value.filter((item) => item.userid === selectedUser.value?.userid)
      : [];
  } finally {
    loading.value = false;
  }
}

async function loadDialogOptions() {
  const [realmsResponse, groupsResponse] = await Promise.all([getRealms(), getGroups()]);
  const realms = (realmsResponse.data || []).map(formatRealmOption);
  realmOptions.value = realms.sort((left, right) => left.value.localeCompare(right.value));
  groupOptions.value = [...(groupsResponse.data || [])].sort((left, right) =>
    left.groupid.localeCompare(right.groupid),
  );
  if (!formData.realm) {
    formData.realm =
      realmOptions.value.find((item) => item.value === 'pam')?.value || realms[0]?.value || '';
  }
}

async function openCreateDialog(action: UserFormAction) {
  resetForm(action);
  createDialogVisible.value = true;
  dialogLoading.value = true;

  try {
    await loadDialogOptions();

    if (action === 'edit' && selectedUser.value) {
      const response = await getUser(selectedUser.value.userid);
      const user = response.data || {};
      const [username = '', realmName = ''] = selectedUser.value.userid.split('@');
      formData.userid = username;
      formData.realm = realmName;
      formData.firstname = user.firstname || '';
      formData.lastname = user.lastname || '';
      formData.groups = Array.isArray(user.groups)
        ? user.groups
        : user.groups
          ? user.groups.split(',').filter(Boolean)
          : [];
      formData.email = user.email || '';
      formData.enable = Boolean(user.enable);
      formData.comment = user.comment || '';
      formData.keys = user.keys || '';
      formData.expire = user.expire ? formatDate(new Date(user.expire * 1000)) : '';

      if (formData.expire === '1970-01-01') {
        formData.expire = '';
      }
    }
  } finally {
    dialogLoading.value = false;
  }
}

async function submitUserForm() {
  if (!validateCreateForm()) return;

  dialogLoading.value = true;
  try {
    const payload = buildSubmitPayload();
    if (formData.action === 'add') {
      await createUser(payload);
    } else if (selectedUser.value) {
      const updatePayload = Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== 'userid'),
      ) as Omit<EditUserPayload, 'userid'>;
      await updateUser(selectedUser.value.userid, updatePayload);
    }

    createDialogVisible.value = false;
    await loadUsersData();
  } finally {
    dialogLoading.value = false;
  }
}

function openPasswordDialog() {
  resetPasswordForm();
  passwordDialogVisible.value = true;
}

function openGrantedPermissions() {
  if (selectedUser.value) permissionsDialogVisible.value = true;
}

async function submitPassword() {
  if (!selectedUser.value || !validatePasswordForm()) return;

  dialogLoading.value = true;
  try {
    await updateUserPassword(
      selectedUser.value.userid,
      passwordForm.password,
      session.userid === 'root@pam' ? undefined : passwordForm.currentPassword,
    );
    passwordDialogVisible.value = false;
  } finally {
    dialogLoading.value = false;
  }
}

function confirmRemoveUser() {
  if (!selectedUser.value) return;

  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', selectedUser.value.userid),
    html: true,
    cancel: { flat: true, label: gettext('Cancel') },
    ok: { flat: true, label: gettext('Confirm'), color: 'primary' },
    persistent: true,
  }).onOk(() => {
    void removeSelectedUser();
  });
}

async function removeSelectedUser() {
  if (!selectedUser.value || selectedUser.value.userid === 'root@pam') return;

  loading.value = true;
  try {
    await removeUser(selectedUser.value.userid);
    selectedUsers.value = [];
    await loadUsersData();
  } finally {
    loading.value = false;
  }
}
async function unlockSelectedUserTfa() {
  if (!selectedUser.value || !canUnlockTfa.value) return;
  loading.value = true;
  try {
    await unlockUserTfa(selectedUser.value.userid);
    await loadUsersData();
  } finally {
    loading.value = false;
  }
}

function confirmUnlockSelectedUserTfa() {
  const user = selectedUser.value;
  if (!user || !canUnlockTfa.value) return;
  Dialog.create({
    title: gettext('Unlock TFA authentication for {0}').replace('{0}', user.userid),
    message: gettext("Locked 2nd factors can happen if the user's password was leaked. Are you sure you want to unlock the user?"),
    cancel: { flat: true, label: gettext('Cancel') },
    ok: { flat: true, label: gettext('Confirm'), color: 'primary' },
    persistent: true,
  }).onOk(() => void unlockSelectedUserTfa());
}

watch(createDialogVisible, (visible) => {
  if (!visible) {
    resetForm('add');
  }
});

watch(passwordDialogVisible, (visible) => {
  if (!visible) {
    resetPasswordForm();
  }
});

onMounted(() => {
  void loadUsersData();
});
defineExpose({ reload: loadUsersData });
</script>

<template>
  <q-card
    class="no-border-radius no-shadow users-page-card"
    :class="embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'"
  >
    <q-card-section :class="embedded ? 'q-pa-none' : undefined">
      <q-table
        v-model:selected="selectedUsers"
        flat
        selection="single"
        hide-selected-banner
        row-key="userid"
        table-header-class="u-table-header"
        :rows="filteredUsers"
        :columns="tableColumns"
        :visible-columns="visibleColumns"
        :rows-per-page-options="[10]"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :loading="loading"
        :no-data-label="gettext('no record can be found')"
        @row-click="rowClick"
        @row-dblclick="() => canEdit && openCreateDialog('edit')"
      >
        <template #top>
          <div class="q-gutter-sm">
            <q-btn
              v-if="canModifyUsers"
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
              @click="openCreateDialog('add')"
            />
            <q-btn
              v-if="canModifyUsers"
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canEdit ? 'primary' : 'grey'"
              :disable="!canEdit"
              :label="gettext('Edit')"
              @click="openCreateDialog('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canChangePassword ? 'primary' : 'grey'"
              :disable="!canChangePassword"
              :label="gettext('Password')"
              @click="openPasswordDialog"
            />
            <q-btn no-caps outline size="12px" class="u-button" :color="selectedUser ? 'primary' : 'grey'" :disable="!selectedUser" :label="gettext('Permissions')" @click="openGrantedPermissions" />
            <q-btn
              v-if="canModifyUsers"
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canUnlockTfa ? 'primary' : 'grey'"
              :disable="!canUnlockTfa"
              :label="gettext('Unlock TFA')"
              @click="confirmUnlockSelectedUserTfa"
            />
            <q-btn
              v-if="canModifyUsers"
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canRemove ? 'red' : 'grey'"
              :disable="!canRemove"
              :label="gettext('Remove')"
              @click="confirmRemoveUser"
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

        <template #body-cell-comment="props">
          <q-td :props="props">
            <div class="users-comment text-overflow" :title="props.value">
              {{ props.value }}
            </div>
          </q-td>
        </template>

        <template #body-cell-enable="props">
          <q-td :props="props">
            <q-badge
              :color="props.value ? 'green' : 'red'"
              :label="props.value ? gettext('Enabled') : gettext('Disabled')"
            />
          </q-td>
        </template>

        <template #no-data="{ message }">
          <div class="full-width row flex-center text-accent q-gutter-sm">
            <span class="text-grey-6">{{ message }}</span>
          </div>
        </template>
      </q-table>
    </q-card-section>

    <q-dialog
      v-model="createDialogVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="u-window-card users-dialog-card">
        <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
          <q-spinner-bars size="14px" color="white" />
          <div class="text-weight-bold q-mx-sm text-overflow">{{ createDialogTitle }}</div>
          <q-space />
          <q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense />
        </q-card-section>
        <q-card-section class="q-pa-none u-hidden-error">
          <div class="u-border q-ma-sm q-pa-md dialog-body">
            <div class="row q-gutter-md">
              <div class="col">
                <q-input
                  ref="useridRef"
                  v-model="formData.userid"
                  dense
                  autofocus
                  :disable="formData.action !== 'add'"
                  :label="`${gettext('Username')} *`"
                  :rules="[usernameRules]"
                />
              </div>
              <div class="col">
                <q-input
                  v-model="formData.firstname"
                  dense
                  :label="gettext('First Name')"
                  class="q-field--with-bottom"
                />
              </div>
            </div>

            <div class="row q-gutter-md">
              <div class="col">
                <q-select
                  v-model="formData.realm"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :disable="formData.action !== 'add'"
                  :label="gettext('Realm')"
                  option-value="value"
                  option-label="label"
                  :options="realmOptions"
                  class="q-field--with-bottom"
                />
              </div>
              <div class="col">
                <q-input
                  v-model="formData.lastname"
                  dense
                  :label="gettext('Last Name')"
                  class="q-field--with-bottom"
                />
              </div>
            </div>

            <div
              v-if="formData.action === 'add' && formData.realm === 'pve'"
              class="row q-gutter-md"
            >
              <div class="col">
                <q-input
                  ref="passwordRef"
                  v-model="formData.password"
                  dense
                  type="password"
                  :label="`${gettext('Password')} *`"
                  :rules="[passwordRules]"
                />
              </div>
              <div class="col">
                <q-input
                  ref="confirmPasswordRef"
                  v-model="formData.confirmPassword"
                  dense
                  type="password"
                  :label="`${gettext('Confirm Password')} *`"
                  :rules="[(value: string) => confirmPasswordRules(value, formData.password)]"
                />
              </div>
            </div>

            <div class="row q-gutter-md">
              <div class="col">
                <q-select
                  v-model="formData.groups"
                  multiple
                  dense
                  clearable
                  option-value="groupid"
                  option-label="groupid"
                  map-options
                  emit-value
                  :label="gettext('Group')"
                  :options="groupOptions"
                  class="q-field--with-bottom"
                >
                  <template #before-options>
                    <div class="row bg-grey-3 text-grey-10 u-border-bottom q-pa-sm q-pl-md">
                      <div class="col text-overflow">{{ gettext('Group') }}</div>
                      <div class="col text-overflow">{{ gettext('Comment') }}</div>
                    </div>
                  </template>
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps" dense class="u-border-bottom">
                      <q-item-section>
                        <div class="row">
                          <div class="col text-overflow">
                            {{ scope.opt.groupid }}
                          </div>
                          <div class="col text-overflow">
                            {{ scope.opt.comment }}
                          </div>
                        </div>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>
              <div class="col">
                <q-input
                  ref="emailRef"
                  v-model="formData.email"
                  dense
                  :label="gettext('Email')"
                  :rules="[emailRules]"
                  class="q-field--with-bottom"
                />
              </div>
            </div>

            <div class="row q-gutter-md">
              <div class="col">
                <q-input
                  v-model="formData.expire"
                  dense
                  mask="date"
                  :rules="['date']"
                  :label="gettext('Expire')"
                >
                  <template #append>
                    <q-icon name="event" class="cursor-pointer">
                      <q-popup-proxy transition-show="scale" transition-hide="scale">
                        <q-date v-model="formData.expire" minimal mask="YYYY-MM-DD" />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
              </div>
              <div class="col">
                <q-input
                  v-model="formData.comment"
                  dense
                  :label="gettext('Comment')"
                  class="q-field--with-bottom"
                />
              </div>
            </div>

            <div class="row">
              <div class="col">
                <q-input
                  v-model="formData.keys"
                  dense
                  :disable="formData.action === 'edit' && legacyKeysLocked"
                  :label="gettext('Key IDs')"
                  class="q-field--with-bottom"
                />
              </div>
              <div class="col q-py-sm q-ml-md">
                <q-checkbox
                  v-model="formData.enable"
                  dense
                  right-label
                  color="primary"
                  :label="gettext('Enable')"
                />
              </div>
            </div>
            <q-inner-loading :showing="dialogLoading" />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="bg-grey-2 overflow-hidden">
          <q-btn
            no-caps
            flat
            size="12px"
            :disable="dialogLoading"
            :label="gettext(formData.action === 'add' ? 'Add' : 'Edit')"
            :class="
              dialogLoading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'
            "
            @click="submitUserForm"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog
      v-model="passwordDialogVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <q-card class="u-window-card users-password-dialog">
        <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
          <q-spinner-bars size="14px" color="white" />
          <div class="text-weight-bold q-mx-sm text-overflow">
            {{ gettext('Setting') }}: {{ gettext('Password') }}
          </div>
          <q-space />
          <q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense />
        </q-card-section>
        <q-card-section class="q-pa-none u-hidden-error">
          <div class="u-border q-ma-sm q-pa-md">
            <q-input
              v-if="session.userid !== 'root@pam'"
              ref="passwordDialogCurrentRef"
              v-model="passwordForm.currentPassword"
              dense
              type="password"
              :label="`${gettext('Your Current Password')} *`"
              :rules="[(value: string) => value ? true : gettext('This field is required')]"
            />
            <div v-if="selectedUser?.['realm-type'] === 'pam'" class="text-caption text-grey-7 q-mb-sm">
              {{ gettext('For the PAM realm, this applies only to the connected node.') }}
            </div>
            <q-input
              ref="passwordDialogPasswordRef"
              v-model="passwordForm.password"
              dense
              autofocus
              type="password"
              maxlength="64"
              :label="`${gettext('Password')} *`"
              :rules="[passwordRules]"
            />
            <q-input
              ref="passwordDialogConfirmRef"
              v-model="passwordForm.confirmPassword"
              dense
              type="password"
              maxlength="64"
              :label="`${gettext('Confirm Password')} *`"
              :rules="[(value: string) => confirmPasswordRules(value, passwordForm.password)]"
            />
            <q-inner-loading :showing="dialogLoading" />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="bg-grey-2 overflow-hidden">
          <q-btn
            no-caps
            flat
            size="12px"
            :disable="dialogLoading"
            :label="gettext('OK')"
            :class="
              dialogLoading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'
            "
            @click="submitPassword"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <GrantedPermissionsDialog v-model="permissionsDialogVisible" :userid="selectedUser?.userid || ''" />
  </q-card>
</template>

<style scoped>
.users-page-card {
  position: relative;
}

.users-comment {
  max-width: 150px;
}

.u-window-card {
  border-radius: 0;
}

.users-dialog-card {
  width: 580px;
  max-width: 580px;
}

.users-password-dialog {
  width: 400px;
  max-width: 400px;
}

.dialog-body {
  position: relative;
}
</style>
