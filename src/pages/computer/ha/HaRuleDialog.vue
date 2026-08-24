<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { getHaRule, createHaRule, updateHaRule } from '@/api/ha';
import { getClusterResources, getNodes, type PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{
  type: 'node-affinity' | 'resource-affinity';
  rule?: PveRecord | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();

const loading = shallowRef(false);
const submitting = shallowRef(false);
const resources = shallowRef<PveRecord[]>([]);
const nodes = shallowRef<PveRecord[]>([]);
type RuleForm = {
  enabled: boolean;
  resources: string[];
  strict: boolean;
  affinity: string;
  nodes: string[];
  priorities: Record<string, string>;
  comment: string;
};
const form = reactive<RuleForm>({
  enabled: true,
  resources: [],
  strict: false,
  affinity: 'positive',
  nodes: [],
  priorities: {},
  comment: '',
});

const isAdd = computed(() => !props.rule);
const title = computed(
  () =>
    `${gettext(isAdd.value ? 'Add' : 'Edit')}: ${gettext(
      props.type === 'node-affinity' ? 'HA Node Affinity' : 'HA Resource Affinity'
    )}`
);
const resourceOptions = computed(() =>
  resources.value.map((resource) => {
    const type = textValue(resource.type);
    const vmid = textValue(resource.vmid);
    const name = textValue(resource.name);
    return {
      label: `${type === 'lxc' ? 'CT' : 'VM'} ${vmid}${name ? ` (${name})` : ''}`,
      value: vmid,
    };
  })
);
const nodeColumns: QTableColumn<PveRecord>[] = [
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left' },
  { name: 'priority', label: gettext('Priority'), field: 'priority', align: 'left' },
];
const selectedNodes = computed(() =>
  nodes.value.filter((node) => form.nodes.includes(textValue(node.node)))
);

function resetForm() {
  Object.assign(form, {
    enabled: true,
    resources: [],
    strict: false,
    affinity: 'positive',
    nodes: [],
    priorities: {},
    comment: '',
  });
}

function resourceType(vmid: string) {
  const resource = resources.value.find((item) => textValue(item.vmid) === vmid);
  return textValue(resource?.type) === 'lxc' ? 'ct' : 'vm';
}

function parseNodes(value: string) {
  const priorities: Record<string, string> = {};
  const selected = value
    .split(',')
    .filter(Boolean)
    .map((entry) => {
      const [node = '', priority] = entry.split(':');
      if (priority) priorities[node] = priority;
      return node;
    });
  form.nodes = selected;
  form.priorities = priorities;
}

async function open() {
  resetForm();
  loading.value = true;
  try {
    const [resourceResponse, nodeResponse, ruleResponse] = await Promise.all([
      getClusterResources(),
      getNodes(),
      props.rule ? getHaRule(textValue(props.rule.rule)) : Promise.resolve(undefined),
    ]);
    resources.value = (resourceResponse.data || []).filter(
      (item) =>
        ['qemu', 'lxc'].includes(textValue(item.type)) && textValue(item.hastate) !== 'unmanaged'
    );
    nodes.value = (nodeResponse.data || [])
      .slice()
      .sort((a, b) => textValue(a.node).localeCompare(textValue(b.node)));
    const rule = ruleResponse?.data;
    if (rule) {
      form.enabled = !rule.disable;
      form.resources = textValue(rule.resources)
        .split(',')
        .filter(Boolean)
        .map((resource) => resource.split(':')[1] || '')
        .filter(Boolean);
      form.strict = Boolean(rule.strict);
      form.affinity = textValue(rule.affinity, 'positive');
      parseNodes(textValue(rule.nodes));
      form.comment = textValue(rule.comment);
    }
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.resources.length || (props.type === 'node-affinity' && !form.nodes.length)) return;
  submitting.value = true;
  try {
    const data: PveRecord = {
      type: props.type,
      resources: form.resources
        .map(resourceType)
        .map((type, index) => `${type}:${form.resources[index]}`),
      affinity: form.affinity,
      comment: form.comment,
    };
    const deleteFields: string[] = [];
    if (!form.enabled) data.disable = 1;
    else if (!isAdd.value) deleteFields.push('disable');
    if (props.type === 'node-affinity') {
      data.nodes = form.nodes
        .map((node) =>
          form.affinity === 'positive' && form.priorities[node]
            ? `${node}:${form.priorities[node]}`
            : node
        )
        .join(',');
      if (form.strict) data.strict = 1;
      else if (!isAdd.value) deleteFields.push('strict');
    }
    if (deleteFields.length) data.delete = deleteFields.join(',');
    if (isAdd.value) {
      data.rule = `ha-rule-${crypto.randomUUID().slice(0, 13)}`;
      await createHaRule(data);
    } else {
      await updateHaRule(textValue(props.rule?.rule), data);
    }
    visible.value = false;
    emit('saved');
  } finally {
    submitting.value = false;
  }
}

watch(visible, (opened) => {
  if (opened) void open();
});
watch(
  () => form.affinity,
  (affinity, previous) => {
    if (props.type !== 'node-affinity' || !previous || affinity === previous) return;
    form.nodes = nodes.value
      .map((node) => textValue(node.node))
      .filter((node) => !form.nodes.includes(node));
  }
);
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <u-window
      width="680px"
      :title="title"
    >
      <div class="u-border q-ma-sm q-pa-md">
        <q-inner-loading :showing="loading" />
        <q-checkbox
          v-model="form.enabled"
          dense
          right-label
          color="primary"
          :label="gettext('Enable')"
        />
        <q-select
          v-model="form.resources"
          dense
          options-dense
          emit-value
          map-options
          multiple
          use-chips
          class="q-field--with-bottom"
          :options="resourceOptions"
          :label="gettext('HA Resources')"
        />
        <template v-if="type === 'node-affinity'">
          <div class="row q-col-gutter-lg">
            <q-checkbox
              v-model="form.strict"
              dense
              right-label
              color="primary"
              class="col-6"
              :label="gettext('Strict')"
            />
            <q-select
              v-model="form.affinity"
              dense
              options-dense
              emit-value
              map-options
              class="col-6 q-field--with-bottom"
              :options="[
                { label: `${gettext('Prefer Nodes')} (positive)`, value: 'positive' },
                { label: `${gettext('Avoid Nodes')} (negative)`, value: 'negative' },
              ]"
              :label="gettext('Affinity')"
            />
          </div>
          <q-select
            v-model="form.nodes"
            dense
            options-dense
            emit-value
            map-options
            multiple
            use-chips
            class="q-field--with-bottom"
            :options="
              nodes.map((node) => ({ label: textValue(node.node), value: textValue(node.node) }))
            "
            :label="gettext('Nodes')"
          />
          <q-table
            v-if="form.affinity === 'positive' && selectedNodes.length"
            flat
            bordered
            row-key="node"
            table-header-class="u-table-header"
            :rows="selectedNodes"
            :columns="nodeColumns"
            :rows-per-page-options="[0]"
            hide-pagination
          >
            <template #body-cell-priority="scope">
              <q-td :props="scope">
                <q-input
                  v-model="form.priorities[textValue(scope.row.node)]"
                  dense
                  type="number"
                  min="0"
                  max="1000"
                />
              </q-td>
            </template>
          </q-table>
        </template>
        <q-select
          v-else
          v-model="form.affinity"
          dense
          options-dense
          emit-value
          map-options
          class="q-field--with-bottom"
          :options="[
            { label: `${gettext('Keep Together')} (positive)`, value: 'positive' },
            { label: `${gettext('Keep Separate')} (negative)`, value: 'negative' },
          ]"
          :label="gettext('Affinity')"
        />
        <q-input
          v-model="form.comment"
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
          :disable="
            submitting || !form.resources.length || (type === 'node-affinity' && !form.nodes.length)
          "
          :label="gettext(isAdd ? 'Add' : 'Save')"
          @click="save"
        />
      </template>
    </u-window>
  </q-dialog>
</template>
