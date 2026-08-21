<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephMetadata, getCephStatus, restartCephOsds } from '@/api/ceph';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const model = defineModel<boolean>({ required: true });
const emit = defineEmits<{ started: [upid: string, node: string] }>();
const props = defineProps<{ node?: string; osdsByHost: Record<string, number> }>();

const allNodes = shallowRef(false);
const onlyOutdated = shallowRef(false);
const selectedNode = shallowRef('');
const loading = shallowRef(false);
const healthWarnings = shallowRef<string[]>([]);
const outdatedByHost = shallowRef<Record<string, number>>({});
const metadataLoaded = shallowRef(false);
const hosts = computed(() => Object.keys(props.osdsByHost).sort());
const total = computed(() =>
  Object.values(props.osdsByHost).reduce((sum, count) => sum + count, 0)
);
const nodeOptions = computed(() =>
  hosts.value.map((host) => ({
    value: host,
    label: `${host} (${props.osdsByHost[host]} OSD${props.osdsByHost[host] === 1 ? '' : 's'})`,
  }))
);
const maxCount = computed(() =>
  allNodes.value ? total.value : props.osdsByHost[selectedNode.value] || 0
);
const affectedCount = computed(() =>
  onlyOutdated.value && metadataLoaded.value
    ? allNodes.value
      ? Object.values(outdatedByHost.value).reduce((sum, count) => sum + count, 0)
      : outdatedByHost.value[selectedNode.value] || 0
    : maxCount.value
);
const affectedText = computed(() => {
  const scope = allNodes.value
    ? gettext('cluster-wide')
    : `${gettext('on node')} '${selectedNode.value}'`;
  if (onlyOutdated.value && !metadataLoaded.value)
    return `${gettext('up to')} ${maxCount.value} ${gettext('OSDs')} ${scope} (${gettext('outdated filter, exact count at task start')})`;
  return onlyOutdated.value
    ? `${affectedCount.value} ${gettext('outdated OSDs')} ${scope} (${gettext('of')} ${maxCount.value} ${gettext('total')})`
    : `${affectedCount.value} OSD${affectedCount.value === 1 ? '' : 's'} ${scope}`;
});
const durationText = computed(
  () =>
    `${gettext('Approximately 2 minutes per OSD')} (${Math.max(2, affectedCount.value * 2)} ${gettext('minutes')}, ${gettext('depending on cluster recovery speed')}).`
);

async function loadHealth() {
  try {
    const response = await getCephStatus(props.node || 'localhost');
    const health = (response.data?.health || {}) as PveRecord;
    if (textValue(health.status) === 'HEALTH_OK') return;
    healthWarnings.value = Object.entries((health.checks || {}) as PveRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, check]) =>
        textValue(((check as PveRecord).summary as PveRecord | undefined)?.message, id)
      );
  } catch {
    /* health display is advisory */
  }
}
async function loadOutdated() {
  if (metadataLoaded.value) return;
  try {
    const response = await getCephMetadata();
    const data = response.data || {};
    const nodeVersions = Object.fromEntries(
      Object.entries((data.node || {}) as PveRecord).map(([host, entry]) => [
        host,
        textValue(((entry as PveRecord).version as PveRecord | undefined)?.str),
      ])
    );
    const counts: Record<string, number> = {};
    (Array.isArray(data.osd) ? data.osd : []).forEach((entry) => {
      const osd = entry as PveRecord;
      const host = textValue(osd.hostname || osd.host);
      if (host && (!nodeVersions[host] || textValue(osd.ceph_version_short) !== nodeVersions[host]))
        counts[host] = (counts[host] || 0) + 1;
    });
    outdatedByHost.value = counts;
    metadataLoaded.value = true;
  } catch {
    /* retain source-faithful "up to" estimate */
  }
}
async function submit() {
  loading.value = true;
  try {
    const target = allNodes.value ? undefined : selectedNode.value;
    const response = await restartCephOsds(target, onlyOutdated.value);
    model.value = false;
    emit('started', textValue(response.data), target || props.node || 'localhost');
  } finally {
    loading.value = false;
  }
}
watch(onlyOutdated, (enabled) => {
  if (enabled) void loadOutdated();
});
watch(model, (visible) => {
  if (!visible) return;
  selectedNode.value = props.osdsByHost[props.node || ''] ? props.node || '' : hosts.value[0] || '';
  allNodes.value = false;
  onlyOutdated.value = false;
  healthWarnings.value = [];
  metadataLoaded.value = false;
  void loadHealth();
});
</script>

<template>
  <q-dialog
    v-model="model"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Bulk Restart OSDs')"
      width="600px"
      :loading="loading"
    >
      <div class="q-pa-md column q-gutter-sm">
        <div
          v-if="healthWarnings.length"
          class="text-warning"
        >
          <q-icon name="warning" />
          {{ gettext('A rolling restart may be refused unless every warning is benign.') }}
          <ul class="q-my-xs">
            <li
              v-for="warning in healthWarnings"
              :key="warning"
            >
              {{ warning }}
            </li>
          </ul>
        </div>
        <q-select
          v-model="selectedNode"
          dense
          options-dense
          emit-value
          map-options
          class="q-field--with-bottom"
          :disable="allNodes"
          :label="gettext('Node')"
          :options="nodeOptions"
        />
        <div class="row q-gutter-lg">
          <q-checkbox
            v-model="allNodes"
            dense
            right-label
            color="primary"
            :label="gettext('all nodes (cluster-wide)')"
          />
          <q-checkbox
            v-model="onlyOutdated"
            dense
            right-label
            color="primary"
            :label="gettext('only outdated OSD versions')"
          />
        </div>
        <div>
          <strong>{{ gettext('Affected') }}:</strong>
          {{ affectedText }}
        </div>
        <div>
          <strong>{{ gettext('Duration') }}:</strong>
          {{ durationText }}
        </div>
        <div class="text-caption">
          {{
            gettext(
              "OSDs are restarted serially with a per-step 'ok-to-stop' check. 'noout' is applied per OSD during the restart and unset on completion."
            )
          }}
        </div>
      </div>
      <template #foot>
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Cancel')"
          v-close-popup
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!maxCount"
          :loading="loading"
          :label="gettext('Restart')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
