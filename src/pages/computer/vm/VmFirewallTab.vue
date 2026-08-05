<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog, date as quasarDate } from 'quasar';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  createVmFirewallRule,
  deleteVmFirewallRule,
  getFirewallGroups,
  getVmFirewallLogs,
  getVmFirewallOptions,
  getVmFirewallRules,
  updateVmFirewallOptions,
  updateVmFirewallRule,
} from '@/api/firewall';
import UWindow from '@/components/UWindow.vue';
import VmFirewallAliasesTab from './VmFirewallAliasesTab.vue';
import VmFirewallIpsetTab from './VmFirewallIpsetTab.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

const props = withDefaults(
  defineProps<{ node: string; vmid: string; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' },
);
const session = useSessionStore();
const loading = shallowRef(false);
const section = shallowRef<'rules' | 'options' | 'aliases' | 'ipset' | 'log'>('rules');
const rows = shallowRef<PveRecord[]>([]);
const options = shallowRef<PveRecord>({});
const selected = shallowRef<PveRecord[]>([]);
const logs = shallowRef<Array<PveRecord | string>>([]);
const logLoading = shallowRef(false);
const logLiveMode = shallowRef(true);
const logSince = shallowRef('');
const logUntil = shallowRef('');
const dialog = shallowRef(false);
const editing = shallowRef(false);
const securityGroups = shallowRef<PveRecord[]>([]);
const groupVisible = shallowRef(false);
const groupForm = reactive({ action: '', enable: 1, iface: '', comment: '' });
const logPositionRef = useTemplateRef<HTMLElement>('logPosition');
const logLimit = 500;
const logLineHeight = 18;
let logStart = 0;
let logCurrentRecord = 0;
let logRecordTotal = 0;
let logIsUpdate = false;
let logIsScroll = false;
let logTimer: ReturnType<typeof setTimeout> | undefined;
const securityGroupOptions = computed(() =>
  securityGroups.value
    .map((group) => ({
      label: textValue(group.group),
      value: textValue(group.group),
      description: textValue(group.comment),
    }))
    .filter((group) => group.value),
);
const form = reactive<Record<string, string | number>>({
  type: 'in',
  action: 'ACCEPT',
  enable: 1,
  macro: '',
  iface: '',
  source: '',
  dest: '',
  proto: '',
  sport: '',
  dport: '',
  log: 'nolog',
  comment: '',
});
const selectedRule = computed(() => selected.value[0]);
const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {},
);
const canConfigureFirewall = computed(() => Boolean(vmCaps.value['VM.Config.Network']));
const canViewFirewallLog = computed(() => Boolean(vmCaps.value['VM.Console']));
type FirewallOptionKey =
  | 'enable'
  | 'dhcp'
  | 'ndp'
  | 'radv'
  | 'macfilter'
  | 'ipfilter'
  | 'log_level_in'
  | 'log_level_out'
  | 'policy_in'
  | 'policy_out';
