<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  getAccessRules,
  getEnabledAccessUsers,
  getClusterResources,
  updateAccessRule,
  type AccessRule,
} from '@/api/system';
import { getApiTokens, getRoles, type PveRecord } from '@/api/resources';
import { getGroups } from '@/api/users';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

type RuleRow = AccessRule & { index: number; propagateText: string };
const props = withDefaults(defineProps<{ resourcePath?: string }>(), { resourcePath: '' });

const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const rules = ref<RuleRow[]>([]);
const selectedRules = ref<RuleRow[]>([]);
const formVisible = ref(false);
const pathOptions = ref<string[]>([]);
const userOptions = ref<{ userid: string }[]>([]);
const groupOptions = ref<{ groupid: string }[]>([]);
const tokenOptions = ref<string[]>([]);
const roleOptions = ref<{ roleid: string }[]>([]);
const form = reactive({
  path: '',
  type: 'user',
  user: '',
  group: '',
  token: '',
  role: 'NoAccess',
  propagate: true,
});

const selectedRule = computed(() => selectedRules.value[0]);
const canRemove = computed(() => selectedRules.value.length === 1);
const filteredRules = computed(() => {
  const query = filter.value.trim().toLowerCase();
  return rules.value
    .filter(
      (rule) =>
        !props.resourcePath ||
        props.resourcePath === rule.path ||
        props.resourcePath.startsWith(`${rule.path}/`),
    )
    .filter(
      (rule) =>
        !query ||
        [rule.path, rule.ugid, rule.roleid, rule.type].join(' ').toLowerCase().includes(query),
    );
});
const canSubmit = computed(() =>
  Boolean(
    form.path &&
    form.role &&
    (form.type === 'user' ? form.user : form.type === 'group' ? form.group : form.token),
  ),
);
const columns: QTableColumn<RuleRow>[] = [
  { name: 'path', label: gettext('Path'), field: 'path', align: 'left', sortable: true },
  {
    name: 'ugid',
    label: `${gettext('User')}/${gettext('Group')}`,
    field: 'ugid',
    align: 'left',
    sortable: true,
  },
  { name: 'roleid', label: gettext('Role'), field: 'roleid', align: 'left', sortable: true },
  {
    name: 'propagate',
    label: gettext('Propagate'),
    field: 'propagateText',
    align: 'left',
    sortable: true,
  },
];

