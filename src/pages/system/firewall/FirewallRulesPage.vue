<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallRuleByBaseUrl,
  deleteFirewallRuleByBaseUrl,
  getFirewallGroups,
  getFirewallMacros,
  getFirewallRefs,
  getFirewallRuleByBaseUrl,
  getFirewallRulesByBaseUrl,
  moveFirewallRuleByBaseUrl,
  updateFirewallRuleByBaseUrl,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type FirewallType = 'dc' | 'node' | 'vm' | 'vnet' | 'group';
type EditMode = 'add' | 'copy' | 'edit' | 'group';
type RuleForm = Record<string, string | number | undefined>;

const {
  baseUrl = '/cluster/firewall/rules',
  firewallType = 'dc',
  listRefsUrl = '/cluster/firewall/refs',
  allowIface = false,
  allowGroups = true,
} = defineProps<{
  baseUrl?: string;
  firewallType?: FirewallType;
  listRefsUrl?: string;
  allowIface?: boolean;
  allowGroups?: boolean;
}>();

const directions: Record<FirewallType, string[]> = {
  dc: ['in', 'out', 'forward'],
  node: ['in', 'out', 'forward'],
  group: ['in', 'out', 'forward'],
  vm: ['in', 'out'],
  vnet: ['forward'],
};
const logLevels = ['nolog', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
const protocols = [
  'tcp',
  'udp',
  'icmp',
  'icmpv6',
  'ipv6-icmp',
  'igmp',
  'gre',
  'esp',
  'ah',
  'ospf',
  'sctp',
  'vrrp',
];
const icmpV4Types = [
  'any',
  'echo-reply',
  'destination-unreachable',
  'network-unreachable',
  'host-unreachable',
  'protocol-unreachable',
  'port-unreachable',
  'fragmentation-needed',
  'source-route-failed',
  'network-unknown',
  'host-unknown',
  'network-prohibited',
  'host-prohibited',
  'TOS-network-unreachable',
  'TOS-host-unreachable',
  'communication-prohibited',
  'host-precedence-violation',
  'precedence-cutoff',
  'source-quench',
  'redirect',
  'network-redirect',
  'host-redirect',
  'TOS-network-redirect',
  'TOS-host-redirect',
  'echo-request',
  'router-advertisement',
  'router-solicitation',
  'time-exceeded',
  'ttl-zero-during-transit',
  'ttl-zero-during-reassembly',
  'parameter-problem',
  'ip-header-bad',
  'required-option-missing',
  'timestamp-request',
  'timestamp-reply',
  'address-mask-request',
  'address-mask-reply',
];
const icmpV6Types = [
  'destination-unreachable',
  'no-route',
  'communication-prohibited',
  'beyond-scope',
  'address-unreachable',
  'port-unreachable',
  'failed-policy',
  'reject-route',
  'packet-too-big',
  'time-exceeded',
  'ttl-zero-during-transit',
  'ttl-zero-during-reassembly',
  'parameter-problem',
  'bad-header',
  'unknown-header-type',
  'unknown-option',
  'echo-request',
  'echo-reply',
  'router-solicitation',
  'router-advertisement',
  'neighbour-solicitation',
  'neighbour-advertisement',
  'redirect',
];

const loading = shallowRef(false);
const dialog = shallowRef(false);
const mode = shallowRef<EditMode>('add');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const macros = shallowRef<PveRecord[]>([]);
const refs = shallowRef<PveRecord[]>([]);
const groups = shallowRef<PveRecord[]>([]);
const form = ref<RuleForm>({});
const draggedPos = shallowRef<string | number | undefined>();

const selectedRule = computed(() => selected.value[0]);
const allowedDirections = computed(() => directions[firewallType]);
const allowedActions = computed(() =>
  form.value.type === 'forward' ? ['ACCEPT', 'DROP'] : ['ACCEPT', 'REJECT', 'DROP']
);
const isGroupEditor = computed(
  () => mode.value === 'group' || (mode.value === 'edit' && selectedRule.value?.type === 'group')
);
const hasMacro = computed(() => Boolean(form.value.macro));
const isIcmp = computed(() => ['icmp', 'icmpv6', 'ipv6-icmp'].includes(String(form.value.proto)));
const isIcmpV4 = computed(() => form.value.proto === 'icmp');
const macroOptions = computed(() =>
  macros.value.map((item) => ({
    label: `${textValue(item.macro)}${item.descr ? ` — ${textValue(item.descr)}` : ''}`,
    value: textValue(item.macro),
  }))
);
const refOptions = computed(() =>
  refs.value.map((item) => {
    const type = textValue(item.type);
    const name = textValue(item.name);
    const scope = textValue(item.scope);
    const value =
      type === 'alias'
        ? `${scope}/${name}`
        : type === 'ipset'
          ? `+${scope}/${name}`
          : textValue(item.ref);
    return {
      label: `${textValue(item.ref)}${item.comment ? ` — ${textValue(item.comment)}` : ''}`,
      value,
    };
  })
);

const columns = computed<QTableColumn<PveRecord>[]>(() => {
  const result: QTableColumn<PveRecord>[] = [
    { name: 'pos', label: '', align: 'left', field: (row) => row.pos, sortable: false },
    {
      name: 'enable',
      label: gettext('On'),
      align: 'left',
      field: (row) => Boolean(row.enable),
      sortable: false,
    },
    {
      name: 'type',
      label: gettext('Type'),
      align: 'left',
      field: (row) => row.type || '-',
      sortable: false,
    },
    {
      name: 'action',
      label: gettext('Action'),
      align: 'left',
      field: (row) => row.action || '-',
      sortable: false,
    },
    {
      name: 'macro',
      label: gettext('Macro'),
      align: 'left',
      field: (row) => row.macro || '-',
      sortable: false,
    },
  ];
  if (allowIface)
    result.push({
      name: 'iface',
      label: gettext('Interface'),
      align: 'left',
      field: (row) => row.iface || '-',
      sortable: false,
    });
  result.push(
    {
      name: 'proto',
      label: gettext('Protocol'),
      align: 'left',
      field: (row) => row.proto || '-',
      sortable: false,
    },
    {
      name: 'source',
      label: gettext('Source'),
      align: 'left',
      field: (row) => row.source || '-',
      sortable: false,
    },
    {
      name: 'sport',
      label: gettext('S.Port'),
      align: 'left',
      field: (row) => row.sport || '-',
      sortable: false,
    },
    {
      name: 'dest',
      label: gettext('Destination'),
      align: 'left',
      field: (row) => row.dest || '-',
      sortable: false,
    },
    {
      name: 'dport',
      label: gettext('D.Port'),
      align: 'left',
      field: (row) => row.dport || '-',
      sortable: false,
    },
    {
      name: 'log',
      label: gettext('Log level'),
      align: 'left',
      field: (row) => row.log || '-',
      sortable: false,
    },
    {
      name: 'comment',
      label: gettext('Comment'),
      align: 'left',
      field: (row) => row.comment || '-',
      sortable: false,
    }
  );
  return result;
});

function ruleForm(row?: PveRecord): RuleForm {
  if (!row)
    return {
      enable: 0,
      type: allowedDirections.value[0],
      action: 'ACCEPT',
      macro: '',
      source: '',
      dest: '',
      proto: '',
      sport: '',
      dport: '',
      log: 'nolog',
      comment: '',
    };
  const result = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value == null ? '' : textValue(value)])
  ) as RuleForm;
  result.enable = Number(row.enable) ? 1 : 0;
  return result;
}

