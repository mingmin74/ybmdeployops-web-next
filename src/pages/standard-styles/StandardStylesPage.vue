<script setup lang="ts">
import { Dialog, Notify } from 'quasar';
import type { QForm, QTableColumn } from 'quasar';
import { computed, reactive, ref } from 'vue';
import { gettext } from '@/locale';
import DemoPasswordDialog from './DemoPasswordDialog.vue';

type DemoUser = {
  userid: string;
  firstname: string;
  lastname: string;
  email: string;
  groups: string;
  enable: boolean;
  expire: string;
  keys: string;
  comment: string;
  tfaLocked: boolean;
};

type UserForm = Omit<DemoUser, 'userid' | 'tfaLocked'> & {
  username: string;
  realm: string;
  password: string;
  confirmPassword: string;
};

const realmOptions = ['pve', 'pam', 'ldap'];
const groupOptions = ['admins', 'operators', 'auditors'];
const dialogVisible = ref(false);
const passwordDialogVisible = ref(false);
const editingUserid = ref<string | null>(null);
const selected = ref<DemoUser[]>([]);
const filter = ref('');
const formRef = ref<QForm>();
const rows = ref<DemoUser[]>([
  {
    userid: 'admin@pve',
    firstname: '平台',
    lastname: '管理员',
    email: 'admin@example.com',
    groups: 'admins',
    enable: true,
    expire: '',
    keys: 'totp',
    comment: '平台管理账号',
    tfaLocked: false,
  },
  {
    userid: 'operator@pve',
    firstname: '运维',
    lastname: '人员',
    email: 'operator@example.com',
    groups: 'operators',
    enable: true,
    expire: '',
    keys: '',
    comment: '日常运维',
    tfaLocked: false,
  },
  {
    userid: 'auditor@pve',
    firstname: '审计',
    lastname: '人员',
    email: 'auditor@example.com',
    groups: 'auditors',
    enable: true,
    expire: '',
    keys: 'totp',
    comment: '安全审计',
    tfaLocked: true,
  },
  {
    userid: 'backup@pve',
    firstname: '备份',
    lastname: '服务',
    email: 'backup@example.com',
    groups: 'operators',
    enable: true,
    expire: '2027-12-31',
    keys: '',
    comment: '备份任务账号',
    tfaLocked: false,
  },
  {
    userid: 'test@ldap',
    firstname: '测试',
    lastname: '用户',
    email: 'test@example.com',
    groups: '',
    enable: false,
    expire: '',
    keys: '',
    comment: '测试账号',
    tfaLocked: false,
  },
  {
    userid: 'root@pam',
    firstname: '系统',
    lastname: '管理员',
    email: 'root@example.com',
    groups: 'admins',
    enable: true,
    expire: '',
    keys: 'totp',
    comment: '本地管理账号',
    tfaLocked: false,
  },
]);
const form = reactive<UserForm>(createEmptyForm());
const columns: QTableColumn<DemoUser>[] = [
  {
    name: 'userid',
    label: gettext('Username'),
    field: (row) => row.userid.split('@')[0] || '',
    align: 'left',
    sortable: true,
  },
  {
    name: 'realm',
    label: gettext('Realm'),
    field: (row) => row.userid.split('@')[1] || '',
    align: 'left',
    sortable: true,
  },
  { name: 'enable', label: gettext('Enabled'), field: 'enable', align: 'left', sortable: true },
  {
    name: 'expire',
    label: gettext('Expire'),
    field: (row) => row.expire || gettext('never'),
    align: 'left',
    sortable: true,
  },
  {
    name: 'name',
    label: gettext('Name'),
    field: (row) => `${row.firstname} ${row.lastname}`.trim(),
    align: 'left',
    sortable: true,
  },
  {
    name: 'tfa',
    label: gettext('TFA'),
    field: (row) => (row.tfaLocked ? gettext('Locked') : row.keys || gettext('No')),
    align: 'left',
    sortable: true,
  },
  { name: 'groups', label: gettext('Groups'), field: 'groups', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const selectedUser = computed(() => selected.value[0]);
const canUnlockTfa = computed(() => Boolean(selectedUser.value?.tfaLocked));
const canRemove = computed(() =>
  Boolean(selectedUser.value && selectedUser.value.userid !== 'root@pam')
);
const dialogTitle = computed(
  () => `${gettext(editingUserid.value === null ? 'Add' : 'Edit')}: ${gettext('User')}`
);

function createEmptyForm(): UserForm {
  return {
    username: '',
    realm: 'pve',
    firstname: '',
    lastname: '',
    password: '',
    confirmPassword: '',
    email: '',
    groups: '',
    enable: true,
    expire: '',
    keys: '',
    comment: '',
  };
}

function resetForm(record?: DemoUser) {
  Object.assign(
    form,
    record
      ? {
          ...record,
          username: record.userid.split('@')[0] || '',
          realm: record.userid.split('@')[1] || 'pve',
          password: '',
          confirmPassword: '',
        }
      : createEmptyForm()
  );
}

function openCreateDialog() {
  editingUserid.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEditDialog() {
  const record = selectedUser.value;
  if (!record) return;
  editingUserid.value = record.userid;
  resetForm(record);
  dialogVisible.value = true;
}

async function saveRecord() {
  const valid = await formRef.value?.validate();
  if (!valid) return;
  const userid = `${form.username.trim()}@${form.realm}`;
  if (rows.value.some((row) => row.userid === userid && row.userid !== editingUserid.value)) {
    Notify.create({ type: 'negative', message: '用户已存在', position: 'top' });
    return;
  }
  const record: DemoUser = {
    userid,
    firstname: form.firstname,
    lastname: form.lastname,
    email: form.email,
    groups: form.groups,
    enable: form.enable,
    expire: form.expire,
    keys: form.keys,
    comment: form.comment,
    tfaLocked: editingUserid.value === null ? false : Boolean(selectedUser.value?.tfaLocked),
  };
  rows.value =
    editingUserid.value === null
      ? [...rows.value, record]
      : rows.value.map((row) => (row.userid === editingUserid.value ? record : row));
  selected.value = [];
  dialogVisible.value = false;
  Notify.create({
    type: 'positive',
    message: editingUserid.value === null ? '用户已新增' : '用户已保存',
    position: 'top',
  });
}

function removeSelected() {
  const record = selectedUser.value;
  if (!record || !canRemove.value) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: `确定要移除用户“${record.userid}”吗？`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    rows.value = rows.value.filter((row) => row.userid !== record.userid);
    selected.value = [];
    Notify.create({ type: 'positive', message: '用户已移除', position: 'top' });
  });
}

function showPermissions() {
  if (!selectedUser.value) return;
  Dialog.create({
    title: `${selectedUser.value.userid} - ${gettext('Granted Permissions')}`,
    message: '此页使用示例数据，不连接真实用户权限。',
    ok: gettext('Close'),
  });
}

function unlockTfa() {
  const user = selectedUser.value;
  if (!user || !user.tfaLocked) return;
  rows.value = rows.value.map((row) =>
    row.userid === user.userid ? { ...row, tfaLocked: false } : row
  );
  selected.value = [];
  Notify.create({ type: 'positive', message: '示例用户的 TFA 已解锁', position: 'top' });
}
</script>

<template>
  <q-page class="standard-styles-page">
    <header class="standard-styles-page__header">
      <div>
        <h1>标准样式</h1>
        <p>使用 Quasar 原版组件样式的表格与表单弹窗测试页</p>
      </div>
    </header>

    <q-table
      v-model:selected="selected"
      class="standard-styles-table"
      :rows="rows"
      :columns="columns"
      row-key="userid"
      selection="single"
      :filter="filter"
      :pagination="{ rowsPerPage: 10 }"
      flat
      bordered
    >
      <template #top>
        <q-toolbar class="standard-styles-table__toolbar q-pa-none">
          <div class="standard-styles-table__search-wrap">
            <q-input
              v-model="filter"
              outlined
              dense
              debounce="300"
              :placeholder="gettext('Search')"
              class="standard-styles-table__search"
              clearable
            >
              <template #append><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="row q-gutter-sm q-ml-md">
            <q-btn
              color="primary"
              glossy
              icon="add"
              :label="gettext('Add')"
              @click="openCreateDialog"
            />
            <q-btn
              color="primary"
              outline
              no-caps
              icon="edit"
              :label="gettext('Edit')"
              :disable="selected.length !== 1"
              @click="openEditDialog"
            />
            <q-btn
              color="primary"
              outline
              no-caps
              :label="gettext('Password')"
              :disable="selected.length !== 1"
              @click="passwordDialogVisible = true"
            />
            <q-btn
              color="primary"
              outline
              no-caps
              :label="gettext('Permissions')"
              :disable="selected.length !== 1"
              @click="showPermissions"
            />
            <q-btn
              color="primary"
              outline
              no-caps
              :label="gettext('Unlock TFA')"
              :disable="!canUnlockTfa"
              @click="unlockTfa"
            />
            <q-btn
              color="negative"
              outline
              no-caps
              icon="delete"
              :label="gettext('Remove')"
              :disable="!canRemove"
              @click="removeSelected"
            />
          </div>
        </q-toolbar>
      </template>

      <template #body-cell-enable="props">
        <q-td :props="props">
          <q-badge
            rounded
            :color="props.value ? 'positive' : 'grey'"
            :label="props.value ? gettext('Enabled') : gettext('Disabled')"
          />
        </q-td>
      </template>

      <template #no-data>
        <div class="full-width row flex-center q-gutter-sm q-pa-xl text-grey-7">
          <q-icon
            name="inbox"
            size="28px"
          />
          <span>{{ gettext('no record can be found') }}</span>
        </div>
      </template>
    </q-table>

    <q-dialog v-model="dialogVisible">
      <q-card
        class="standard-style-dialog"
        role="dialog"
        :aria-label="dialogTitle"
      >
        <q-card-section class="row items-center">
          <div class="text-h6">{{ dialogTitle }}</div>
          <q-space />
          <q-btn
            v-close-popup
            icon="close"
            flat
            round
            dense
            aria-label="关闭"
          />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-form
            ref="formRef"
            class="q-gutter-y-md"
            @submit="saveRecord"
          >
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.username"
                  autofocus
                  :disable="editingUserid !== null"
                  :label="gettext('Username')"
                  :rules="[(value) => Boolean(value?.trim()) || '请输入用户名']"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.firstname"
                  :label="gettext('First Name')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  :dense="editingUserid === null"
                  v-model="form.realm"
                  :options="realmOptions"
                  :disable="editingUserid !== null"
                  :label="gettext('Realm')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.lastname"
                  :label="gettext('Last Name')"
                />
              </div>
              <template v-if="editingUserid === null && form.realm === 'pve'">
                <div class="col-12 col-sm-6">
                  <q-input
                    :dense="editingUserid === null"
                    v-model="form.password"
                    type="password"
                    :label="gettext('Password')"
                    :rules="[(value) => value.length >= 8 || '密码至少 8 位']"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    :dense="editingUserid === null"
                    v-model="form.confirmPassword"
                    type="password"
                    :label="gettext('Confirm Password')"
                    :rules="[(value) => value === form.password || '两次密码不一致']"
                  />
                </div>
              </template>
              <div class="col-12 col-sm-6">
                <q-select
                  :dense="editingUserid === null"
                  v-model="form.groups"
                  :options="groupOptions"
                  clearable
                  :label="gettext('Group')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.email"
                  type="email"
                  :label="gettext('Email')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.expire"
                  :label="gettext('Expire')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.comment"
                  :label="gettext('Comment')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :dense="editingUserid === null"
                  v-model="form.keys"
                  :label="gettext('Key IDs')"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-checkbox
                  :dense="editingUserid === null"
                  v-model="form.enable"
                  :label="gettext('Enable')"
                />
              </div>
            </div>
          </q-form>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="gettext('Cancel')"
          />
          <q-btn
            color="primary"
            :label="gettext(editingUserid === null ? 'Add' : 'Edit')"
            @click="saveRecord"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <DemoPasswordDialog
      v-model="passwordDialogVisible"
      :userid="selectedUser?.userid || ''"
    />
  </q-page>
</template>
<style scoped>
.standard-styles-page {
  padding: 14px;
}
.standard-styles-page__header {
  min-height: 50px;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  background: #edf1f6;
}
.standard-styles-page__header > div {
  position: relative;
  padding-left: 22px;
}
.standard-styles-page__header > div::before {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 4px;
  border-radius: 2px;
  background: #1976d2;
  content: '';
}
.standard-styles-page__header h1,
.standard-styles-page__header p {
  margin: 0;
}
.standard-styles-page__header h1 {
  color: #1b2e4a;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}
.standard-styles-page__header p {
  margin-top: 2px;
  color: #788ba4;
  font-size: 13px;
}
.standard-styles-table__toolbar {
  min-height: 48px;
  padding: 12px 16px;
  flex-wrap: wrap;
}
.standard-styles-table__toolbar > .q-ml-md {
  margin-left: auto !important;
}
.standard-styles-table__search {
  width: 260px;
}
.standard-styles-table__search-wrap {
  display: flex;
  align-items: center;
}
.standard-style-dialog {
  width: 500px;
  max-width: 92vw;
  border-radius: 4px !important;
}
@media (max-width: 599px) {
  .standard-styles-page {
    padding: 16px;
  }

  .standard-styles-table__toolbar {
    height: auto;
    min-height: 0;
    padding: 12px 0 !important;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .standard-styles-table__search-wrap {
    width: 100%;
  }
  .standard-styles-table__search {
    width: 100%;
  }

  .standard-styles-table__toolbar > .q-ml-md {
    margin-top: 12px;
    margin-left: auto !important;
  }
}
</style>
