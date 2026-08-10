<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { getNodeConfig, updateNodeConfig } from '@/api/overview';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const { node = '' } = defineProps<{ node?: string }>();
const loading = shallowRef(false);
const editorVisible = shallowRef(false);
const description = shallowRef('');
const digest = shallowRef('');
const draft = shallowRef('');

const canSave = computed(() => draft.value.length <= 64 * 1024 && !loading.value);

async function loadNotes() {
  if (!node) {
    description.value = '';
    digest.value = '';
    return;
  }

  loading.value = true;
  try {
    const response = await getNodeConfig(node);
    description.value = textValue(response.data?.description);
    digest.value = textValue(response.data?.digest);
  } finally {
    loading.value = false;
  }
}

function openEditor() {
  draft.value = description.value;
  editorVisible.value = true;
}

defineExpose({ openEditor });

async function saveNotes() {
  loading.value = true;
  try {
    const data = draft.value
      ? { description: draft.value, digest: digest.value }
      : { delete: 'description', digest: digest.value };
    await updateNodeConfig(node, data);
    editorVisible.value = false;
    await loadNotes();
  } finally {
    loading.value = false;
  }
}

watch(
  () => node,
  () => {
    void loadNotes();
  },
  { immediate: true },
);
</script>

<template>
  <section class="host-notes-panel">
    <div class="host-notes-heading">
      <q-icon name="sticky_note_2" size="16px" /><span>{{ gettext('Notes') }}</span
      ><q-space />
      <q-btn
        round
        dense
        flat
        size="sm"
        color="primary"
        icon="edit"
        :aria-label="gettext('Edit Notes')"
        @click="openEditor"
      >
        <q-tooltip>{{ gettext('Edit Notes') }}</q-tooltip>
      </q-btn>
    </div>
    <div class="host-notes-body" :class="{ 'text-grey-6': !description }">
      <span>{{ description || gettext('No notes available.') }}</span>
      <q-tooltip v-if="description" class="host-notes-tooltip">{{ description }}</q-tooltip>
    </div>
    <q-inner-loading :showing="loading" />
  </section>

  <q-dialog v-model="editorVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Notes')" width="680px" :loading="loading">
      <div class="u-border q-ma-sm q-pa-md u-dense">
        <q-input
          v-model="draft"
          type="textarea"
          autogrow
          dense
          :maxlength="64 * 1024"
          :label="gettext('Notes')"
        />
        <div class="text-caption text-grey-6 q-mt-xs">{{ draft.length }} / {{ 64 * 1024 }}</div>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          :disable="!canSave"
          :class="canSave ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'"
          :label="gettext('Save')"
          @click="saveNotes"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.host-notes-panel {
  position: relative;
  margin: 0 16px 14px;
  padding: 8px 10px;
  border: 1px solid #dce7f0;
  background: #f1f6fa;
}
.host-notes-heading {
  align-items: center;
  display: flex;
  gap: 5px;
  color: #526d84;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}
.host-notes-body {
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  color: #41576a;
  font-size: 12px;
  line-height: 1.55;
  text-align: left;
  word-break: break-word;
}
.host-notes-tooltip {
  max-width: 420px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
