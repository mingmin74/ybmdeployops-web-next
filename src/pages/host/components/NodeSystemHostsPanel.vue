<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { getNodeHosts, updateNodeHosts } from '@/api/host';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
const props = defineProps<{ node: string }>();
const session = useSessionStore();
const hosts = shallowRef('');
const draft = shallowRef('');
const digest = shallowRef('');
const saving = shallowRef(false);
const canAudit = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Audit'])
);
const canModify = computed(() =>
  Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify'])
);
const dirty = computed(() => draft.value !== hosts.value);
let loadId = 0;
async function load() {
  const node = props.node,
    id = ++loadId;
  if (!node || !canAudit.value) {
    hosts.value = '';
    draft.value = '';
    digest.value = '';
    return;
  }
  const response = await getNodeHosts(node);
  if (id === loadId && node === props.node) {
    hosts.value = response.data?.data || '';
    draft.value = hosts.value;
    digest.value = response.data?.digest || '';
  }
}
async function save() {
  if (!props.node || !dirty.value) return;
  saving.value = true;
  try {
    await updateNodeHosts(props.node, draft.value, digest.value);
    await load();
  } finally {
    saving.value = false;
  }
}
watch([() => props.node, canAudit], () => void load(), { immediate: true });
</script>
<template>
  <template v-if="canAudit">
    <div
      v-if="canModify"
      class="row q-gutter-sm q-mb-sm"
    >
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :disable="!dirty || saving"
        :loading="saving"
        :label="gettext('Save')"
        @click="save"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :disable="!dirty || saving"
        :label="gettext('Revert')"
        @click="draft = hosts"
      />
    </div>
    <q-input
      v-if="canModify"
      v-model="draft"
      type="textarea"
      autogrow
      outlined
      input-style="font-family: Consolas, 'Courier New', monospace; white-space: pre; min-height: 420px"
    />
    <pre
      v-else
      class="hosts-output"
      >{{ hosts || '-' }}</pre
    >
  </template>
  <div
    v-else
    class="text-grey-7"
  >
    {{ gettext('No Data') }}
  </div>
</template>
<style scoped>
.hosts-output {
  max-height: 520px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid #dfe1e6;
  background: #f7f9fb;
  color: #333;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
