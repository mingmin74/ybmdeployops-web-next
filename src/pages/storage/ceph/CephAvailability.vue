<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { probeCeph, type CephSetupState } from '@/api/cephSetup';
import { request } from '@/api/request';
import { useSessionStore } from '@/stores/session';
import { gettext } from '@/locale';
import CephInstallDialog from './CephInstallDialog.vue';

const { node } = defineProps<{ node: string }>();
const session = useSessionStore();
const state = shallowRef<CephSetupState>();
const targetNode = shallowRef(node);
const error = shallowRef('');
const loading = shallowRef(false);
const installing = shallowRef(false);
const isRoot = computed(() => session.userid === 'root@pam');
let generation = 0;

async function reload() {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  state.value = undefined;
  try {
    let target = node;
    if (node === 'localhost') {
      const result =
        await request<{ type: string; name: string; local?: number | boolean }[]>(
          '/cluster/status'
        );
      target = result.data?.find((entry) => entry.type === 'node' && entry.local)?.name || '';
      if (!target) throw new Error(gettext('Could not resolve the local node name.'));
    }
    if (current !== generation) return;
    targetNode.value = target;
    const result = await probeCeph(target);
    if (current === generation) state.value = result;
  } catch (cause) {
    if (current === generation)
      error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  () => node,
  () => {
    installing.value = false;
    void reload();
  },
  { immediate: true }
);
watch(installing, (visible, previous) => {
  if (previous && !visible) void reload();
});
onBeforeUnmount(() => {
  generation++;
});
</script>

<template>
  <div class="ceph-availability">
    <div
      v-if="loading"
      class="q-pa-xl text-center"
    >
      <q-spinner
        color="primary"
        size="24px"
      />
      {{ gettext('Loading...') }}
    </div>
    <div
      v-else-if="error"
      class="q-pa-xl text-center"
    >
      <div
        role="alert"
        class="text-negative q-mb-md"
      >
        {{ error }}
      </div>
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :label="gettext('Retry')"
        @click="reload"
      />
    </div>
    <div
      v-else-if="state === 'not-installed' || state === 'not-initialized'"
      class="q-pa-xl text-center"
    >
      <template v-if="state === 'not-installed'">
        <div>{{ gettext('Ceph is not installed on this node.') }}</div>
        <div v-if="isRoot">{{ gettext('Would you like to install it now?') }}</div>
      </template>
      <template v-else>
        <div>{{ gettext('Ceph is not initialized.') }}</div>
        <div>{{ gettext('You need to create an initial config once.') }}</div>
      </template>
      <div
        v-if="!isRoot"
        class="q-mt-sm"
      >
        {{ gettext('Log in as root to install.') }}
      </div>
      <div class="q-mt-md q-gutter-sm">
        <q-btn
          v-if="isRoot"
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext(state === 'not-installed' ? 'Install Ceph' : 'Configure Ceph')"
          @click="installing = true"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Refresh')"
          @click="reload"
        />
      </div>
    </div>
    <slot v-else-if="state" />
    <CephInstallDialog
      v-if="installing && isRoot"
      :key="targetNode"
      v-model="installing"
      :node="targetNode"
      :installed="state === 'not-initialized'"
    />
  </div>
</template>