type FirewallOptionRow = {
  key: FirewallOptionKey;
  label: string;
  value: string;
  type: 'boolean' | 'log' | 'policy';
};
const selectedFirewallOption = shallowRef<FirewallOptionKey>('enable');
const firewallLogLevelOptions = [
  'nolog',
  'emerg',
  'alert',
  'crit',
  'err',
  'warning',
  'notice',
  'info',
  'debug',
];
const firewallPolicyOptions = ['ACCEPT', 'DROP', 'REJECT'];
const logModeOptions = computed(() => [
  { label: gettext('Live Mode'), value: true },
  { label: gettext('Select Timespan'), value: false },
]);
const columns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'enable', label: gettext('Enable'), field: 'enable', align: 'left' },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
  { name: 'action', label: gettext('Action'), field: 'action', align: 'left' },
  { name: 'macro', label: gettext('Macro'), field: 'macro', align: 'left' },
  { name: 'source', label: gettext('Source'), field: 'source', align: 'left' },
  { name: 'dest', label: gettext('Destination'), field: 'dest', align: 'left' },
  { name: 'proto', label: gettext('Protocol'), field: 'proto', align: 'left' },
  { name: 'dport', label: gettext('Dest. port'), field: 'dport', align: 'left' },
  { name: 'log', label: gettext('Log Level'), field: (row) => row.log || 'nolog', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
]);
function firewallOptionIcon(key: FirewallOptionKey) {
  if (key === 'enable') return 'security';
  if (key === 'dhcp' || key === 'ndp' || key === 'radv') return 'settings_ethernet';
  if (key === 'macfilter' || key === 'ipfilter') return 'filter_alt';
  if (key === 'log_level_in' || key === 'log_level_out') return 'article';
  if (key === 'policy_in' || key === 'policy_out') return 'rule';
  return 'settings';
}
function booleanOptionValue(key: FirewallOptionKey) {
  return Number(options.value[key] || 0) === 1;
}
function firewallOptionDisplayValue(row: FirewallOptionRow) {
  if (row.type === 'boolean') {
    return booleanOptionValue(row.key) ? gettext('Yes') : gettext('No');
  }
  return textValue(options.value[row.key]) || row.value;
}
const firewallOptionRows = computed<FirewallOptionRow[]>(() => [
  { key: 'enable', label: gettext('Firewall'), value: gettext('No'), type: 'boolean' },
  { key: 'dhcp', label: 'DHCP', value: gettext('No'), type: 'boolean' },
  { key: 'ndp', label: 'NDP', value: gettext('No'), type: 'boolean' },
  { key: 'radv', label: gettext('Router Advertisement'), value: gettext('No'), type: 'boolean' },
  { key: 'macfilter', label: gettext('MAC filter'), value: gettext('No'), type: 'boolean' },
  { key: 'ipfilter', label: gettext('IP filter'), value: gettext('No'), type: 'boolean' },
  { key: 'log_level_in', label: gettext('Log Level In'), value: 'nolog', type: 'log' },
  { key: 'log_level_out', label: gettext('Log Level Out'), value: 'nolog', type: 'log' },
  { key: 'policy_in', label: gettext('Input Policy'), value: 'DROP', type: 'policy' },
  { key: 'policy_out', label: gettext('Output Policy'), value: 'ACCEPT', type: 'policy' },
]);
const selectedFirewallOptionRow = computed(() =>
  firewallOptionRows.value.find((row) => row.key === selectedFirewallOption.value),
);

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const [rulesResponse, optionsResponse] = await Promise.all([
      getVmFirewallRules(props.node, props.vmid, props.guestType),
      getVmFirewallOptions(props.node, props.vmid, props.guestType),
    ]);
    rows.value = rulesResponse.data || [];
    options.value = optionsResponse.data || {};
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function openRule(edit = false) {
  if (!canConfigureFirewall.value) return;
  editing.value = edit;
  Object.assign(
    form,
    edit && selectedRule.value
      ? selectedRule.value
      : {
          type: 'in',
          action: 'ACCEPT',
          enable: 1,
          macro: '',
          iface: '',
          source: '',
          dest: '',
          proto: '',
          sport: '',
          dport: '',
          log: 'nolog',
          comment: '',
        },
  );
  dialog.value = true;
}
async function openSecurityGroup() {
  if (!canConfigureFirewall.value) return;
  loading.value = true;
  try {
    const response = await getFirewallGroups();
    securityGroups.value = response.data || [];
    groupForm.action = securityGroupOptions.value[0]?.value || '';
    groupForm.enable = 1;
    groupForm.iface = '';
    groupForm.comment = '';
    groupVisible.value = true;
  } finally {
    loading.value = false;
  }
}
async function saveSecurityGroup() {
  if (!canConfigureFirewall.value || !groupForm.action) return;
  loading.value = true;
  try {
    await createVmFirewallRule(
      props.node,
      props.vmid,
      {
        type: 'group',
        action: groupForm.action,
        enable: groupForm.enable,
        iface: groupForm.iface,
        comment: groupForm.comment,
      },
      props.guestType,
    );
    groupVisible.value = false;
    await reload();
  } finally {
    loading.value = false;
  }
}
async function saveRule() {
  if (!canConfigureFirewall.value) return;
  loading.value = true;
  try {
    if (editing.value)
      await updateVmFirewallRule(
        props.node,
        props.vmid,
        textValue(form.pos),
        form,
        props.guestType,
      );
    else await createVmFirewallRule(props.node, props.vmid, form, props.guestType);
    dialog.value = false;
    await reload();
  } finally {
    loading.value = false;
  }
}
function removeRule() {
  if (!canConfigureFirewall.value) return;
  const row = selectedRule.value;
  if (!row) return;
  const position = textValue(row.pos);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', position),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteVmFirewallRule(props.node, props.vmid, position, row.digest, props.guestType).then(
      reload,
    );
  });
}
async function saveOption(key: string, value: unknown) {
  if (!canConfigureFirewall.value) return;
  loading.value = true;
  try {
    await updateVmFirewallOptions(
      props.node,
      props.vmid,
      {
        [key]: value,
        digest: options.value.digest,
      },
      props.guestType,
    );
    await reload();
  } finally {
    loading.value = false;
  }
}
function clearLogTimer() {
  if (!logTimer) return;
  clearTimeout(logTimer);
  logTimer = undefined;
}
function initLogDates() {
  const now = new Date();
  const since = new Date();
  since.setDate(now.getDate() - 3);
  logSince.value = quasarDate.formatDate(since, 'YYYY-MM-DD');
  logUntil.value = quasarDate.formatDate(now, 'YYYY-MM-DD');
}
function resetLogs() {
  clearLogTimer();
  logs.value = [];
  logStart = 0;
  logCurrentRecord = 0;
  logRecordTotal = 0;
  logIsUpdate = false;
  logIsScroll = false;
}
function parseLogDate(value: string) {
  const parts = value.split('-').map((item) => Number(item));
  if (parts.length !== 3 || parts.some((item) => Number.isNaN(item))) return undefined;
  return new Date(parts[0] || 0, (parts[1] || 1) - 1, parts[2] || 1);
}
function buildLogParams() {
  if (logLiveMode.value) {
    return {
      start: Math.max(0, logStart),
      limit: logLimit,
    };
  }

  const sinceDate = parseLogDate(logSince.value);
  const untilDate = parseLogDate(logUntil.value);
  if (!sinceDate || !untilDate) return undefined;
  sinceDate.setHours(0, 0, 0, 0);
  untilDate.setHours(0, 0, 0, 0);
  untilDate.setDate(untilDate.getDate() + 1);
  return {
    start: Math.max(0, logStart),
    limit: logLimit,
    since: Math.floor(sinceDate.getTime() / 1000),
    until: Math.floor(untilDate.getTime() / 1000),
  };
}
function resetAndLoadLogs() {
  resetLogs();
  void loadFirewallLogs(true);
}
function logText(item: PveRecord | string) {
  if (typeof item === 'string') return item;
  return textValue(item.t || item.msg);
}
function hasEmptyLogLine(start: number, end: number) {
  for (let index = start; index <= end; index += 1) {
    if (!logs.value[index]) return true;
  }
  return false;
}
function scheduleLogReload(delay: number) {
  clearLogTimer();
  logTimer = setTimeout(() => {
    void loadFirewallLogs(false);
  }, delay);
}
function handleLogScroll() {
  if (logIsUpdate || !logIsScroll) return;
  clearLogTimer();
  checkLogViewport();
}
function handleLogMouseUp() {
  logIsScroll = true;
  clearLogTimer();
  checkLogViewport();
}
function checkLogViewport() {
  const container = logPositionRef.value;
  if (!container) return;
  logStart = Math.floor(container.scrollTop / logLineHeight) + 1;
  logCurrentRecord = Math.floor(
    container.scrollTop / logLineHeight + container.clientHeight / logLineHeight,
  );
  if (hasEmptyLogLine(logStart, logCurrentRecord)) {
    logStart = logStart - Math.floor(logLimit / 2);
    void loadFirewallLogs(false);
  } else if (logCurrentRecord === logs.value.length) {
    logStart = logCurrentRecord - 1;
    void loadFirewallLogs(false);
  }
}
async function loadFirewallLogs(isStart: boolean) {
  if (!props.node || !props.vmid) return;
  const params = buildLogParams();
  if (!params) return;
  logIsUpdate = true;
  logLoading.value = true;
  try {
    const response = await getVmFirewallLogs(props.node, props.vmid, params, props.guestType);
    const items = response.data || [];
    const total = Number(response.total || items.length);
    const nextLogs = logs.value.slice();
    for (let index = 0; index < total; index += 1) {
      if (!nextLogs[index]) nextLogs[index] = '';
    }
    const startIndex = Math.max(0, logStart);
    items.forEach((item, index) => {
      nextLogs[startIndex + index] = item;
    });
    logs.value = nextLogs;
    await nextTick();
    const container = logPositionRef.value;
    if (container && isStart) {
      container.scrollTop = logLineHeight * total;
      logCurrentRecord = total;
      if (total > logLimit) {
        logStart = total - Math.floor(logLimit / 2);
      }
      if (logLiveMode.value) scheduleLogReload(100);
    }
    if (container && !isStart && logLiveMode.value && logCurrentRecord === logRecordTotal) {
      container.scrollTop = logLineHeight * total;
      logCurrentRecord = total;
      scheduleLogReload(5000);
    }
    logRecordTotal = total;
  } finally {
    logIsUpdate = false;
    logLoading.value = false;
  }
}
watch(
  () => [props.node, props.vmid],
  () => {
    resetLogs();
    void reload();
    if (section.value === 'log') {
      void loadFirewallLogs(true);
    }
  },
  { immediate: true },
);
watch(section, (value) => {
  if (value === 'log') {
    resetAndLoadLogs();
  } else {
    clearLogTimer();
  }
});
watch(logLiveMode, () => {
  resetAndLoadLogs();
});
initLogDates();
onBeforeUnmount(() => {
  clearLogTimer();
});
</script>

