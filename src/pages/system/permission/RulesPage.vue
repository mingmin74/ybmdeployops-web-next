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
const filteredUserOptions = shallowRef<PveUser[]>([]);
const groupOptions = shallowRef<PveGroup[]>([]);
const filteredGroupOptions = shallowRef<PveGroup[]>([]);
const tokenOptions = shallowRef<{ value: string; comment: string }[]>([]);
const filteredTokenOptions = shallowRef<{ value: string; comment: string }[]>([]);
const roleOptions = shallowRef<PveRole[]>([]);
const filteredRoleOptions = shallowRef<PveRole[]>([]);
const pathRef = ref();
const groupRef = ref();
const userRef = ref();
const tokenRef = ref();
const roleRef = ref();
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
function filterUsers(value: string, done: SelectFilterDone) {
  filterOptions(
    value,
    done,
    userOptions.value,
    (options) => (filteredUserOptions.value = options),
    (option) => [option.userid, option.firstname, option.lastname, option.comment].join(' ')
  );
}
function filterGroups(value: string, done: SelectFilterDone) {
  filterOptions(
    value,
    done,
    groupOptions.value,
    (options) => (filteredGroupOptions.value = options),
    (option) => [option.groupid, option.comment, option.users].join(' ')
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
function filterRoles(value: string, done: SelectFilterDone) {
  filterOptions(
    value,
    done,
    roleOptions.value,
    (options) => (filteredRoleOptions.value = options),
    (option) => [option.roleid, option.privs].join(' ')
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
    filteredRoleOptions.value = roleOptions.value;
    if (type === 'group') {
      const groups = await getGroups();
      groupOptions.value = ([...(groups.data || [])] as PveGroup[]).sort((a, b) =>
        a.groupid.localeCompare(b.groupid)
      );
      filteredGroupOptions.value = groupOptions.value;
    } else if (type === 'user') {
      const users = await getEnabledAccessUsers();
      userOptions.value = ([...(users.data || [])] as PveUser[]).sort((a, b) =>
        a.userid.localeCompare(b.userid)
      );
      filteredUserOptions.value = userOptions.value;
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
  const subjectRef =
    form.type === 'user' ? userRef.value : form.type === 'group' ? groupRef.value : tokenRef.value;
  if (
    dialogLoading.value ||
    (!isFixedPath.value && pathRef.value?.validate?.() === false) ||
    subjectRef?.validate?.() === false ||
    roleRef.value?.validate?.() === false
  ) {
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
        <q-select
          v-if="form.type === 'group'"
          ref="groupRef"
          v-model="form.group"
          dense
          options-dense
          emit-value
          map-options
          option-value="groupid"
          option-label="groupid"
          :label="requiredLabel(gettext('Group'))"
          use-input
          input-debounce="0"
          @filter="filterGroups"
          :options="filteredGroupOptions"
          :rules="[requiredFieldRule]"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.groupid }}</q-item-label>
                <q-item-label caption>{{ scope.opt.comment }}</q-item-label>
                <q-item-label
                  v-if="scope.opt.users"
                  caption
                >
                  {{ gettext('Users') }}: {{ scope.opt.users }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-select
          v-if="form.type === 'user'"
          ref="userRef"
          v-model="form.user"
          dense
          options-dense
          emit-value
          map-options
          option-value="userid"
          option-label="userid"
          :label="requiredLabel(gettext('User'))"
          use-input
          input-debounce="0"
          @filter="filterUsers"
          :options="filteredUserOptions"
          :rules="[requiredFieldRule]"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.userid }}</q-item-label>
                <q-item-label caption>
                  {{ [scope.opt.firstname, scope.opt.lastname].filter(Boolean).join(' ')
                  }}{{ scope.opt.comment ? ` · ${scope.opt.comment}` : '' }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
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
        <q-select
          ref="roleRef"
          v-model="form.role"
          dense
          options-dense
          emit-value
          map-options
          option-value="roleid"
          option-label="roleid"
          :label="requiredLabel(gettext('Role'))"
          use-input
          input-debounce="0"
          @filter="filterRoles"
          :options="filteredRoleOptions"
          :rules="[requiredFieldRule]"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.roleid }}</q-item-label>
                <q-item-label caption>{{ formatPrivileges(scope.opt.privs) }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
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
