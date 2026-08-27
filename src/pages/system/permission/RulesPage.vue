<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import {
  getAccessRules,
  getEnabledAccessUsers,
  getClusterResources,
  updateAccessRule,
  type AccessRule,
} from '@/api/system';
import { getApiTokens, getRoles, type PveRecord, type PveRole } from '@/api/resources';
import { getGroups, type PveGroup, type PveUser } from '@/api/users';
import UWindow from '@/components/UWindow.vue';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type RuleRow = AccessRule & { index: number; propagateText: string };
type AclType = 'user' | 'group' | 'apitoken';
const props = withDefaults(defineProps<{ resourcePath?: string; vnetAcl?: boolean }>(), {
  resourcePath: '',
  vnetAcl: false,
});

const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const rules = ref<RuleRow[]>([]);
const selectedRules = ref<RuleRow[]>([]);
const formVisible = ref(false);
const pathOptions = shallowRef<string[]>([]);
const filteredPathOptions = shallowRef<string[]>([]);
const userOptions = shallowRef<PveUser[]>([]);
const groupOptions = shallowRef<PveGroup[]>([]);
const tokenOptions = shallowRef<{ value: string; comment: string }[]>([]);
const filteredTokenOptions = shallowRef<{ value: string; comment: string }[]>([]);
const roleOptions = shallowRef<PveRole[]>([]);
const roleError = shallowRef('');
const pathRef = ref();
const tokenRef = ref();
const form = reactive({
  path: '',
  type: 'user',
  user: '',
  group: '',
  token: '',
  role: 'NoAccess',
  propagate: true,
  vlan: '',
});

