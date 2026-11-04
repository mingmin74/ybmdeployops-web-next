<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { getNodeTime, updateNodeTime, type PveNodeTime } from '@/api/host';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
const props = defineProps<{ node: string; active: boolean }>();
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
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function format(timestamp?: number, timezone = 'UTC') {
  if (!timestamp) return '-';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(timestamp * 1000));
  } catch {
    return '-';
  }
}
const rows = computed(() => [
  { label: gettext('Time zone'), value: time.value.timezone || '-', icon: 'public' },
  {
    label: gettext('Server time'),
    value: time.value.localtime
      ? format(time.value.localtime)
      : format(time.value.time, time.value.timezone),
    icon: 'schedule',
  },
]);
function stopRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  loadId += 1;
}
async function load() {
  const node = props.node,
    id = ++loadId;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  if (!node || !canAudit.value || !props.active) return;
  try {
    const response = await getNodeTime(node);
    if (id !== loadId || node !== props.node || !props.active) return;
    time.value = response.data || {};
    refreshTimer = setTimeout(() => void load(), 1000);
  } catch {
    // The request helper reports the error; retry when this panel is activated again.
  }
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
  [() => props.node, () => props.active, canAudit],
  () => {
    stopRefresh();
    visible.value = false;
    time.value = {};
    if (props.active && canAudit.value) void load();
  },
  { immediate: true }
);
onBeforeUnmount(stopRefresh);
</script>
<template>
  <section
    v-if="canAudit"
    class="time-panel u-border"
  >
    <header class="time-panel__header row items-center no-wrap">
      <div class="row items-center no-wrap">
        <q-icon
          name="access_time"
          size="16px"
          color="primary"
        />
        <span>{{ gettext('Time') }}</span>
      </div>
      <q-space />
      <q-btn
        v-if="canModify"
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :label="gettext('Edit')"
        @click="open"
      />
    </header>

    <div class="time-panel__body">
      <div
        v-for="item in rows"
        :key="item.label"
        class="time-panel__row"
      >
        <div class="time-panel__label row items-center no-wrap">
          <q-icon
            :name="item.icon"
            size="16px"
          />
          <span>{{ item.label }}</span>
        </div>
        <strong>{{ item.value }}</strong>
      </div>
    </div>
  </section>
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
      <q-form
        class="u-border q-ma-sm q-pa-md u-dense"
        @submit.prevent="save"
      >
        <q-select
          v-model="draft"
          dense
          options-dense
          use-input
          input-debounce="0"
          class="q-field--with-bottom"
          :label="gettext('Time zone')"
          :options="filtered"
          @filter="filter"
        />
      </q-form>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button u-border-button"
          :disable="saving"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :disable="!draft || draft === time.timezone || saving"
          :loading="saving"
          :label="gettext('Save')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
<style scoped>
.time-panel {
  background: #fff;
}
.time-panel__header {
  min-height: 38px;
  padding: 4px 8px 4px 12px;
  gap: 8px;
  border-bottom: 1px solid #dfe1e6;
  background: #f2f5fc;
  color: #333;
  font-size: 12px;
  font-weight: 600;
}
.time-panel__header > div {
  gap: 7px;
}
.time-panel__body {
  padding: 0 12px;
}
.time-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 46px;
  padding: 8px 0;
  border-bottom: 1px solid #eef1f6;
  font-size: 12px;
}
.time-panel__row:last-child {
  border-bottom: 0;
}
.time-panel__label {
  min-width: 0;
  gap: 8px;
  color: #666;
}
.time-panel__label .q-icon {
  color: #718096;
}
.time-panel__row strong {
  min-width: 0;
  color: #333;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .time-panel__row {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .time-panel__row strong {
    padding-left: 24px;
    text-align: left;
  }
}
</style>
