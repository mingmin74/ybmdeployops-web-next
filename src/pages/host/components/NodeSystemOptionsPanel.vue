<script setup lang="ts">
import type { QForm } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import { getNodeConfig, updateNodeConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { objectToText, textValue } from '@/utils/pveFormat';
import { parsePropertyString, printPropertyString } from '@/utils/pvePropertyString';
import LocationOptionEditor from '@/pages/system/options/LocationOptionEditor.vue';

type OptionType = 'location' | 'startall-onboot-delay' | 'wakeonlan' | 'ballooning-target';
type Form = {
  startDelay: string;
  wakeonlan: string;
  ballooningTarget: string;
  location: PveRecord;
};

const props = defineProps<{ node: string }>();
const session = useSessionStore();
const options = shallowRef<PveRecord>({});
const activeType = shallowRef<OptionType>('location');
const form = ref<Form>({ startDelay: '', wakeonlan: '', ballooningTarget: '', location: {} });
const editorFormRef = ref<QForm>();
const loading = shallowRef(false);
const saving = shallowRef(false);
const canAudit = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Audit'])
);
const canModify = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify'])
);

const rows = computed(() => [
  {
    type: 'location' as const,
    label: gettext('Location'),
    icon: 'location_on',
    value:
      objectToText(parsePropertyString(options.value.location)) ||
      gettext('from Datacenter options'),
  },
  {
    type: 'startall-onboot-delay' as const,
    label: gettext('Start on boot delay'),
    icon: 'schedule',
    value:
      options.value['startall-onboot-delay'] === undefined
        ? gettext('Default')
        : `${textValue(options.value['startall-onboot-delay'])} ${
            textValue(options.value['startall-onboot-delay']) === '1'
              ? gettext('Second')
              : gettext('Seconds')
          }`,
  },
  {
    type: 'wakeonlan' as const,
    label: gettext('MAC address for Wake on LAN'),
    icon: 'power_settings_new',
    value:
      options.value.wakeonlan === undefined ? gettext('None') : textValue(options.value.wakeonlan),
  },
  {
    type: 'ballooning-target' as const,
    label: gettext('RAM usage target for ballooning'),
    icon: 'memory',
    value:
      options.value['ballooning-target'] === undefined
        ? gettext('Default (80%)')
        : `${textValue(options.value['ballooning-target'])}%`,
  },
]);

const activeLabel = computed(
  () => rows.value.find((row) => row.type === activeType.value)?.label || ''
);
const valid = computed(() => {
  if (activeType.value === 'startall-onboot-delay') {
    const value = form.value.startDelay;
    return (
      !value || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 300)
    );
  }
  if (activeType.value === 'ballooning-target') {
    const value = form.value.ballooningTarget;
    return (
      !value || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
    );
  }
  if (activeType.value === 'wakeonlan') {
    return !form.value.wakeonlan || /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(form.value.wakeonlan);
  }
  return true;
});
const dirty = computed(() => {
  if (activeType.value === 'location') {
    return (
      printPropertyString(form.value.location) !==
      printPropertyString(parsePropertyString(options.value.location))
    );
  }
  if (activeType.value === 'startall-onboot-delay') {
    return form.value.startDelay.trim() !== textValue(options.value['startall-onboot-delay']);
  }
  if (activeType.value === 'wakeonlan') {
    return form.value.wakeonlan.trim() !== textValue(options.value.wakeonlan);
  }
  return form.value.ballooningTarget.trim() !== textValue(options.value['ballooning-target']);
});

function syncForm() {
  form.value = {
    startDelay: textValue(options.value['startall-onboot-delay']),
    wakeonlan: textValue(options.value.wakeonlan),
    ballooningTarget: textValue(options.value['ballooning-target']),
    location: parsePropertyString(options.value.location),
  };
}

let loadId = 0;
async function load() {
  const node = props.node;
  const id = ++loadId;
  if (!node || !canAudit.value) {
    options.value = {};
    syncForm();
    return;
  }
  loading.value = true;
  try {
    const response = await getNodeConfig(node);
    if (id === loadId && node === props.node) {
      options.value = response.data || {};
      syncForm();
    }
  } finally {
    if (id === loadId) loading.value = false;
  }
}

function selectOption(type: OptionType) {
  if (type === activeType.value) return;
  activeType.value = type;
  syncForm();
  editorFormRef.value?.resetValidation();
}

function buildSubmitData() {
  const data: PveRecord = {};
  if (activeType.value === 'location') {
    const value = printPropertyString(form.value.location);
    data[value ? 'location' : 'delete'] = value || 'location';
    return data;
  }
  const key = activeType.value;
  const value =
    key === 'startall-onboot-delay'
      ? form.value.startDelay.trim()
      : key === 'wakeonlan'
        ? form.value.wakeonlan.trim()
        : form.value.ballooningTarget.trim();
  data[value ? key : 'delete'] = value || key;
  return data;
}

