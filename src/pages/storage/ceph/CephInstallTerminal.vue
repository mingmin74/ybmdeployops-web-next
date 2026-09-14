<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { probeCeph } from '@/api/cephSetup';
import { gettext } from '@/locale';

const { node, release, repository } = defineProps<{
  node: string;
  release: string;
  repository: string;
}>();
const emit = defineEmits<{ installed: [needsConfiguration: boolean] }>();
const error = shallowRef('');
const complete = shallowRef(false);
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
// Native PVE console; use the existing shell proxy when running the Quasar dev server.
const consoleUrl = computed(
  () =>
    `${import.meta.env.DEV ? '/shell/' : '/'}?${new URLSearchParams({
      console: 'cmd',
      node,
      xtermjs: '1',
      resize: 'scale',
      cmd: 'ceph_install',
      'cmd-opts': ['--version', release, '--repository', repository].join('\0'),
    }).toString()}`
);
async function poll() {
  try {
    const state = await probeCeph(node);
    if (disposed) return;
    error.value = '';
    if (state !== 'not-installed') {
      complete.value = true;
      emit('installed', state === 'not-initialized');
    }
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (!disposed && !complete.value) timer = setTimeout(() => void poll(), 1000);
  }
}
onMounted(() => void poll());
onBeforeUnmount(() => {
  disposed = true;
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div>
    <div class="q-mb-sm">
      {{ gettext('Follow the instructions in the terminal to complete the installation.') }}
    </div>
    <iframe
      :src="consoleUrl"
      :title="gettext('Install Ceph')"
      class="ceph-install-terminal"
    />
    <div
      v-if="error"
      role="alert"
      class="text-negative q-mt-sm"
    >
      {{ error }}
    </div>
    <div
      v-if="complete"
      class="text-positive q-mt-sm"
    >
      {{ gettext('Ceph installation detected. Click Next to continue.') }}
    </div>
  </div>
</template>

<style scoped>
.ceph-install-terminal {
  width: 100%;
  height: 330px;
  border: 0;
  background: #000;
}
</style>