const isFixedPath = computed(() => Boolean(props.resourcePath));
const isVnetAcl = computed(() => Boolean(props.vnetAcl && props.resourcePath));
const selectedRule = computed(() => selectedRules.value[0]);
const canRemove = computed(() => selectedRules.value.length === 1);
const roleRows = computed<PveRecord[]>(() => roleOptions.value.map((role) => ({ ...role })));
const selectedRoleLabel = computed(
  () => roleRows.value.find((role) => textValue(role.roleid) === form.role)?.roleid || form.role
);
const roleColumns: QTableColumn<PveRecord>[] = [
  { name: 'roleid', label: gettext('Role'), field: 'roleid', align: 'left', sortable: true },
  {
    name: 'privileges',
    label: gettext('Privileges'),
    field: (row) => formatPrivileges(textValue(row.privs)),
    align: 'left',
  },
];
const userRows = computed<PveRecord[]>(() => userOptions.value.map((user) => ({ ...user })));
const groupRows = computed<PveRecord[]>(() => groupOptions.value.map((group) => ({ ...group })));
const userColumns: QTableColumn<PveRecord>[] = [
  { name: 'userid', label: gettext('User'), field: 'userid', align: 'left', sortable: true },
  {
    name: 'name',
    label: gettext('Name'),
    field: (row) => [textValue(row.firstname), textValue(row.lastname)].filter(Boolean).join(' '),
    align: 'left',
  },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const groupColumns: QTableColumn<PveRecord>[] = [
  { name: 'groupid', label: gettext('Group'), field: 'groupid', align: 'left', sortable: true },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
  { name: 'users', label: gettext('Users'), field: 'users', align: 'left' },
];
const filteredRules = computed(() => {
  const query = filter.value.trim().toLowerCase();
  return rules.value
    .filter((rule) => {
      if (!props.resourcePath) return true;
      if (!isVnetAcl.value) return props.resourcePath === rule.path;
      return (
        rule.path === props.resourcePath ||
        /^\/\d+$/.test(rule.path.slice(props.resourcePath.length))
      );
    })
    .filter(
      (rule) =>
        !query ||
        [rule.path, rule.ugid, rule.roleid, rule.type].join(' ').toLowerCase().includes(query)
    );
});
const formTitle = computed(() => {
  if (form.type === 'group') return `${gettext('Add')}: ${gettext('Group Permission')}`;
  if (form.type === 'apitoken') return `${gettext('Add')}: ${gettext('API Token Permission')}`;
  return `${gettext('Add')}: ${gettext('User Permission')}`;
});
function requiredLabel(label: string) {
  return `${label} *`;
}
function requiredFieldRule(value: string | null | undefined) {
  return value ? true : gettext('This field is required');
}
const columns = computed<QTableColumn<RuleRow>[]>(() => {
  const aclColumns: QTableColumn<RuleRow>[] = [
    {
      name: 'ugid',
      label: `${gettext('User')}/${gettext('Group')}/${gettext('API Token')}`,
      field: (row) => formatAclSubject(row),
      align: 'left',
      sortable: true,
    },
    { name: 'roleid', label: gettext('Role'), field: 'roleid', align: 'left', sortable: true },
  ];

  if (!isFixedPath.value) {
    aclColumns.unshift({
      name: 'path',
      label: gettext('Path'),
      field: 'path',
      align: 'left',
      sortable: true,
    });
    aclColumns.push({
      name: 'propagate',
      label: gettext('Propagate'),
      field: 'propagateText',
      align: 'left',
      sortable: true,
    });
  }
  if (isVnetAcl.value) {
    aclColumns.push({
      name: 'vlan',
      label: 'VLAN',
      field: (row) => ruleVlan(row),
      align: 'left',
      sortable: true,
    });
  }

  return aclColumns;
});

function rowClick(_: Event, row: RuleRow) {
  selectedRules.value = selectedRule.value === row ? [] : [row];
}
function formatAclSubject(rule: AccessRule) {
  return rule.type === 'group' ? `@${rule.ugid}` : rule.ugid;
}
function ruleVlan(rule: AccessRule) {
  const suffix = rule.path.slice(props.resourcePath.length);
  return /^\/\d+$/.test(suffix) ? suffix.slice(1) : gettext('All');
}
function resetForm(type: AclType = 'user') {
  roleError.value = '';
  Object.assign(form, {
    path: props.resourcePath,
    type,
    user: '',
    group: '',
    token: '',
    role: 'NoAccess',
    propagate: true,
    vlan: '',
  });
}
function resourcePaths(resources: PveRecord[]) {
  const paths = new Set([
    '/',
    '/access',
    '/access/groups',
    '/access/realm',
    '/mapping',
    '/mapping/cpu',
    '/mapping/hwrng',
    '/mapping/notifications',
    '/mapping/pci',
    '/mapping/usb',
    '/nodes',
    '/pool',
    '/sdn/fabrics',
    '/sdn/zones',
    '/storage',
    '/vms',
  ]);
  resources.forEach((item) => {
    if (item.type === 'node') paths.add(`/nodes/${String(item.node)}`);
    if (item.type === 'qemu' || item.type === 'lxc') paths.add(`/vms/${String(item.vmid)}`);
    if (item.type === 'storage') paths.add(`/storage/${String(item.storage)}`);
    if (item.type === 'pool') paths.add(`/pool/${String(item.pool)}`);
    if (item.type === 'network') {
      const networkType = textValue(item['network-type']);
      const network = textValue(item.network);
      if (networkType && network) paths.add(`/sdn/${networkType}s/${network}`);
    }
    if (item.type === 'sdn' && item.sdn) paths.add(`/sdn/zones/${textValue(item.sdn)}`);
  });
  return [...paths].sort();
}
type SelectFilterDone = (callback: () => void) => void;
function filterOptions<T>(
  value: string,
  done: SelectFilterDone,
  source: T[],
  update: (options: T[]) => void,
  searchableText: (option: T) => string
) {
  const keyword = value.trim().toLowerCase();
  done(() =>
    update(
      keyword
        ? source.filter((option) => searchableText(option).toLowerCase().includes(keyword))
        : source
    )
  );
}
function filterPaths(value: string, done: SelectFilterDone) {
  filterOptions(
    value,
    done,
    pathOptions.value,
    (options) => (filteredPathOptions.value = options),
    (option) => option
  );
}
function filterTokens(value: string, done: SelectFilterDone) {
  filterOptions(
    value,
    done,
    tokenOptions.value,
    (options) => (filteredTokenOptions.value = options),
    (option) => [option.value, option.comment].join(' ')
  );
}
function addPath(
  value: string,
  done: (value?: string, mode?: 'add' | 'add-unique' | 'toggle') => void
) {
  const path = value.trim();
  done(path || undefined, 'add-unique');
}
function formatPrivileges(privileges?: string) {
  return (privileges || '')
    .split(',')
    .map((privilege) => privilege.trim())
    .filter(Boolean)
    .join(', ');
}
async function reload() {
  loading.value = true;
  try {
    const response = await getAccessRules();
    rules.value = (response.data || [])
      .map((rule, index) => ({
        ...rule,
        index,
        propagateText: rule.propagate ? gettext('Yes') : gettext('No'),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
    selectedRules.value = [];
  } finally {
    loading.value = false;
  }
}
async function openForm(type: AclType = 'user') {
  resetForm(type);
  formVisible.value = true;
  dialogLoading.value = true;
  try {
    const resourceRequest = isFixedPath.value
      ? Promise.resolve({ data: [] as PveRecord[] })
      : getClusterResources();
    const [resources, roles] = await Promise.all([resourceRequest, getRoles()]);
    pathOptions.value = props.resourcePath
      ? [props.resourcePath]
      : resourcePaths((resources.data || []) as PveRecord[]);
    filteredPathOptions.value = pathOptions.value;
    roleOptions.value = ([...(roles.data || [])] as PveRole[]).sort((a, b) =>
      a.roleid.localeCompare(b.roleid)
    );
    if (type === 'group') {
      const groups = await getGroups();
      groupOptions.value = ([...(groups.data || [])] as PveGroup[]).sort((a, b) =>
        a.groupid.localeCompare(b.groupid)
      );
    } else if (type === 'user') {
      const users = await getEnabledAccessUsers();
      userOptions.value = ([...(users.data || [])] as PveUser[]).sort((a, b) =>
        a.userid.localeCompare(b.userid)
      );
    } else {
      const tokens = await getApiTokens();
      tokenOptions.value = (tokens.data || [])
        .flatMap((user: PveRecord) =>
          Array.isArray(user.tokens)
            ? (user.tokens as PveRecord[]).map((token: PveRecord) => ({
                value: `${String(user.userid)}!${String(token.tokenid)}`,
                comment: textValue(token.comment),
              }))
            : []
        )
        .sort((a, b) => a.value.localeCompare(b.value));
      filteredTokenOptions.value = tokenOptions.value;
    }
  } finally {
    dialogLoading.value = false;
  }
}
async function saveRule() {
  if (
    dialogLoading.value ||
    (!isFixedPath.value && pathRef.value?.validate?.() === false) ||
    tokenRef.value?.validate?.() === false ||
    (form.type === 'user' && !form.user) ||
    (form.type === 'group' && !form.group)
  ) {
    return;
  }
  if (!form.role) {
    roleError.value = gettext('This field is required');
    return;
  }
  dialogLoading.value = true;
  try {
    const data: Record<string, unknown> = {
      path: isVnetAcl.value && form.vlan ? `${form.path}/${form.vlan}` : form.path,
      roles: form.role,
    };
    if (!isFixedPath.value) data.propagate = form.propagate ? 1 : 0;
    if (form.type === 'user') data.users = form.user;
    else if (form.type === 'group') data.groups = form.group;
    else data.tokens = form.token;
    await updateAccessRule(data);
    Notify.create({ type: 'positive', message: gettext('Permission rule saved successfully') });
    formVisible.value = false;
    await reload();
  } finally {
    dialogLoading.value = false;
  }
}
function removeRule() {
  const rule = selectedRule.value;
  if (!rule) return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure you want to remove this?'),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      const data: Record<string, unknown> = { delete: 1, path: rule.path, roles: rule.roleid };
      if (rule.type === 'user') data.users = rule.ugid;
      else if (rule.type === 'group') data.groups = rule.ugid;
      else data.tokens = rule.ugid;
      await updateAccessRule(data);
      await reload();
    })();
  });
}
watch(
  () => form.type,
  () => {
    form.user = '';
    form.group = '';
    form.token = '';
  }
);
watch(
  () => props.resourcePath,
  () => void reload()
);
onMounted(() => void reload());
defineExpose({ reload });
</script>