<template>
  <div class="vm-firewall-tab q-pa-md">
    <div class="vm-firewall-layout">
      <q-tabs
        v-model="section"
        vertical
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="vm-firewall-nav"
        ><q-tab inline-label name="rules" icon="rule" :label="gettext('Rules')" /><q-tab
          inline-label
          name="options"
          icon="tune"
          :label="gettext('Options')" /><q-tab
          inline-label
          name="aliases"
          icon="sell"
          :label="gettext('Alias')" /><q-tab
          inline-label
          name="ipset"
          icon="lan"
          :label="gettext('IPSet')" /><q-tab
          v-if="canViewFirewallLog"
          inline-label
          name="log"
          icon="article"
          :label="gettext('Log')" /></q-tabs
      ><q-separator vertical />
      <q-tab-panels v-model="section" animated class="vm-firewall-panels">
        <q-tab-panel name="rules" class="q-pa-sm"
          ><q-card class="no-border-radius no-shadow q-ma-none">
            <q-card-section class="q-pa-none">
              <q-table
                v-model:selected="selected"
                flat
                row-key="pos"
                selection="single"
                table-header-class="u-table-header"
                :rows="rows"
                :columns="columns"
                :loading="loading"
                :rows-per-page-options="[10]"
                :pagination="{ page: 1, rowsPerPage: 10 }"
                :no-data-label="gettext('no record can be found')"
                ><template #top
                  ><div class="q-gutter-sm">
                    <q-btn
                      no-caps
                      outline
                      size="12px"
                      color="primary"
                      class="u-button"
                      :disable="!canConfigureFirewall"
                      :label="gettext('Add')"
                      @click="openRule()"
                    /><q-btn
                      no-caps
                      outline
                      size="12px"
                      color="primary"
                      class="u-button"
                      :disable="!canConfigureFirewall"
                      :label="gettext('Insert Security Group')"
                      @click="openSecurityGroup"
                    /><q-btn
                      no-caps
                      outline
                      size="12px"
                      color="primary"
                      class="u-button"
                      :disable="!canConfigureFirewall || !selectedRule"
                      :label="gettext('Edit')"
                      @click="openRule(true)"
                    /><q-btn
                      no-caps
                      outline
                      size="12px"
                      color="negative"
                      class="u-button"
                      :disable="!canConfigureFirewall || !selectedRule"
                      :label="gettext('Remove')"
                      @click="removeRule"
                    />
                  </div>
                  <q-space /><q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Refresh')"
                    @click="reload" /></template
                ><template #body-cell-enable="scope"
                  ><q-td :props="scope"
                    ><q-badge
                      :color="scope.value ? 'positive' : 'negative'"
                      :label="
                        scope.value ? gettext('Enabled') : gettext('Disabled')
                      " /></q-td></template
                ><template #no-data
                  ><div class="full-width row flex-center text-grey q-gutter-sm">
                    <span>{{ gettext('no record can be found') }}</span>
                  </div></template
                ></q-table
              >
            </q-card-section>
          </q-card></q-tab-panel
        >
        <q-tab-panel name="options" class="q-pa-sm"
          ><div class="firewall-options-shell">
            <div class="row no-wrap firewall-options-scroll u-hidden-error">
              <div class="col-7 firewall-options-list-column">
                <div class="u-border firewall-options-list-panel">
                  <div
                    v-for="row in firewallOptionRows"
                    :key="row.key"
                    class="cursor-pointer q-px-sm row firewall-options-list-row"
                    :class="{ 'bg-blue-2 text-grey-1': selectedFirewallOption === row.key }"
                    @click="selectedFirewallOption = row.key"
                  >
                    <div class="col-5 text-grey-10 firewall-options-list-label">
                      <q-icon
                        :name="firewallOptionIcon(row.key)"
                        size="15px"
                        class="q-mr-xs firewall-options-list-icon"
                      />{{ row.label }}
                    </div>
                    <div class="col-7 text-grey-8 firewall-options-list-value">
                      {{ firewallOptionDisplayValue(row) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-5 firewall-options-editor-column">
                <div
                  class="u-border q-pa-sm u-hidden-error firewall-options-scroll firewall-options-editor"
                >
                  <div class="row items-center no-wrap firewall-editor-titlebar">
                    <div class="col firewall-editor-title">
                      {{ selectedFirewallOptionRow?.label }}
                    </div>
                  </div>
                  <div v-if="selectedFirewallOptionRow" class="row q-col-gutter-md">
                    <div v-if="selectedFirewallOptionRow.type === 'boolean'" class="col-12">
                      <q-toggle
                        :model-value="booleanOptionValue(selectedFirewallOptionRow.key)"
                        dense
                        :true-value="true"
                        :false-value="false"
                        :disable="!canConfigureFirewall"
                        color="primary"
                        :label="selectedFirewallOptionRow.label"
                        @update:model-value="
                          saveOption(selectedFirewallOptionRow.key, $event ? 1 : 0)
                        "
                      />
                    </div>
                    <div
                      v-else-if="selectedFirewallOptionRow.type === 'log'"
                      class="col-12 col-md-8"
                    >
                      <q-select
                        :model-value="
                          textValue(options[selectedFirewallOptionRow.key]) ||
                          selectedFirewallOptionRow.value
                        "
                        dense
                        options-dense
                        emit-value
                        map-options
                        :disable="!canConfigureFirewall"
                        :options="firewallLogLevelOptions"
                        :label="selectedFirewallOptionRow.label"
                        @update:model-value="saveOption(selectedFirewallOptionRow.key, $event)"
                      />
                    </div>
                    <div v-else class="col-12 col-md-8">
                      <q-select
                        :model-value="
                          textValue(options[selectedFirewallOptionRow.key]) ||
                          selectedFirewallOptionRow.value
                        "
                        dense
                        options-dense
                        emit-value
                        map-options
                        :disable="!canConfigureFirewall"
                        :options="firewallPolicyOptions"
                        :label="selectedFirewallOptionRow.label"
                        @update:model-value="saveOption(selectedFirewallOptionRow.key, $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <q-inner-loading :showing="loading" /></div
        ></q-tab-panel>
        <q-tab-panel name="aliases" class="q-pa-sm"
          ><VmFirewallAliasesTab :node="node" :vmid="vmid" :editable="canConfigureFirewall"
        /></q-tab-panel>
        <q-tab-panel name="ipset" class="q-pa-sm"
          ><VmFirewallIpsetTab :node="node" :vmid="vmid" :editable="canConfigureFirewall"
        /></q-tab-panel>
        <q-tab-panel name="log" class="q-pa-sm"
          ><div class="vm-firewall-log-wrap">
            <div class="row q-gutter-sm items-center no-wrap vm-firewall-log-toolbar">
              <q-btn-toggle
                v-model="logLiveMode"
                no-caps
                size="12px"
                class="u-button"
                toggle-color="primary"
                :options="logModeOptions"
              />
              <template v-if="!logLiveMode">
                <q-input
                  v-model="logSince"
                  square
                  outlined
                  dense
                  class="u-dense vm-firewall-log-date"
                  :label="gettext('Since')"
                >
                  <template #append>
                    <q-icon name="event" class="cursor-pointer">
                      <q-popup-proxy transition-show="scale" transition-hide="scale">
                        <q-date v-model="logSince" minimal mask="YYYY-MM-DD" />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
                <q-input
                  v-model="logUntil"
                  square
                  outlined
                  dense
                  class="u-dense vm-firewall-log-date"
                  :label="gettext('Until')"
                >
                  <template #append>
                    <q-icon name="event" class="cursor-pointer">
                      <q-popup-proxy transition-show="scale" transition-hide="scale">
                        <q-date v-model="logUntil" minimal mask="YYYY-MM-DD" />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
              </template>
              <q-btn
                no-caps
                size="12px"
                color="primary"
                class="u-button"
                :loading="logLoading"
                :label="gettext('Update')"
                @click="resetAndLoadLogs"
              />
            </div>
            <div
              ref="logPosition"
              class="vm-firewall-log u-size-12"
              @scroll="handleLogScroll"
              @mousedown="logIsScroll = false"
              @mouseup="handleLogMouseUp"
            >
              <div v-if="!logLoading && !logs.length" class="vm-firewall-log-empty">
                {{ gettext('No logs found') }}
              </div>
              <div
                v-for="(item, index) in logs"
                :key="index"
                class="vm-firewall-log-row"
                :title="logText(item)"
              >
                <span class="text-grey-6">{{ index + 1 }}</span> {{ logText(item) }}
              </div>
            </div>
            <q-inner-loading :showing="logLoading" /></div
        ></q-tab-panel>
      </q-tab-panels>
    </div>
    <q-dialog v-model="groupVisible" persistent>
      <UWindow :title="gettext('Insert Security Group')" width="460px" :loading="loading">
        <q-form
          class="firewall-rule-form u-border q-ma-sm q-pa-md u-dense"
          @submit.prevent="saveSecurityGroup"
        >
          <q-select
            v-model="groupForm.action"
            dense
            options-dense
            emit-value
            map-options
            :options="securityGroupOptions"
            :label="gettext('Security Group')"
            :rules="[(value) => !!value || gettext('Required field')]"
          />
          <q-input v-model="groupForm.iface" dense :label="gettext('Interface')" />
          <q-checkbox
            v-model="groupForm.enable"
            dense
            color="primary"
            :true-value="1"
            :false-value="0"
            :label="gettext('Enable')"
          />
          <q-input v-model="groupForm.comment" dense :label="gettext('Comment')" />
        </q-form>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!groupForm.action"
            :loading="loading"
            :label="gettext('Save')"
            @click="saveSecurityGroup"
        /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="dialog" persistent
      ><UWindow
        :title="gettext(editing ? 'Edit Rule' : 'Add Rule')"
        width="620px"
        :loading="loading"
        ><q-form
          class="firewall-rule-form u-border q-ma-sm q-pa-md u-dense"
          @submit.prevent="saveRule"
        >
          <div class="row q-col-gutter-md">
            <q-select
              v-model="form.type"
              class="col-6"
              dense
              options-dense
              emit-value
              map-options
              :label="gettext('Direction')"
              :options="[
                { label: gettext('In'), value: 'in' },
                { label: gettext('Out'), value: 'out' },
              ]"
            /><q-select
              v-model="form.action"
              class="col-6"
              dense
              options-dense
              :label="gettext('Action')"
              :options="['ACCEPT', 'DROP', 'REJECT']"
            /><q-input v-model="form.macro" class="col-6" dense :label="gettext('Macro')" /><q-input
              v-model="form.iface"
              class="col-6"
              dense
              :label="gettext('Interface')"
            /><q-input
              v-model="form.source"
              class="col-6"
              dense
              :label="gettext('Source')"
            /><q-input
              v-model="form.dest"
              class="col-6"
              dense
              :label="gettext('Destination')"
            /><q-input
              v-model="form.proto"
              class="col-4"
              dense
              :label="gettext('Protocol')"
            /><q-input
              v-model="form.sport"
              class="col-4"
              dense
              :label="gettext('Source port')"
            /><q-input
              v-model="form.dport"
              class="col-4"
              dense
              :label="gettext('Dest. port')"
            /><q-input
              v-model="form.comment"
              class="col-12"
              dense
              :label="gettext('Comment')"
            /><q-checkbox
              v-model="form.enable"
              class="col-12"
              dense
              color="primary"
              :true-value="1"
              :false-value="0"
              :label="gettext('Enable')"
            />
          </div>
        </q-form>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Save')"
            @click="saveRule" /></template></UWindow
    ></q-dialog>
  </div>
</template>

<style scoped>
.vm-firewall-layout {
  display: flex;
  min-height: 360px;
  border: 1px solid #e0e0e0;
}

.vm-firewall-nav {
  width: 140px;
  flex: 0 0 140px;
  background: #fafafa;
}

.vm-firewall-nav :deep(.q-tab) {
  justify-content: flex-start;
  min-height: 38px;
}

.vm-firewall-nav :deep(.q-tab__content) {
  align-items: flex-start;
  flex-direction: row;
  gap: 8px;
}

.vm-firewall-nav :deep(.q-tab__icon) {
  width: 18px;
  min-width: 18px;
  font-size: 18px;
}

.vm-firewall-panels {
  min-width: 0;
  flex: 1 1 auto;
}

.firewall-options-shell {
  position: relative;
}

.firewall-options-scroll {
  font-size: 13px;
  background: #fff;
}

.firewall-options-list-column {
  overflow: hidden;
}

.firewall-options-editor-column {
  display: flex;
  overflow: hidden;
  background: #fff;
}

.firewall-options-list-panel {
  border-right: 0;
}

.firewall-options-editor {
  flex: 1;
  border-left: 1px solid #d7dce2;
}

.firewall-options-list-row {
  min-height: 30px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}

.firewall-options-list-label {
  align-self: flex-start;
  padding-top: 6px;
}

.firewall-options-list-icon {
  vertical-align: text-bottom;
}

.firewall-options-list-value {
  min-width: 0;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 18px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}

.firewall-options-list-row:last-child {
  border-bottom: 0;
}

.firewall-options-list-row:hover {
  background: #f4f8fc;
}

.firewall-options-list-row.bg-blue-2 {
  background: #e6f1fb !important;
}

.firewall-options-list-row.bg-blue-2 :deep(.text-grey-10),
.firewall-options-list-row.bg-blue-2 :deep(.text-grey-8) {
  color: #1f4f78 !important;
}

.firewall-editor-titlebar {
  min-height: 38px;
  margin: -4px -4px 10px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #d7dce2;
}

.firewall-editor-title {
  font-weight: 600;
  color: #334155;
}

.vm-firewall-log-wrap {
  position: relative;
}

.vm-firewall-log-toolbar {
  margin-bottom: 8px;
}

.vm-firewall-log-date {
  width: 140px;
}

.vm-firewall-log {
  height: 520px;
  overflow: hidden auto;
}

.vm-firewall-log-row {
  min-width: 0;
  height: 18px;
  overflow: hidden;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vm-firewall-log-empty {
  height: 40px;
  color: #6b7280;
  line-height: 40px;
  text-align: center;
}

.firewall-rule-form {
  display: block;
}

.firewall-rule-form :deep(.q-checkbox) {
  min-height: 30px;
}

@media (prefers-reduced-motion: reduce) {
  .firewall-options-list-row {
    transition: none;
  }
}
</style>
