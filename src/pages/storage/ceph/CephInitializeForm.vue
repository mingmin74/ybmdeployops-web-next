<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { getNodeNetwork } from '@/api/host';
import { initializeCeph } from '@/api/cephSetup';
import { createCephService } from '@/api/ceph';
import { getTaskStatus } from '@/api/maintenance';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { isIpv4Address, isIpv6Address } from '@/utils/ipValidation';
import { gettext } from '@/locale';

const { node } = defineProps<{ node: string }>();
const emit = defineEmits<{ configured: [] }>();
const network = shallowRef('');
const clusterNetwork = shallowRef('');
const size = shallowRef<number | null>(null);
const minSize = shallowRef<number | null>(null);
const advanced = shallowRef(false);
const networks = shallowRef<string[]>([]);
const busy = shallowRef(false);
const initialized = shallowRef(false);
const error = shallowRef('');
const networkError = shallowRef('');
const task = shallowRef('');
const taskFailed = shallowRef(false);
const showTask = shallowRef(false);
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const minSizeMax = computed(() => Math.min(size.value || 3, 4));
const required = (value: string) => !!value || gettext('This field is required');
function cidr(value: string | null) {
  if (!value) return true;
  const [address = '', prefix = '', extra] = value.split('/');
  return (
    !value ||
    (extra === undefined &&
      /^\d+$/.test(prefix) &&
      ((isIpv4Address(address) && Number(prefix) <= 32) ||
        (isIpv6Address(address) && Number(prefix) <= 128))) ||
    gettext('Invalid IP/CIDR')
  );
}
const replicasRule = (value: number | string | null) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Number.isInteger(Number(value)) && Number(value) >= 2 && Number(value) <= 7) ||
  gettext('Invalid value');
const minReplicasRule = (value: number | string | null) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Number.isInteger(Number(value)) && Number(value) >= 2 && Number(value) <= minSizeMax.value) ||
  gettext('Invalid value');
async function loadNetworks() {
  networkError.value = '';
  try {
    const result = await getNodeNetwork(node, { type: 'include_sdn' });
    if (!disposed)
      networks.value = [
        ...new Set(
          (result.data || []).flatMap((entry) =>
            [entry.cidr, entry.cidr6].filter(
              (value): value is string => typeof value === 'string' && !!value
            )
          )
        ),
      ];
  } catch (cause) {
    if (!disposed) networkError.value = cause instanceof Error ? cause.message : String(cause);
  }
}
async function pollMonitor() {
  try {
    const result = await getTaskStatus(node, task.value);
    if (disposed) return;
    if (result.data?.status === 'stopped') {
      busy.value = false;
      if (result.data.exitstatus === 'OK') emit('configured');
      else {
        taskFailed.value = true;
        error.value = result.data.exitstatus || gettext('Error');
      }
      return;
    }
    timer = setTimeout(() => void pollMonitor(), 1000);
  } catch (cause) {
    if (!disposed) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      busy.value = false;
    }
  }
}
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    // Retain successful initialization if monitor creation fails, so retry does not rewrite config.
    if (!initialized.value) {
      await initializeCeph(node, {
        network: network.value,
        ...(clusterNetwork.value ? { 'cluster-network': clusterNetwork.value } : {}),
        ...(size.value ? { size: Number(size.value) } : {}),
        ...(minSize.value ? { min_size: Number(minSize.value) } : {}),
      });
      if (disposed) return;
      initialized.value = true;
    }
    if (task.value && !taskFailed.value) {
      await pollMonitor();
      return;
    }
    const result = await createCephService(node, 'mon');
    if (disposed) return;
    taskFailed.value = false;
    task.value = String(result.data || '');
    if (task.value) await pollMonitor();
    else {
      busy.value = false;
      emit('configured');
    }
  } catch (cause) {
    if (!disposed) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      busy.value = false;
    }
  }
}
onMounted(() => void loadNetworks());
onBeforeUnmount(() => {
  disposed = true;
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <q-form @submit="submit">
    <div class="row q-gutter-lg">
      <div class="col">
        <q-select
          v-model="network"
          :options="networks"
          use-input
          new-value-mode="add-unique"
          dense
          options-dense
          class="q-field--with-bottom"
          :disable="busy || initialized"
          :label="gettext('Public Network IP/CIDR')"
          :rules="[required, cidr]"
        />
        <q-select
          v-model="clusterNetwork"
          :options="networks"
          use-input
          new-value-mode="add-unique"
          clearable
          dense
          options-dense
          class="q-field--with-bottom"
          :disable="busy || initialized"
          :label="gettext('Cluster Network IP/CIDR')"
          :hint="gettext('Same as Public Network')"
          :rules="[cidr]"
        />
      </div>
      <div class="col">
        <q-input
          :model-value="node"
          dense
          readonly
          class="q-field--with-bottom"
          :label="gettext('Monitor node')"
        />
        <div class="text-grey-7">
          {{
            gettext(
              'Additional monitors are recommended. They can be created at any time in the Monitor tab.'
            )
          }}
        </div>
      </div>
    </div>
    <div
      v-if="networkError"
      class="text-negative q-mb-sm"
      role="alert"
    >
      {{ networkError }}
      <q-btn
        flat
        no-caps
        size="12px"
        class="u-button"
        :label="gettext('Retry')"
        @click="loadNetworks"
      />
    </div>
    <q-checkbox
      v-model="advanced"
      dense
      color="primary"
      :label="gettext('Advanced')"
    />
    <div
      v-show="advanced"
      class="row q-gutter-lg"
    >
      <q-input
        v-model.number="size"
        type="number"
        min="2"
        max="7"
        placeholder="3"
        dense
        class="col q-field--with-bottom"
        :disable="busy || initialized"
        :label="gettext('Number of replicas')"
        :rules="[replicasRule]"
      />
      <q-input
        v-model.number="minSize"
        type="number"
        min="2"
        :max="minSizeMax"
        placeholder="2"
        dense
        class="col q-field--with-bottom"
        :disable="busy || initialized"
        :label="gettext('Minimum replicas')"
        :rules="[minReplicasRule]"
        reactive-rules
      />
    </div>
    <div
      v-if="error"
      class="text-negative q-my-sm"
      role="alert"
    >
      {{ error }}
    </div>
    <div class="row justify-end q-gutter-sm q-mt-md">
      <q-btn
        v-if="task"
        no-caps
        outline
        color="primary"
        size="12px"
        class="u-button"
        :label="gettext('Task viewer')"
        @click="showTask = true"
      />
      <q-btn
        type="submit"
        :loading="busy"
        no-caps
        flat
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :label="gettext(initialized ? 'Create Monitor' : 'Configure Ceph')"
      />
    </div>
    <TaskOutputDialog
      v-model="showTask"
      :node="node"
      :upid="task"
      :title="gettext('Create Monitor')"
    />
  </q-form>
</template>