function rowClick(_: Event, row: RuleRow) {
  selectedRules.value = selectedRule.value === row ? [] : [row];
}
function resetForm() {
  Object.assign(form, {
    path: props.resourcePath,
    type: 'user',
    user: '',
    group: '',
    token: '',
    role: 'NoAccess',
    propagate: true,
  });
}
function resourcePaths(resources: PveRecord[]) {
  const paths = new Set(['/', '/access', '/nodes', '/pool', '/storage', '/vms']);
  resources.forEach((item) => {
    if (item.type === 'node') paths.add(`/nodes/${String(item.node)}`);
    if (item.type === 'qemu' || item.type === 'lxc') paths.add(`/vms/${String(item.vmid)}`);
    if (item.type === 'storage') paths.add(`/storage/${String(item.storage)}`);
    if (item.type === 'pool') paths.add(`/pool/${String(item.pool)}`);
  });
  return [...paths].sort();
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
async function openForm() {
  resetForm();
  formVisible.value = true;
  dialogLoading.value = true;
  try {
    const [resources, roles, groups, users, tokens] = await Promise.all([
      getClusterResources(),
      getRoles(),
      getGroups(),
      getEnabledAccessUsers(),
      getApiTokens(),
    ]);
    pathOptions.value = props.resourcePath
      ? [props.resourcePath]
      : resourcePaths((resources.data || []) as PveRecord[]);
    roleOptions.value = ((roles.data || []) as { roleid: string }[]).sort(
      (a: { roleid: string }, b: { roleid: string }) => a.roleid.localeCompare(b.roleid),
    );
    groupOptions.value = ((groups.data || []) as { groupid: string }[]).sort(
      (a: { groupid: string }, b: { groupid: string }) => a.groupid.localeCompare(b.groupid),
    );
    userOptions.value = ((users.data || []) as { userid: string }[])
      .filter((item: { userid: string }) => item.userid !== 'root@pam')
      .sort((a: { userid: string }, b: { userid: string }) => a.userid.localeCompare(b.userid));
    tokenOptions.value = (tokens.data || []).flatMap((user: PveRecord) =>
      Array.isArray(user.tokens)
        ? (user.tokens as PveRecord[]).map(
            (token: PveRecord) => `${String(user.userid)}!${String(token.tokenid)}`,
          )
        : [],
    );
  } finally {
    dialogLoading.value = false;
  }
}
async function saveRule() {
  if (!canSubmit.value) return;
  dialogLoading.value = true;
  try {
    const data: Record<string, unknown> = {
      path: form.path,
      roles: form.role,
      propagate: form.propagate ? 1 : 0,
    };
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
  },
);
onMounted(() => void reload());
</script>

<template>
  <div class="row column q-px-md q-py-sm">
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
      <template #top
        ><div class="q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="openForm"
          /><q-btn
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
        <q-space /><q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
          ><template #append><q-icon name="search" /></template></q-input
      ></template>
      <template #body-cell-propagate="props"
        ><q-td :props="props"
          ><q-badge
            :color="props.row.propagate ? 'green' : 'red'"
            :label="props.row.propagateText" /></q-td
      ></template>
    </q-table>
  </div>
  <q-dialog v-model="formVisible" persistent transition-show="scale" transition-hide="scale"
    ><UWindow
      :title="`${gettext('Add')}: ${gettext('Permission Rule')}`"
      width="400px"
      :loading="dialogLoading"
      ><div class="u-border q-ma-sm q-pa-md u-dense permission-rule-form">
        <q-select
          v-model="form.path"
          dense
          options-dense
          :label="gettext('Path')"
          :options="pathOptions"
          class="q-field--with-bottom"
        /><q-select
          v-model="form.type"
          dense
          options-dense
          emit-value
          map-options
          :label="gettext('Type')"
          :options="[
            { label: gettext('User'), value: 'user' },
            { label: gettext('Group'), value: 'group' },
            { label: gettext('API Token'), value: 'apitoken' },
          ]"
          class="q-field--with-bottom"
        /><q-select
          v-if="form.type === 'group'"
          v-model="form.group"
          dense
          options-dense
          emit-value
          map-options
          option-value="groupid"
          option-label="groupid"
          :label="gettext('Group')"
          :options="groupOptions"
        /><q-select
          v-if="form.type === 'user'"
          v-model="form.user"
          dense
          options-dense
          emit-value
          map-options
          option-value="userid"
          option-label="userid"
          :label="gettext('User')"
          :options="userOptions"
        /><q-select
          v-if="form.type === 'apitoken'"
          v-model="form.token"
          dense
          options-dense
          emit-value
          map-options
          :label="gettext('API Token')"
          :options="tokenOptions"
        /><q-select
          v-model="form.role"
          dense
          options-dense
          emit-value
          map-options
          option-value="roleid"
          option-label="roleid"
          :label="gettext('Role')"
          :options="roleOptions"
        /><q-checkbox
          v-model="form.propagate"
          left-label
          color="primary"
          :label="gettext('Propagate')"
        />
      </div>
      <template #foot
        ><q-btn
          no-caps
          flat
          size="12px"
          :disable="!canSubmit || dialogLoading"
          :class="
            canSubmit && !dialogLoading
              ? 'bg-primary text-grey-1 u-button'
              : 'bg-grey-4 text-grey-6 u-button'
          "
          :label="gettext('Add')"
          @click="saveRule" /></template></UWindow
  ></q-dialog>
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
