<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { getNodeTime, updateNodeTime, type PveNodeTime } from '@/api/host';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
const props = defineProps<{ node: string }>();
const session = useSessionStore();
const time = shallowRef<PveNodeTime>({});
const draft = shallowRef('');
const filtered = shallowRef<string[]>([]);
const visible = shallowRef(false);
const saving = shallowRef(false);
const canAudit = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Audit'])
);
const canModify = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify'])
);
const zones = computed(() => {
  const values = Intl.supportedValuesOf?.('timeZone') || [];
  return time.value.timezone && !values.includes(time.value.timezone)
    ? [time.value.timezone, ...values]
    : values;
});
let loadId = 0;
function format(timestamp?: number, timezone?: string) {
  if (!timestamp) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(timestamp * 1000))
      .replace(',', '');
  } catch {
    return '-';
  }
}
const rows = computed(() => [
  { label: gettext('Timezone'), value: time.value.timezone || '-' },
  { label: gettext('Server Time'), value: format(time.value.time, time.value.timezone) },
]);
async function load() {
  const node = props.node,
    id = ++loadId;
  if (!node || !canAudit.value) {
    time.value = {};
    return;
  }
  const response = await getNodeTime(node);
  if (id === loadId && node === props.node) time.value = response.data || {};
}
function open() {
  draft.value = time.value.timezone || '';
  filtered.value = zones.value;
  visible.value = true;
}
function filter(value: string, update: (cb: () => void) => void) {
  update(
    () =>
      (filtered.value = zones.value.filter((zone) =>
        zone.toLocaleLowerCase().includes(value.toLocaleLowerCase())
      ))
  );
}
async function save() {
  if (!props.node || !draft.value || draft.value === time.value.timezone) return;
  saving.value = true;
  try {
    await updateNodeTime(props.node, { timezone: draft.value });
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
      :title="gettext('Time')"
      width="480px"
      :loading="saving"
    >
      <div class="q-pa-md u-dense">
        <q-select
          v-model="draft"
          dense
          outlined
          use-input
          input-debounce="0"
          :label="gettext('Timezone')"
          :options="filtered"
          @filter="filter"
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
          :disable="!draft || draft === time.timezone || saving"
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
