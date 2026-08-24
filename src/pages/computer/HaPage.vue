<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { useQuasar } from 'quasar';
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue';
import {
  armHa,
  createHaResource,
  deleteHaResource,
  deleteHaRule,
  disarmHa,
  getClusterOptions,
  getHaResource,
  getHaRules,
  getHaStatus,
  updateClusterOptions,
  updateHaResource,
} from '@/api/ha';
import { getClusterResources, type PveRecord } from '@/api/resources';
import { textValue } from '@/utils/pveFormat';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import HaRuleDialog from '@/pages/computer/ha/HaRuleDialog.vue';

const $q = useQuasar();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const activeTab = shallowRef('status');
const rows = shallowRef<PveRecord[]>([]);
const rules = shallowRef<PveRecord[]>([]);
const selectedResources = shallowRef<PveRecord[]>([]);
const selectedNodeRules = shallowRef<PveRecord[]>([]);
const selectedResourceRules = shallowRef<PveRecord[]>([]);
const resourceDialogVisible = shallowRef(false);
const resourceAction = shallowRef<'add' | 'edit'>('add');
const crsDialogVisible = shallowRef(false);
const ruleDialogVisible = shallowRef(false);
const ruleDialogType = shallowRef<'node-affinity' | 'resource-affinity'>('node-affinity');
const editingRule = shallowRef<PveRecord>();
const addableResources = shallowRef<PveRecord[]>([]);
const pendingArmState = shallowRef<'armed' | 'disarmed'>();
let refreshTimer: number | undefined;

const resourceForm = reactive({
  sid: '',
  state: 'started',
  max_restart: 1,
  max_relocate: 1,
  failback: true,
  autoRebalance: true,
  comment: '',
});
const crsForm = reactive({
  ha: '__default__',
  rebalanceOnStart: false,
  autoRebalance: false,
  threshold: '',
  method: '__default__',
  holdDuration: '',
  margin: '',
});

