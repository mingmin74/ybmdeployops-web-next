<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { getNodeConfig, updateNodeConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { objectToText, textValue } from '@/utils/pveFormat';
import { parsePropertyString, printPropertyString } from '@/utils/pvePropertyString';
import LocationOptionEditor from '@/pages/system/options/LocationOptionEditor.vue';
type Form = {
  startDelay: string;
  wakeonlan: string;
  ballooningTarget: string;
  location: PveRecord;
};
const props = defineProps<{ node: string }>();
const session = useSessionStore();
const options = shallowRef<PveRecord>({});
const form = ref<Form>({ startDelay: '', wakeonlan: '', ballooningTarget: '', location: {} });
const visible = shallowRef(false);
const saving = shallowRef(false);
const canAudit = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Audit'])
);
const canModify = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify'])
);
const valid = computed(
  () =>
    [form.value.startDelay, form.value.ballooningTarget].every(
      (v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 0)
    ) &&
    (!form.value.startDelay || Number(form.value.startDelay) <= 300) &&
    (!form.value.ballooningTarget || Number(form.value.ballooningTarget) <= 100) &&
    (!form.value.wakeonlan || /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(form.value.wakeonlan))
);
const rows = computed(() => [
  {
    label: gettext('Location'),
    value:
      objectToText(parsePropertyString(options.value.location)) ||
      gettext('from Datacenter options'),
  },
  {
    label: gettext('Start on boot delay'),
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
    label: gettext('MAC address for Wake on LAN'),
    value:
      options.value.wakeonlan === undefined ? gettext('None') : textValue(options.value.wakeonlan),
  },
  {
    label: gettext('RAM usage target for ballooning'),
    value:
      options.value['ballooning-target'] === undefined
        ? gettext('Default (80%)')
        : `${textValue(options.value['ballooning-target'])}%`,
  },
]);
let loadId = 0;
async function load() {
  const node = props.node,
    id = ++loadId;
  if (!node || !canAudit.value) {
    options.value = {};
    return;
  }
  const response = await getNodeConfig(node);
  if (id === loadId && node === props.node) options.value = response.data || {};
}
function open() {
  form.value = {
    startDelay: textValue(options.value['startall-onboot-delay']),
    wakeonlan: textValue(options.value.wakeonlan),
    ballooningTarget: textValue(options.value['ballooning-target']),
    location: parsePropertyString(options.value.location),
  };
  visible.value = true;
}
function payload() {
  const result: PveRecord = {};
  const deleted: string[] = [];
  for (const [key, draft] of [
    ['startall-onboot-delay', form.value.startDelay],
    ['wakeonlan', form.value.wakeonlan],
    ['ballooning-target', form.value.ballooningTarget],
  ] as const) {
    const value = draft.trim();
    if (value === textValue(options.value[key])) continue;
    if (value) result[key] = value;
    else if (options.value[key] !== undefined) deleted.push(key);
  }
  const location = printPropertyString(form.value.location);
  if (location !== printPropertyString(parsePropertyString(options.value.location))) {
    if (location) result.location = location;
    else if (options.value.location !== undefined) deleted.push('location');
  }
  if (deleted.length) result.delete = deleted.join(',');
  return result;
}
async function save() {
  if (!props.node || !valid.value) return;
  const data = payload();
  if (!Object.keys(data).length) {
    visible.value = false;
    return;
  }
  saving.value = true;
  try {
    await updateNodeConfig(props.node, data);
    visible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}
watch(
  [() => props.node, canAudit],
  () => {
    visible.value = false;
    void load();
  },
  { immediate: true }
);
</script>
<template>
  <template v-if="canAudit">
    <div
      v-if="canModify"
      class="row items-center q-mb-sm"
    >
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :label="gettext('Edit')"
        @click="open"
      />
    </div>
    <div
      v-for="item in rows"
      :key="item.label"
      class="system-info-row"
    >
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </div>
  </template>
  <div
    v-else
    class="text-grey-7"
  >
    {{ gettext('No Data') }}
  </div>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Options')"
      width="620px"
      :loading="saving"
    >
      <div class="q-pa-md u-dense column q-gutter-md">
        <LocationOptionEditor v-model="form.location" />
        <q-input
          v-model="form.startDelay"
          dense
          outlined
          type="number"
          min="0"
          max="300"
          :label="gettext('Start on boot delay')"
        />
        <q-input
          v-model="form.wakeonlan"
          dense
          outlined
          :label="gettext('MAC address for Wake on LAN')"
        />
        <q-input
          v-model="form.ballooningTarget"
          dense
          outlined
          type="number"
          min="0"
          max="100"
          suffix="%"
          :label="gettext('RAM usage target for ballooning')"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :disable="saving"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!valid || saving"
          :label="gettext('Save')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
<style scoped>
.system-info-row {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  min-height: 44px;
  padding: 11px 0;
  border-bottom: 1px solid #eef1f6;
  font-size: 12px;
}
.system-info-row span {
  color: #666;
}
.system-info-row strong {
  color: #333;
  font-weight: 600;
  text-align: right;
}
</style>
