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
        color="primary"
        class="u-button"
        :disable="!dirty || saving"
        :label="gettext('Revert')"
        @click="draft = hosts"
      />
    </div>
    <section class="hosts-editor u-border">
      <header class="hosts-editor__header row items-center no-wrap">
        <q-icon
          name="description"
          size="16px"
          color="primary"
        />
        <span>/etc/hosts</span>
        <q-space />
        <span
          v-if="canModify && dirty"
          class="hosts-editor__status"
        >
          {{ gettext('Unsaved changes') }}
        </span>
      </header>
      <q-input
        v-if="canModify"
        v-model="draft"
        type="textarea"
        autogrow
        borderless
        dense
        spellcheck="false"
        class="hosts-editor__input"
        input-class="hosts-editor__textarea"
      />
      <pre
        v-else
        class="hosts-editor__output"
        >{{ hosts || '-' }}</pre>
    </section>
  </template>
  <div
    v-else
    class="text-grey-7"
  >
    {{ gettext('No Data') }}
  </div>
</template>
<style scoped>
.hosts-editor {
  background: #fff;
}
.hosts-editor__header {
  min-height: 36px;
  padding: 0 12px;
  gap: 7px;
  border-bottom: 1px solid #dfe1e6;
  background: #f2f5fc;
  color: #333;
  font-size: 12px;
  font-weight: 600;
}
.hosts-editor__status {
  color: #cf4c35;
  font-weight: 400;
}
.hosts-editor__input :deep(.q-field__control) {
  min-height: 420px;
  padding: 0;
}
.hosts-editor__input :deep(.q-field__native) {
  min-height: 420px;
  padding: 12px;
  color: #333;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}
.hosts-editor__output {
  max-height: 520px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  background: #fff;
  color: #333;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
