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
import HaDisarmDialog from '@/pages/computer/ha/HaDisarmDialog.vue';

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
  // The currently connected PVE API schema does not support this newer HA resource option.
  // autoRebalance: true,
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
  // {
  //   name: 'auto-rebalance',
  //   label: gettext('Auto-Rebalance'),
  //   field: (row) => (row['auto-rebalance'] === false ? gettext('No') : gettext('Yes')),
  //   align: 'left',
  // },
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

async function loadStatus(silent = false) {
  if (!silent) loading.value = true;
  try {
    const nextRows = (await getHaStatus()).data || [];
    if (JSON.stringify(rows.value) !== JSON.stringify(nextRows)) rows.value = nextRows;
    if (
      pendingArmState.value &&
      rows.value.find((row) => row.type === 'fencing')?.['armed-state'] === pendingArmState.value
    )
      pendingArmState.value = undefined;
  } finally {
    if (!silent) loading.value = false;
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
  $q.dialog({
    component: HaDisarmDialog,
    componentProps: { mode },
  }).onOk(() => {
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
  });
}
function resetResourceForm() {
  Object.assign(resourceForm, {
    sid: '',
    state: 'started',
    max_restart: 1,
    max_relocate: 1,
    failback: true,
    // autoRebalance: true,
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
      // autoRebalance: resource['auto-rebalance'] !== false,
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
      // 'auto-rebalance': resourceForm.autoRebalance ? 1 : 0,
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
  refreshTimer = window.setInterval(() => void loadStatus(true), 3000);
});
onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <div class="q-ma-md ha-module">
    <q-card
      flat
      bordered
      class="ha-shell no-border-radius"
    >
      <q-tabs
        v-model="activeTab"
        dense
        no-caps
        class="ha-tabs text-grey"
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
          class="ha-tab-panel ha-tab-panel--status"
        >
          <q-card
            flat
            bordered
            class="ha-section no-border-radius"
          >
            <div class="ha-status-header">
              <h2 class="ha-section-title ha-status-title">
                {{ gettext('Status') }}
              </h2>
              <div class="ha-status-actions">
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
            </div>
            <q-table
              class="ha-table"
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
            class="ha-section no-border-radius"
          >
            <q-table
              class="ha-table ha-resource-table"
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
                <h2 class="ha-section-heading ha-resource-heading">
                  {{ gettext('Resources') }}
                  <span class="ha-count">{{ resourceRows.length }}</span>
                </h2>
                <q-space />
                <div class="ha-resource-actions">
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Add')"
                    @click="openResource('add')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
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
                </div>
              </template>
            </q-table>
          </q-card>
        </q-tab-panel>
        <q-tab-panel
          name="rules"
          class="ha-tab-panel ha-tab-panel--rules"
        >
          <q-card
            flat
            bordered
            class="ha-section no-border-radius"
          >
            <q-table
              class="ha-table ha-rule-table"
              flat
              row-key="rule"
              table-header-class="u-table-header"
              :rows="nodeRules"
              :columns="nodeRuleColumns"
              :loading="loading"
              selection="single"
              v-model:selected="selectedNodeRules"
              :rows-per-page-options="[0]"
              :hide-bottom="nodeRules.length > 0"
              :no-data-label="gettext('No HA Node Affinity rules configured.')"
            >
              <template #top>
                <h2 class="ha-section-heading ha-rule-heading">
                  {{ gettext('HA Node Affinity Rules') }}
                  <span class="ha-count">{{ nodeRules.length }}</span>
                </h2>
                <q-space />
                <div class="ha-rule-actions">
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
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
                </div>
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
                    size="sm"
                    icon="delete"
                    color="red"
                    class="q-ml-sm u-button"
                    :aria-label="gettext('Delete')"
                    @click="removeRule(props.row)"
                  />
                </q-td>
              </template>
            </q-table>
          </q-card>
          <q-card
            flat
            bordered
            class="ha-section no-border-radius"
          >
            <q-table
              class="ha-table ha-rule-table"
              flat
              row-key="rule"
              table-header-class="u-table-header"
              :rows="resourceRules"
              :columns="resourceRuleColumns"
              :loading="loading"
              selection="single"
              v-model:selected="selectedResourceRules"
              :rows-per-page-options="[0]"
              :hide-bottom="resourceRules.length > 0"
              :no-data-label="gettext('No HA Resource Affinity rules configured.')"
            >
              <template #top>
                <h2 class="ha-section-heading ha-rule-heading">
                  {{ gettext('HA Resource Affinity Rules') }}
                  <span class="ha-count">{{ resourceRules.length }}</span>
                </h2>
                <q-space />
                <div class="ha-rule-actions">
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
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
                </div>
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
                    size="sm"
                    icon="delete"
                    color="red"
                    class="q-ml-sm u-button"
                    :aria-label="gettext('Delete')"
                    @click="removeRule(props.row)"
                  />
                </q-td>
              </template>
            </q-table>
          </q-card>
        </q-tab-panel>
        <q-tab-panel
          name="fencing"
          class="ha-tab-panel"
        >
          <section class="ha-fencing">
            <q-icon
              name="security"
              size="28px"
              color="primary"
            />
            <div>
              <h2 class="ha-section-heading">{{ gettext('Fencing') }}</h2>
              <p>{{ gettext('Use watchdog based fencing.') }}</p>
            </div>
          </section>
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
      width="680px"
      :title="`${gettext(resourceAction === 'add' ? 'Add' : 'Edit')}: ${gettext('HA Resource')}`"
    >
      <div class="ha-resource-form">
        <q-banner
          v-if="resourceAction === 'add'"
          dense
          class="ha-resource-notice"
        >
          <template #avatar>
            <q-icon
              name="info"
              color="primary"
            />
          </template>
          {{ gettext('At least three quorum votes are recommended for reliable HA.') }}
        </q-banner>
        <div class="ha-resource-grid">
          <q-input
            v-if="resourceAction === 'edit'"
            v-model="resourceForm.sid"
            dense
            readonly
            class="q-field--with-bottom"
            :label="gettext('VMID')"
          />
          <q-select
            v-else
            v-model="resourceForm.sid"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="
              addableResources.map((resource) => ({
                label: `${textValue(resource.type) === 'lxc' ? 'CT' : 'VM'} ${textValue(
                  resource.vmid
                )}${textValue(resource.name) ? ` (${textValue(resource.name)})` : ''}`,
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
            class="q-field--with-bottom"
            :options="[
              { label: gettext('Started'), value: 'started' },
              { label: gettext('Stopped'), value: 'stopped' },
              { label: gettext('Disabled'), value: 'disabled' },
            ]"
            :label="gettext('Request State')"
          />
          <q-input
            v-model.number="resourceForm.max_restart"
            dense
            type="number"
            min="0"
            max="10"
            class="q-field--with-bottom"
            :label="gettext('Max. Restart')"
          />
          <q-input
            v-model.number="resourceForm.max_relocate"
            dense
            type="number"
            min="0"
            max="10"
            class="q-field--with-bottom"
            :label="gettext('Max. Relocate')"
          />
        </div>
        <div class="ha-resource-options">
          <q-checkbox
            v-model="resourceForm.failback"
            dense
            right-label
            color="primary"
            :label="gettext('Failback')"
          />
          <!--
          The current backend rejects the newer `auto-rebalance` HA resource property.
          <q-checkbox
            v-model="resourceForm.autoRebalance"
            dense
            right-label
            color="primary"
            :label="gettext('Auto-Rebalance')"
          />
          -->
        </div>
        <div class="ha-resource-comment">
          <q-input
            v-model="resourceForm.comment"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
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
      width="680px"
      :title="gettext('Cluster Resource Scheduling')"
    >
      <div class="ha-crs-form">
        <section class="ha-crs-section">
          <h3 class="ha-crs-section-title">{{ gettext('Basic Settings') }}</h3>
          <q-select
            v-model="crsForm.ha"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="[
              { value: '__default__', label: gettext('Default (basic)') },
              { value: 'basic', label: gettext('Basic (Resource Count)') },
              { value: 'static', label: gettext('Static Load') },
              { value: 'dynamic', label: gettext('Dynamic Load') },
            ]"
            :label="gettext('Scheduling Mode')"
          />
          <q-checkbox
            v-model="crsForm.rebalanceOnStart"
            dense
            right-label
            color="primary"
            class="ha-crs-checkbox"
            :label="gettext('Rebalance on Start')"
          />
        </section>
        <section class="ha-crs-section ha-crs-section--advanced">
          <h3 class="ha-crs-section-title">{{ gettext('Advanced settings') }}</h3>
          <q-checkbox
            v-model="crsForm.autoRebalance"
            dense
            right-label
            color="primary"
            class="ha-crs-checkbox"
            :disable="!canUseAutoRebalancing"
            :label="gettext('Automatic Rebalance')"
          />
          <div class="ha-crs-grid">
            <q-input
              v-model="crsForm.threshold"
              dense
              type="number"
              :disable="!crsForm.autoRebalance"
              class="q-field--with-bottom"
              :label="gettext('Imbalance Threshold (%)')"
              :placeholder="gettext('Default (30)')"
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
                { value: '__default__', label: gettext('Default (bruteforce)') },
                { value: 'bruteforce', label: gettext('Bruteforce') },
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
              :placeholder="gettext('Default (3)')"
            />
            <q-input
              v-model="crsForm.margin"
              dense
              type="number"
              :disable="!crsForm.autoRebalance"
              class="q-field--with-bottom"
              :label="gettext('Minimum Imbalance Improvement (%)')"
              :placeholder="gettext('Default (10)')"
            />
          </div>
        </section>
      </div>
      <template #foot>
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button u-border-button"
          :label="gettext('Cancel')"
          @click="crsDialogVisible = false"
        />
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
.ha-resource-form {
  padding: 20px 24px 24px;
  color: #333;
  font-size: 12px;
}
.ha-resource-notice {
  margin-bottom: 20px;
  padding: 10px 12px;
  border-left: 3px solid #1976d2;
  background: #e6f1fc;
  color: #333;
  font-size: 12px;
  line-height: 1.6;
}
.ha-resource-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 24px;
}
.ha-resource-grid > * {
  min-width: 0;
}
.ha-resource-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin-top: 8px;
}
.ha-resource-comment {
  margin-top: 16px;
}
.ha-crs-form {
  padding: 20px 24px 24px;
}
.ha-crs-section + .ha-crs-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #dfe1e6;
}
.ha-crs-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  color: #333;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.ha-crs-section-title::before {
  content: '';
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: #1976d2;
}
.ha-crs-checkbox {
  margin-top: 4px;
}
.ha-crs-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 24px;
  margin-top: 12px;
}
.ha-module {
  min-width: 0;
}
.ha-shell {
  border-color: #dfe1e6;
}
.ha-tabs {
  padding: 0 8px;
  background: #f8fafd;
}
.ha-tabs :deep(.q-tab) {
  min-height: 42px;
  padding: 0 20px;
}
.ha-tabs :deep(.q-tab__label) {
  font-size: 13px;
}
.ha-tabs :deep(.q-tab--active) {
  background: #e6f1fc;
}
.ha-tab-panel {
  padding: 16px;
}
.ha-tab-panel--status,
.ha-tab-panel--rules {
  display: grid;
  gap: 16px;
  background: #f7f9fc;
}
.ha-status-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #dfe1e6;
}
.ha-status-actions,
.ha-resource-actions,
.ha-rule-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ha-status-title {
  min-height: 28px;
  padding: 0;
  border-bottom: 0;
}
.ha-status-title::before,
.ha-resource-heading::before,
.ha-rule-heading::before {
  content: '';
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: #1976d2;
}
.ha-section {
  min-width: 0;
  overflow: hidden;
  border-color: #dfe1e6;
}
.ha-section-title,
.ha-section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #333;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.ha-section-title {
  // min-height: 48px;
  // padding: 10px 14px;
  // border-bottom: 1px solid #dfe1e6;
}
.ha-count {
  padding: 0 6px;
  color: #666;
  background: #f2f5fc;
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.ha-table :deep(.q-table__top) {
  gap: 8px;
  min-height: 48px;
  padding: 10px 14px;
  border-bottom: 1px solid #dfe1e6;
}
.ha-table :deep(.q-table__top .q-btn) {
  margin-right: 0;
}
.ha-table :deep(.q-table__bottom) {
  min-height: 36px;
  padding: 6px 14px;
  color: #666;
}
.ha-table :deep(tbody tr.selected td) {
  background: #e6f1fc;
}
.ha-resource-table :deep(.q-table__middle) {
  max-height: min(480px, 55vh);
  overflow: auto;
}
.ha-rule-table :deep(.q-table__middle) {
  max-height: min(420px, 50vh);
  overflow: auto;
}
.ha-resource-table :deep(thead tr th),
.ha-rule-table :deep(thead tr th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f2f5fc;
}
.ha-fencing {
  background: #f2f5fc;
}
.ha-fencing {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px;
  border: 1px solid #dfe1e6;
}
.ha-fencing p {
  margin: 6px 0 0;
  color: #666;
  font-size: 13px;
}
@media (max-width: 600px) {
  .ha-resource-form {
    padding: 16px;
  }
  .ha-resource-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .ha-crs-form {
    padding: 16px;
  }
  .ha-crs-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .ha-module {
    margin: 8px;
  }
  .ha-tab-panel {
    padding: 10px;
  }
  .ha-table :deep(.q-table__top .ha-section-heading) {
    flex-basis: 100%;
  }
}
</style>