const statusColumns: QTableColumn<PveRecord>[] = [
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left' },
];
const resourceColumns: QTableColumn<PveRecord>[] = [
  { name: 'sid', label: gettext('ID'), field: 'sid', align: 'left', sortable: true },
  { name: 'state', label: gettext('State'), field: 'state', align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  {
    name: 'request_state',
    label: gettext('Request State'),
    field: (row) => row.request_state || 'started',
    align: 'left',
  },
  { name: 'crm_state', label: gettext('CRM State'), field: 'crm_state', align: 'left' },
  {
    name: 'max_restart',
    label: gettext('Max. Restart'),
    field: (row) => row.max_restart ?? 1,
    align: 'left',
  },
  {
    name: 'max_relocate',
    label: gettext('Max. Relocate'),
    field: (row) => row.max_relocate ?? 1,
    align: 'left',
  },
  {
    name: 'failback',
    label: gettext('Failback'),
    field: (row) => (row.failback === false ? gettext('No') : gettext('Yes')),
    align: 'left',
  },
  {
    name: 'auto-rebalance',
    label: gettext('Auto-Rebalance'),
    field: (row) => (row['auto-rebalance'] === false ? gettext('No') : gettext('Yes')),
    align: 'left',
  },
  { name: 'vname', label: gettext('Name'), field: 'vname', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const nodeRuleColumns: QTableColumn<PveRecord>[] = [
  { name: 'rule', label: gettext('ID'), field: 'rule', align: 'left' },
  { name: 'disable', label: gettext('Enabled'), field: (row) => !row.disable, align: 'center' },
  { name: 'state', label: gettext('State'), field: 'errors', align: 'center' },
  { name: 'affinity', label: gettext('Affinity'), field: 'affinity', align: 'left' },
  {
    name: 'strict',
    label: gettext('Strict'),
    field: (row) => (row.strict ? gettext('Yes') : gettext('No')),
    align: 'left',
  },
  { name: 'resources', label: gettext('HA Resources'), field: 'resources', align: 'left' },
  { name: 'nodes', label: gettext('Nodes'), field: 'nodes', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const resourceRuleColumns: QTableColumn<PveRecord>[] = [
  { name: 'rule', label: gettext('ID'), field: 'rule', align: 'left' },
  { name: 'disable', label: gettext('Enabled'), field: (row) => !row.disable, align: 'center' },
  { name: 'state', label: gettext('State'), field: 'errors', align: 'center' },
  { name: 'affinity', label: gettext('Affinity'), field: 'affinity', align: 'left' },
  { name: 'resources', label: gettext('HA Resources'), field: 'resources', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];

const statusRows = computed(() =>
  rows.value
    .filter((row) => row.type !== 'service')
    .slice()
    .sort(
      (a, b) =>
        (({ quorum: 1, fencing: 2, master: 3, lrm: 4 })[String(a.type)] || 99) -
        ({ quorum: 1, fencing: 2, master: 3, lrm: 4 }[String(b.type)] || 99)
    )
);
const resourceRows = computed(() => rows.value.filter((row) => row.type === 'service'));
const nodeRules = computed(() => rules.value.filter((rule) => rule.type === 'node-affinity'));
const resourceRules = computed(() =>
  rules.value.filter((rule) => rule.type === 'resource-affinity')
);
const haDisarmed = computed(
  () => rows.value.find((row) => row.type === 'fencing')?.['armed-state'] === 'disarmed'
);
const canUseAutoRebalancing = computed(() => crsForm.ha === 'static' || crsForm.ha === 'dynamic');

async function loadStatus() {
  loading.value = true;
  try {
    rows.value = (await getHaStatus()).data || [];
    if (
      pendingArmState.value &&
      rows.value.find((row) => row.type === 'fencing')?.['armed-state'] === pendingArmState.value
    )
      pendingArmState.value = undefined;
  } finally {
    loading.value = false;
  }
}
async function loadRules() {
  loading.value = true;
  try {
    rules.value = (await getHaRules()).data || [];
  } finally {
    loading.value = false;
  }
}
async function refresh() {
  await Promise.all([loadStatus(), loadRules()]);
}
function confirm(message: string, onOk: () => void) {
  $q.dialog({ title: gettext('Confirm'), message, cancel: true, persistent: true }).onOk(onOk);
}
function arm() {
  confirm(gettext('Are you sure you want to arm HA?'), () => {
    void (async () => {
      actionLoading.value = true;
      try {
        await armHa();
        pendingArmState.value = 'armed';
        await loadStatus();
      } finally {
        actionLoading.value = false;
      }
    })();
  });
}
function disarm(mode: 'freeze' | 'ignore') {
  confirm(
    [
      gettext("Are you sure you want to disarm HA with resource mode '{0}'?").replace(
        '{0}',
        gettext(mode === 'freeze' ? 'Freeze' : 'Ignore')
      ),
      gettext(
        mode === 'freeze'
          ? 'This will freeze all services allowing no change to their operational state.'
          : 'The HA stack will be completely bypassed when the operational state of a service changes.'
      ),
      gettext(
        'While disarmed, HA does not protect your services. Failures during this period are not automatically recovered.'
      ),
    ].join('<br><br>'),
    () => {
      void (async () => {
        actionLoading.value = true;
        try {
          await disarmHa(mode);
          pendingArmState.value = 'disarmed';
          await loadStatus();
        } finally {
          actionLoading.value = false;
        }
      })();
    }
  );
}
function resetResourceForm() {
  Object.assign(resourceForm, {
    sid: '',
    state: 'started',
    max_restart: 1,
    max_relocate: 1,
    failback: true,
    autoRebalance: true,
    comment: '',
  });
}
async function openResource(action: 'add' | 'edit') {
  resourceAction.value = action;
  resetResourceForm();
  const selectedResource = selectedResources.value[0];
  if (action === 'add') {
    addableResources.value = ((await getClusterResources()).data || []).filter(
      (resource) =>
        ['qemu', 'lxc'].includes(textValue(resource.type)) &&
        textValue(resource.hastate) === 'unmanaged'
    );
  } else if (selectedResource) {
    const id = textValue(selectedResource.sid).split(':')[1] || textValue(selectedResource.sid);
    const resource = (await getHaResource(id)).data || {};
    Object.assign(resourceForm, {
      sid: id,
      state: textValue(resource.state, 'started'),
      max_restart: Number(resource.max_restart ?? 1),
      max_relocate: Number(resource.max_relocate ?? 1),
      failback: resource.failback !== false,
      autoRebalance: resource['auto-rebalance'] !== false,
      comment: textValue(resource.comment),
    });
  }
  resourceDialogVisible.value = true;
}
function openRule(type: 'node-affinity' | 'resource-affinity', rule?: PveRecord) {
  ruleDialogType.value = type;
  editingRule.value = rule;
  ruleDialogVisible.value = true;
}
function showRuleErrors(rule: PveRecord) {
  const errors = rule.errors as PveRecord | undefined;
  if (!errors || !Object.keys(errors).length) return;
  $q.dialog({
    title: gettext('HA Rule Errors'),
    message: Object.entries(errors)
      .map(([key, value]) => `${key}: ${textValue(value)}`)
      .join('<br>'),
    html: true,
    ok: true,
  });
}
async function saveResource() {
  if (!resourceForm.sid) return;
  actionLoading.value = true;
  try {
    const data: PveRecord = {
      state: resourceForm.state,
      max_restart: resourceForm.max_restart,
      max_relocate: resourceForm.max_relocate,
      failback: resourceForm.failback ? 1 : 0,
      'auto-rebalance': resourceForm.autoRebalance ? 1 : 0,
      comment: resourceForm.comment,
    };
    if (resourceAction.value === 'add')
      await createHaResource({ ...data, sid: `vm:${resourceForm.sid}` });
    else await updateHaResource(resourceForm.sid, data);
    resourceDialogVisible.value = false;
    selectedResources.value = [];
    await loadStatus();
  } finally {
    actionLoading.value = false;
  }
}
function removeResource() {
  const selectedResource = selectedResources.value[0];
  if (!selectedResource) return;
  const sid = textValue(selectedResource.sid);
  confirm(gettext('Are you sure to delete [%s]?').replace('%s', sid), () => {
    void (async () => {
      await deleteHaResource(sid);
      selectedResources.value = [];
      await loadStatus();
    })();
  });
}
function removeRule(rule: PveRecord) {
  const id = textValue(rule.rule);
  confirm(gettext('Are you sure to delete [%s]?').replace('%s', id), () => {
    void (async () => {
      await deleteHaRule(id);
      await loadRules();
    })();
  });
}
function parseCrs(value: string) {
  const fields = Object.fromEntries(
    value
      .split(',')
      .filter(Boolean)
      .map((item) => item.split('='))
  );
  Object.assign(crsForm, {
    ha: fields.ha || '__default__',
    rebalanceOnStart: fields['ha-rebalance-on-start'] === '1',
    autoRebalance: fields['ha-auto-rebalance'] === '1',
    threshold: fields['ha-auto-rebalance-threshold'] || '',
    method: fields['ha-auto-rebalance-method'] || '__default__',
    holdDuration: fields['ha-auto-rebalance-hold-duration'] || '',
    margin: fields['ha-auto-rebalance-margin'] || '',
  });
}
async function openCrs() {
  const response = await getClusterOptions();
  parseCrs(textValue(response.data?.crs));
  crsDialogVisible.value = true;
}
async function saveCrs() {
  const pairs = [
    crsForm.ha !== '__default__' && `ha=${crsForm.ha}`,
    crsForm.rebalanceOnStart && 'ha-rebalance-on-start=1',
    crsForm.autoRebalance && canUseAutoRebalancing.value && 'ha-auto-rebalance=1',
    crsForm.autoRebalance &&
      canUseAutoRebalancing.value &&
      crsForm.threshold &&
      `ha-auto-rebalance-threshold=${crsForm.threshold}`,
    crsForm.autoRebalance &&
      canUseAutoRebalancing.value &&
      crsForm.method !== '__default__' &&
      `ha-auto-rebalance-method=${crsForm.method}`,
    crsForm.autoRebalance &&
      canUseAutoRebalancing.value &&
      crsForm.holdDuration &&
      `ha-auto-rebalance-hold-duration=${crsForm.holdDuration}`,
    crsForm.autoRebalance &&
      canUseAutoRebalancing.value &&
      crsForm.margin &&
      `ha-auto-rebalance-margin=${crsForm.margin}`,
  ]
    .filter(Boolean)
    .join(',');
  await updateClusterOptions(pairs ? { crs: pairs } : { delete: 'crs' });
  crsDialogVisible.value = false;
}
watch(canUseAutoRebalancing, (available) => {
  if (!available) crsForm.autoRebalance = false;
});
onMounted(() => {
  void refresh();
  refreshTimer = window.setInterval(() => void loadStatus(), 3000);
});
onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <div class="q-ma-md ha-module">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-tabs
        v-model="activeTab"
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab
          name="status"
          :label="gettext('HA')"
        />
        <q-tab
          name="rules"
          :label="gettext('Rules')"
        />
        <q-tab
          name="fencing"
          :label="gettext('Fencing')"
        />
      </q-tabs>
      <q-separator />
      <q-tab-panels
        v-model="activeTab"
        animated
      >
        <q-tab-panel
          name="status"
          class="q-pa-md"
        >
          <div class="row q-gutter-sm items-center q-mb-md">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!haDisarmed || actionLoading"
              :label="gettext('Arm HA')"
              @click="arm"
            />
            <q-btn-dropdown
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="haDisarmed || actionLoading"
              :label="gettext('Disarm HA')"
            >
              <q-list dense>
                <q-item
                  v-close-popup
                  clickable
                  @click="disarm('freeze')"
                >
                  <q-item-section>{{ gettext('Freeze') }}</q-item-section>
                </q-item>
                <q-item
                  v-close-popup
                  clickable
                  @click="disarm('ignore')"
                >
                  <q-item-section>{{ gettext('Ignore') }}</q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
            <q-space />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('CRS Settings')"
              @click="openCrs"
            />
          </div>
          <q-card
            flat
            bordered
            class="no-border-radius q-mb-md"
          >
            <div class="ha-section-title">{{ gettext('Status') }}</div>
            <q-table
              flat
              row-key="type"
              table-header-class="u-table-header"
              :rows="statusRows"
              :columns="statusColumns"
              :loading="loading"
              :rows-per-page-options="[0]"
              hide-pagination
              :no-data-label="gettext('no record can be found')"
            >
              <template #body-cell-status="props">
                <q-td :props="props">
                  {{ props.value }}
                  <q-spinner
                    v-if="props.row.type === 'fencing' && pendingArmState"
                    size="16px"
                    color="primary"
                    class="q-ml-sm"
                  />
                </q-td>
              </template>
            </q-table>
          </q-card>
          <q-card
            flat
            bordered
            class="no-border-radius"
          >
            <div class="ha-section-title">{{ gettext('Resources') }}</div>
            <q-table
              flat
              row-key="sid"
              table-header-class="u-table-header"
              :rows="resourceRows"
              :columns="resourceColumns"
              :loading="loading"
              selection="single"
              v-model:selected="selectedResources"
              :rows-per-page-options="[0]"
              :no-data-label="gettext('no record can be found')"
            >
              <template #top>
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button q-mr-sm"
                  :label="gettext('Add')"
                  @click="openResource('add')"
                />
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button q-mr-sm"
                  :disable="selectedResources.length !== 1"
                  :label="gettext('Edit')"
                  @click="openResource('edit')"
                />
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="red"
                  class="u-button"
                  :disable="selectedResources.length !== 1"
                  :label="gettext('Delete')"
                  @click="removeResource"
                />
              </template>
            </q-table>
          </q-card>
        </q-tab-panel>
        <q-tab-panel
          name="rules"
          class="q-pa-md"
        >
          <q-card
            flat
            bordered
            class="no-border-radius q-mb-md"
          >
            <div class="ha-section-title">{{ gettext('HA Node Affinity Rules') }}</div>
            <q-table
              flat
              row-key="rule"
              table-header-class="u-table-header"
              :rows="nodeRules"
              :columns="nodeRuleColumns"
              :loading="loading"
              selection="single"
              v-model:selected="selectedNodeRules"
              :rows-per-page-options="[0]"
              :no-data-label="gettext('No HA Node Affinity rules configured.')"
            >
              <template #top>
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button q-mr-sm"
                  :label="gettext('Add')"
                  @click="openRule('node-affinity')"
                />
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button"
                  :disable="selectedNodeRules.length !== 1"
                  :label="gettext('Edit')"
                  @click="openRule('node-affinity', selectedNodeRules[0])"
                />
              </template>
              <template #body-cell-disable="props">
                <q-td :props="props">
                  <q-icon
                    :name="props.value ? 'check' : 'close'"
                    :color="props.value ? 'green' : 'red'"
                  />
                </q-td>
              </template>
              <template #body-cell-state="props">
                <q-td :props="props">
                  <q-icon
                    :name="Object.keys(props.row.errors || {}).length ? 'warning' : 'check'"
                    :color="Object.keys(props.row.errors || {}).length ? 'warning' : 'green'"
                    class="cursor-pointer"
                    @click="showRuleErrors(props.row)"
                  />
                </q-td>
              </template>
              <template #body-cell-rule="props">
                <q-td :props="props">
                  {{ props.value }}
                  <q-btn
                    dense
                    flat
                    round
                    size="sm"
                    icon="delete"
                    color="red"
                    class="q-ml-sm"
                    @click="removeRule(props.row)"
                  />
                </q-td>
              </template>
            </q-table>
          </q-card>
          <q-card
            flat
            bordered
            class="no-border-radius"
          >
            <div class="ha-section-title">{{ gettext('HA Resource Affinity Rules') }}</div>
            <q-table
              flat
              row-key="rule"
              table-header-class="u-table-header"
              :rows="resourceRules"
              :columns="resourceRuleColumns"
              :loading="loading"
              selection="single"
              v-model:selected="selectedResourceRules"
              :rows-per-page-options="[0]"
              :no-data-label="gettext('No HA Resource Affinity rules configured.')"
            >
              <template #top>
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button q-mr-sm"
                  :label="gettext('Add')"
                  @click="openRule('resource-affinity')"
                />
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button"
                  :disable="selectedResourceRules.length !== 1"
                  :label="gettext('Edit')"
                  @click="openRule('resource-affinity', selectedResourceRules[0])"
                />
              </template>
              <template #body-cell-disable="props">
                <q-td :props="props">
                  <q-icon
                    :name="props.value ? 'check' : 'close'"
                    :color="props.value ? 'green' : 'red'"
                  />
                </q-td>
              </template>
              <template #body-cell-state="props">
                <q-td :props="props">
                  <q-icon
                    :name="Object.keys(props.row.errors || {}).length ? 'warning' : 'check'"
                    :color="Object.keys(props.row.errors || {}).length ? 'warning' : 'green'"
                    class="cursor-pointer"
                    @click="showRuleErrors(props.row)"
                  />
                </q-td>
              </template>
              <template #body-cell-rule="props">
                <q-td :props="props">
                  {{ props.value }}
                  <q-btn
                    dense
                    flat
                    round
                    size="sm"
                    icon="delete"
                    color="red"
                    class="q-ml-sm"
                    @click="removeRule(props.row)"
                  />
                </q-td>
              </template>
            </q-table>
          </q-card>
        </q-tab-panel>
        <q-tab-panel
          name="fencing"
          class="q-pa-md"
        >
          <q-table
            flat
            row-key="node"
            table-header-class="u-table-header"
            :rows="[]"
            :columns="[
              { name: 'node', label: gettext('Node'), field: 'node', align: 'left' },
              { name: 'command', label: gettext('Command'), field: 'command', align: 'left' },
            ]"
            :rows-per-page-options="[0]"
            :no-data-label="gettext('Use watchdog based fencing.')"
          />
        </q-tab-panel>
      </q-tab-panels>
      <q-inner-loading :showing="loading || actionLoading" />
    </q-card>
  </div>
  <HaRuleDialog
    v-model="ruleDialogVisible"
    :type="ruleDialogType"
    :rule="editingRule"
    @saved="loadRules"
  />
  <q-dialog
    v-model="resourceDialogVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <u-window
      width="620px"
      :title="`${gettext(resourceAction === 'add' ? 'Add' : 'Edit')}: ${gettext('HA Resource')}`"
    >
      <div class="u-border q-ma-sm q-pa-md">
        <q-banner
          v-if="resourceAction === 'add'"
          dense
          class="q-mb-md"
        >
          <template #avatar>
            <q-icon
              name="info"
              color="primary"
            />
          </template>
          {{ gettext('At least three quorum votes are recommended for reliable HA.') }}
        </q-banner>
        <div class="row q-col-gutter-lg">
          <q-input
            v-if="resourceAction === 'edit'"
            v-model="resourceForm.sid"
            dense
            readonly
            class="col-6 q-field--with-bottom"
            :label="gettext('VMID')"
          />
          <q-select
            v-else
            v-model="resourceForm.sid"
            dense
            options-dense
            emit-value
            map-options
            class="col-6 q-field--with-bottom"
            :options="
              addableResources.map((resource) => ({
                label: `${textValue(resource.type) === 'lxc' ? 'CT' : 'VM'} ${textValue(resource.vmid)}${textValue(resource.name) ? ` (${textValue(resource.name)})` : ''}`,
                value: textValue(resource.vmid),
              }))
            "
            :label="gettext('VMID')"
          />
          <q-select
            v-model="resourceForm.state"
            dense
            options-dense
            emit-value
            map-options
            class="col-6 q-field--with-bottom"
            :options="[
              { label: gettext('Started'), value: 'started' },
              { label: gettext('Stopped'), value: 'stopped' },
              { label: gettext('Disabled'), value: 'disabled' },
            ]"
            :label="gettext('Request State')"
          />
        </div>
        <div class="row q-col-gutter-lg">
          <q-input
            v-model.number="resourceForm.max_restart"
            dense
            type="number"
            min="0"
            max="10"
            class="col-6 q-field--with-bottom"
            :label="gettext('Max. Restart')"
          />
          <q-input
            v-model.number="resourceForm.max_relocate"
            dense
            type="number"
            min="0"
            max="10"
            class="col-6 q-field--with-bottom"
            :label="gettext('Max. Relocate')"
          />
        </div>
        <div class="row q-gutter-lg q-mb-sm">
          <q-checkbox
            v-model="resourceForm.failback"
            :label="gettext('Failback')"
          />
          <q-checkbox
            v-model="resourceForm.autoRebalance"
            :label="gettext('Auto-Rebalance')"
          />
        </div>
        <q-input
          v-model="resourceForm.comment"
          dense
          class="q-field--with-bottom"
          :label="gettext('Comment')"
        />
      </div>
      <template #foot>
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!resourceForm.sid || actionLoading"
          :label="gettext(resourceAction === 'add' ? 'Add' : 'Save')"
          @click="saveResource"
        />
      </template>
    </u-window>
  </q-dialog>
  <q-dialog
    v-model="crsDialogVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <u-window
      width="500px"
      :title="gettext('Cluster Resource Scheduling')"
    >
      <div class="u-border q-ma-sm q-pa-md">
        <q-select
          v-model="crsForm.ha"
          dense
          options-dense
          emit-value
          map-options
          class="q-field--with-bottom"
          :options="[
            { value: '__default__', label: `${gettext('Default')} (basic)` },
            { value: 'basic', label: gettext('Basic (Resource Count)') },
            { value: 'static', label: gettext('Static Load') },
            { value: 'dynamic', label: gettext('Dynamic Load') },
          ]"
          :label="gettext('Scheduling Mode')"
        />
        <div class="column q-gutter-sm q-mb-sm">
          <q-checkbox
            v-model="crsForm.rebalanceOnStart"
            :label="gettext('Rebalance on Start')"
          />
          <q-checkbox
            v-model="crsForm.autoRebalance"
            :disable="!canUseAutoRebalancing"
            :label="gettext('Automatic Rebalance')"
          />
        </div>
        <q-input
          v-model="crsForm.threshold"
          dense
          type="number"
          :disable="!crsForm.autoRebalance"
          class="q-field--with-bottom"
          :label="gettext('Imbalance Threshold (%)')"
          :placeholder="`${gettext('Default')} (30)`"
        />
        <q-select
          v-model="crsForm.method"
          dense
          options-dense
          emit-value
          map-options
          :disable="!crsForm.autoRebalance"
          class="q-field--with-bottom"
          :options="[
            { value: '__default__', label: `${gettext('Default')} (bruteforce)` },
            { value: 'bruteforce', label: 'Bruteforce' },
            { value: 'topsis', label: 'TOPSIS' },
          ]"
          :label="gettext('Rebalancing Method')"
        />
        <q-input
          v-model="crsForm.holdDuration"
          dense
          type="number"
          :disable="!crsForm.autoRebalance"
          class="q-field--with-bottom"
          :label="gettext('Hold Duration')"
          :placeholder="`${gettext('Default')} (3)`"
        />
        <q-input
          v-model="crsForm.margin"
          dense
          type="number"
          :disable="!crsForm.autoRebalance"
          class="q-field--with-bottom"
          :label="gettext('Minimum Imbalance Improvement (%)')"
          :placeholder="`${gettext('Default')} (10)`"
        />
      </div>
      <template #foot>
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Save')"
          @click="saveCrs"
        />
      </template>
    </u-window>
  </q-dialog>
</template>

<style scoped lang="scss">
.ha-section-title {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 8px 14px;
  color: #263445;
  font-size: 13px;
  font-weight: 600;
  background: #f8fafd;
  border-bottom: 1px solid #e4e8f0;
}
.ha-section-title::before {
  width: 3px;
  height: 14px;
  margin-right: 8px;
  content: '';
  background: #1976d2;
}
</style>