async function refreshData() {
  loading.value = true;
  try {
    rows.value = (await getFirewallRulesByBaseUrl(baseUrl)).data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadSelectors() {
  const [macroResponse, refResponse] = await Promise.all([
    getFirewallMacros(),
    getFirewallRefs(listRefsUrl),
  ]);
  macros.value = macroResponse.data || [];
  refs.value = refResponse.data || [];
}

async function openDialog(nextMode: EditMode) {
  mode.value = nextMode;
  const editingGroup = nextMode === 'edit' && selectedRule.value?.type === 'group';
  const detail =
    nextMode === 'edit' && selectedRule.value
      ? (await getFirewallRuleByBaseUrl(baseUrl, textValue(selectedRule.value.pos))).data
      : selectedRule.value;
  form.value =
    nextMode === 'group'
      ? { type: 'group', action: '', enable: 0, comment: '' }
      : ruleForm(nextMode === 'add' ? undefined : detail);
  if (nextMode === 'copy') {
    delete form.value.pos;
    delete form.value.digest;
    delete form.value.errors;
  }
  if (nextMode === 'group' || editingGroup) groups.value = (await getFirewallGroups()).data || [];
  dialog.value = true;
}

function onDirectionChange(value: string) {
  form.value.type = value;
  if (!allowedActions.value.includes(String(form.value.action)))
    form.value.action = allowedActions.value[0];
}
function onMacroChange(value: string) {
  form.value.macro = value;
  if (value) {
    form.value.proto = '';
    form.value.sport = '';
    form.value.dport = '';
    form.value['icmp-type'] = '';
  }
}
function onProtocolChange(value: string) {
  form.value.proto = value;
  if (!['icmp', 'icmpv6', 'ipv6-icmp'].includes(value)) form.value['icmp-type'] = '';
  if (['icmp', 'icmpv6', 'ipv6-icmp'].includes(value)) form.value.dport = '';
}
function acceptNewValue(value: string, done: (value?: string) => void) {
  done(value);
}
function ipRefLengthRule(value: unknown) {
  return String(value || '').length <= 512 || gettext('Too long, consider using IP sets.');
}
function cellError(row: PveRecord, field: string) {
  return textValue((row.errors as PveRecord | undefined)?.[field]);
}

function payload() {
  const value = { ...form.value } as PveRecord;
  if (isGroupEditor.value) {
    const result: PveRecord = {
      type: 'group',
      action: value.action,
      enable: value.enable,
      comment: value.comment,
    };
    if (allowIface) result.iface = value.iface ?? '';
    if (value.digest) result.digest = value.digest;
    return result;
  }
  if (!allowIface) delete value.iface;
  if (hasMacro.value) {
    value.proto = '';
    value.sport = '';
    value.dport = '';
    value['icmp-type'] = '';
  }
  if (!isIcmp.value) delete value['icmp-type'];
  if (isIcmp.value) value.dport = '';
  for (const field of ['source', 'dest', 'macro', 'proto', 'sport', 'dport', 'icmp-type', 'log']) {
    if (value[field] == null) value[field] = '';
  }
  delete value.pos;
  delete value.errors;
  return value;
}

async function submitForm() {
  loading.value = true;
  try {
    if (mode.value === 'edit')
      await updateFirewallRuleByBaseUrl(baseUrl, textValue(selectedRule.value?.pos), payload());
    else await createFirewallRuleByBaseUrl(baseUrl, payload());
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}

async function setEnabled(row: PveRecord, enable: boolean) {
  loading.value = true;
  try {
    await updateFirewallRuleByBaseUrl(baseUrl, textValue(row.pos), {
      enable: enable ? 1 : 0,
      digest: row.digest,
    });
    await refreshData();
  } finally {
    loading.value = false;
  }
}

function removeSelected() {
  const row = selectedRule.value;
  if (!row) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', textValue(row.pos)),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteFirewallRuleByBaseUrl(baseUrl, textValue(row.pos), row.digest)
      .then(refreshData)
      .finally(() => {
        loading.value = false;
      });
  });
}

function dragStart(pos: string | number) {
  draggedPos.value = pos;
}
async function dropRule(target: PveRecord, event: DragEvent) {
  if (draggedPos.value === undefined || draggedPos.value === target.pos) return;
  loading.value = true;
  try {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const targetPos = Number(target.pos);
    const moveto = event.clientY > rect.top + rect.height / 2 ? targetPos + 1 : targetPos;
    await moveFirewallRuleByBaseUrl(baseUrl, draggedPos.value, moveto);
    await refreshData();
  } finally {
    loading.value = false;
    draggedPos.value = undefined;
  }
}

onMounted(() => {
  void refreshData();
  void loadSelectors();
});
watch(
  () => baseUrl,
  () => {
    void refreshData();
  }
);
watch(
  () => listRefsUrl,
  () => {
    void loadSelectors();
  }
);
</script>

<template>
  <div>
    <q-table
      flat
      row-key="pos"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :loading="loading"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('No firewall rule configured here.')"
      @update:selected="selected = [...$event]"
    >
      <template #top>
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="openDialog('add')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selectedRule && selectedRule.type !== 'group' ? 'primary' : 'grey'"
            :disable="!selectedRule || selectedRule.type === 'group'"
            :label="gettext('Copy')"
            @click="openDialog('copy')"
          />
          <q-btn
            v-if="allowGroups"
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="`${gettext('Insert')}: ${gettext('Security Group')}`"
            @click="openDialog('group')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selectedRule ? 'primary' : 'grey'"
            :disable="!selectedRule"
            :label="gettext('Edit')"
            @click="openDialog('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selectedRule ? 'red' : 'grey'"
            :disable="!selectedRule"
            :label="gettext('Remove')"
            @click="removeSelected"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="refreshData"
          />
        </div>
      </template>
      <template #body="scope">
        <q-tr
          :props="scope"
          draggable="true"
          class="firewall-rule-row"
          @dragstart="dragStart(scope.row.pos)"
          @dragover.prevent
          @drop.prevent="dropRule(scope.row, $event)"
          @dblclick="
            selected = [scope.row];
            openDialog('edit');
          "
        >
          <q-td
            key="pos"
            :props="scope"
          >
            <q-icon
              name="drag_indicator"
              class="cursor-move"
            />
            {{ scope.row.pos }}
          </q-td>
          <q-td
            key="enable"
            :props="scope"
          >
            <q-checkbox
              dense
              :model-value="Boolean(scope.row.enable)"
              @update:model-value="setEnabled(scope.row, Boolean($event))"
            />
          </q-td>
          <q-td
            v-for="column in columns.slice(2)"
            :key="column.name"
            :props="scope"
          >
            <span :class="{ 'text-negative': cellError(scope.row, String(column.name)) }">
              {{ scope.row[column.name] || '-' }}
            </span>
            <q-tooltip v-if="cellError(scope.row, String(column.name))">
              {{ cellError(scope.row, String(column.name)) }}
            </q-tooltip>
          </q-td>
        </q-tr>
      </template>
    </q-table>
    <q-dialog
      v-model="dialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="
          gettext(
            mode === 'edit' ? 'Edit Rule' : isGroupEditor ? 'Insert Security Group' : 'Add Rule'
          )
        "
        width="680px"
        :loading="loading"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <div class="row q-col-gutter-md u-hidden-error">
            <template v-if="isGroupEditor">
              <q-select
                v-model="form.action"
                class="col-12"
                options-dense
                emit-value
                map-options
                :label="gettext('Security Group')"
                :options="
                  groups.map((group) => ({
                    label: textValue(group.group),
                    value: textValue(group.group),
                  }))
                "
              />
              <q-input
                v-model="form.comment"
                class="col-12"
                :label="gettext('Comment')"
              />
              <q-input
                v-if="allowIface"
                v-model="form.iface"
                class="col-12"
                :label="gettext('Interface')"
              />
            </template>
            <template v-else>
              <q-select
                v-model="form.type"
                class="col-6"
                options-dense
                emit-value
                map-options
                :label="gettext('Direction')"
                :options="allowedDirections.map((value) => ({ label: value, value }))"
                @update:model-value="onDirectionChange"
              />
              <q-select
                v-model="form.action"
                class="col-6"
                options-dense
                :label="gettext('Action')"
                :options="allowedActions"
              />
              <q-select
                v-model="form.macro"
                class="col-6"
                options-dense
                clearable
                emit-value
                map-options
                use-input
                input-debounce="0"
                :label="gettext('Macro')"
                :options="macroOptions"
                @new-value="acceptNewValue"
                @update:model-value="onMacroChange"
              />
              <q-select
                v-model="form.proto"
                class="col-6"
                options-dense
                clearable
                use-input
                input-debounce="0"
                :disable="hasMacro"
                :label="gettext('Protocol')"
                :options="protocols"
                @new-value="acceptNewValue"
                @update:model-value="onProtocolChange"
              />
              <q-select
                v-model="form.source"
                class="col-6"
                options-dense
                clearable
                use-input
                input-debounce="0"
                emit-value
                map-options
                :label="gettext('Source')"
                :options="refOptions"
                :rules="[ipRefLengthRule]"
                @new-value="acceptNewValue"
              />
              <q-select
                v-model="form.dest"
                class="col-6"
                options-dense
                clearable
                use-input
                input-debounce="0"
                emit-value
                map-options
                :label="gettext('Destination')"
                :options="refOptions"
                :rules="[ipRefLengthRule]"
                @new-value="acceptNewValue"
              />
              <q-input
                v-model="form.sport"
                class="col-4"
                :disable="hasMacro"
                :label="gettext('Source port')"
              />
              <q-input
                v-if="!isIcmp"
                v-model="form.dport"
                class="col-4"
                :disable="hasMacro"
                :label="gettext('Dest. port')"
              />
              <q-select
                v-if="isIcmp"
                v-model="form['icmp-type']"
                class="col-4"
                options-dense
                clearable
                :options="isIcmpV4 ? icmpV4Types : icmpV6Types"
                :label="gettext('ICMP type')"
              />
              <q-select
                v-model="form.log"
                class="col-4"
                options-dense
                :label="gettext('Log level')"
                :options="logLevels"
              />
              <q-input
                v-model="form.comment"
                class="col-12"
                :label="gettext('Comment')"
              />
              <div
                v-if="form.type === 'forward'"
                class="col-12 text-sm text-grey-7"
              >
                {{
                  gettext(
                    'Forward rules only take effect when the nftables firewall is activated in the host options'
                  )
                }}
              </div>
            </template>
            <q-checkbox
              v-model="form.enable"
              class="col-12"
              dense
              right-label
              color="primary"
              :true-value="1"
              :false-value="0"
              :label="gettext('Enable')"
            />
          </div>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="isGroupEditor && !form.action"
            :label="gettext('Save')"
            @click="submitForm"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