async function save() {
  if (!props.node || !canModify.value || !dirty.value || !valid.value) return;
  const formValid = await editorFormRef.value?.validate();
  if (formValid === false) return;
  saving.value = true;
  try {
    await updateNodeConfig(props.node, buildSubmitData());
    await load();
  } finally {
    saving.value = false;
  }
}

watch([() => props.node, canAudit], () => void load(), { immediate: true });
</script>

<template>
  <div
    v-if="canAudit"
    class="node-options row"
  >
    <div class="col-7 node-options__list-column">
      <div class="u-border node-options__panel node-options__list">
        <div
          v-for="row in rows"
          :key="row.type"
          class="node-options__row cursor-pointer q-px-sm row"
          :class="{ 'node-options__row--active': activeType === row.type }"
          @click="selectOption(row.type)"
        >
          <div class="col-5 node-options__label">
            <q-icon
              :name="row.icon"
              size="16px"
              class="q-mr-xs"
            />
            {{ row.label }}:
          </div>
          <div class="col-7 node-options__value">{{ row.value }}</div>
        </div>
      </div>
    </div>

    <div class="col-5 node-options__editor-column">
      <div class="u-border u-hidden-error node-options__panel node-options__editor">
        <q-form
          ref="editorFormRef"
          class="q-pa-sm u-dense"
          @submit.prevent="save"
        >
          <div class="row items-center no-wrap node-options__titlebar">
            <div class="node-options__title">{{ activeLabel }}</div>
            <q-space />
            <q-btn
              v-if="canModify"
              no-caps
              flat
              size="12px"
              class="bg-primary text-grey-1 u-button"
              type="submit"
              :disable="!dirty || !valid || saving"
              :loading="saving"
              :label="gettext('Save')"
            />
          </div>

          <div v-if="canModify">
            <LocationOptionEditor
              v-if="activeType === 'location'"
              v-model="form.location"
              :show-optional-hint="false"
            />
            <q-input
              v-else-if="activeType === 'startall-onboot-delay'"
              v-model="form.startDelay"
              dense
              type="number"
              min="0"
              max="300"
              :label="gettext('Start on boot delay')"
              :rules="[
                (value) =>
                  !value ||
                  (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 300) ||
                  gettext('Value must be between 0 and 300'),
              ]"
            />
            <q-input
              v-else-if="activeType === 'wakeonlan'"
              v-model="form.wakeonlan"
              dense
              :label="gettext('MAC address for Wake on LAN')"
              :rules="[
                (value) =>
                  !value ||
                  /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value) ||
                  gettext('Invalid MAC address'),
              ]"
            />
            <q-input
              v-else
              v-model="form.ballooningTarget"
              dense
              type="number"
              min="0"
              max="100"
              suffix="%"
              :label="gettext('RAM usage target for ballooning')"
              :rules="[
                (value) =>
                  !value ||
                  (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100) ||
                  gettext('Value must be between 0 and 100'),
              ]"
            />
          </div>
          <div
            v-else
            class="text-grey-7 q-pa-sm"
          >
            {{ gettext('No permission to modify this option') }}
          </div>
        </q-form>
      </div>
    </div>
    <q-inner-loading :showing="loading" />
  </div>
  <div
    v-else
    class="text-grey-7"
  >
    {{ gettext('No Data') }}
  </div>
</template>

<style scoped>
.node-options {
  position: relative;
  min-height: 320px;
  background: #fff;
}
.node-options__list-column,
.node-options__editor-column {
  display: flex;
  overflow: hidden;
}
.node-options__panel {
  flex: 1 1 auto;
  background: #fff;
  font-size: 13px;
}
.node-options__list {
  border-right: 0;
}
.node-options__editor {
  border-left-color: #d7dce2;
}
.node-options__row {
  min-height: 40px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}
.node-options__row:last-child {
  border-bottom: 0;
}
.node-options__row:hover {
  background: #f4f8fc;
}
.node-options__row--active {
  background: #e6f1fb;
  color: #1f4f78;
}
.node-options__label {
  min-width: 0;
  color: #333;
}
.node-options__value {
  min-width: 0;
  padding: 6px 0;
  overflow-wrap: anywhere;
  color: #666;
  line-height: 18px;
}
.node-options__row--active .node-options__label,
.node-options__row--active .node-options__value {
  color: #1f4f78;
}
.node-options__titlebar {
  min-height: 38px;
  margin: -4px -4px 10px;
  padding: 4px 8px;
  border-bottom: 1px solid #d7dce2;
  background: #f5f7fa;
}
.node-options__title {
  color: #334155;
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .node-options__row {
    transition: none;
  }
}
</style>