<template>
  <div class="row column">
    <q-table
      flat
      :rows="filteredRules"
      :columns="columns"
      row-key="index"
      selection="single"
      v-model:selected="selectedRules"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
      table-header-class="u-table-header"
      :no-data-label="gettext('no record can be found')"
      @row-click="rowClick"
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
                v-close-popup
                clickable
                @click="openForm('group')"
              >
                <q-item-section>{{ gettext('Group Permission') }}</q-item-section>
              </q-item>
              <q-item
                v-close-popup
                clickable
                @click="openForm('user')"
              >
                <q-item-section>{{ gettext('User Permission') }}</q-item-section>
              </q-item>
              <q-item
                v-close-popup
                clickable
                @click="openForm('apitoken')"
              >
                <q-item-section>{{ gettext('API Token Permission') }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canRemove ? 'red' : 'grey'"
            class="u-button"
            :disable="!canRemove"
            :label="gettext('Remove')"
            @click="removeRule"
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
      <template #body-cell-propagate="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.propagate ? 'green' : 'red'"
            :label="props.row.propagateText"
          />
        </q-td>
      </template>
    </q-table>
  </div>
  <q-dialog
    v-model="formVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="formTitle"
      width="400px"
      :loading="dialogLoading"
    >
      <div class="u-border q-ma-sm q-pa-md u-dense permission-rule-form">
        <q-select
          v-if="!isFixedPath"
          ref="pathRef"
          v-model="form.path"
          dense
          options-dense
          :label="requiredLabel(gettext('Path'))"
          :rules="[requiredFieldRule]"
          class="q-field--with-bottom"
          use-input
          input-debounce="0"
          new-value-mode="add-unique"
          @filter="filterPaths"
          @new-value="addPath"
          :options="filteredPathOptions"
        />
        <SelectTable
          v-if="form.type === 'group'"
          v-model="form.group"
          :label="requiredLabel(gettext('Group'))"
          class="q-field--with-bottom"
          row-key="groupid"
          field-style="standard"
          :rows="groupRows"
          :columns="groupColumns"
          :display-value="form.group"
          :get-row-value="(row) => textValue(row.groupid)"
        />
        <SelectTable
          v-if="form.type === 'user'"
          v-model="form.user"
          :label="requiredLabel(gettext('User'))"
          class="q-field--with-bottom"
          row-key="userid"
          field-style="standard"
          :rows="userRows"
          :columns="userColumns"
          :display-value="form.user"
          :get-row-value="(row) => textValue(row.userid)"
        />
        <q-select
          v-if="form.type === 'apitoken'"
          ref="tokenRef"
          v-model="form.token"
          dense
          options-dense
          emit-value
          map-options
          option-value="value"
          option-label="value"
          :label="requiredLabel(gettext('API Token'))"
          use-input
          input-debounce="0"
          @filter="filterTokens"
          :options="filteredTokenOptions"
          :rules="[requiredFieldRule]"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.value }}</q-item-label>
                <q-item-label caption>{{ scope.opt.comment }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <SelectTable
          v-model="form.role"
          class="q-field--with-bottom"
          row-key="roleid"
          field-style="standard"
          width="560px"
          :rows="roleRows"
          :columns="roleColumns"
          :display-value="selectedRoleLabel"
          :label="requiredLabel(gettext('Role'))"
          show-error
          :error="Boolean(roleError)"
          :error-message="roleError"
          :get-row-value="(row) => textValue(row.roleid)"
          @update:model-value="roleError = ''"
        />
        <q-input
          v-if="isVnetAcl"
          v-model="form.vlan"
          dense
          type="number"
          min="1"
          max="4096"
          class="q-field--with-bottom"
          label="VLAN"
          :placeholder="gettext('All')"
        />
        <q-checkbox
          v-if="!isFixedPath"
          v-model="form.propagate"
          left-label
          color="primary"
          :label="gettext('Propagate')"
        />
      </div>
      <template #foot>
        <q-btn
          no-caps
          flat
          size="12px"
          :disable="dialogLoading"
          :class="
            !dialogLoading ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'
          "
          :label="gettext('Add')"
          @click="saveRule"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.permission-rule-form :deep(.q-field__native),
.permission-rule-form :deep(.q-field__input) {
  color: #666;
  font-size: 12px;
}
.permission-rule-form :deep(.q-field__label) {
  color: #333;
  font-size: 12px;
}
</style>
