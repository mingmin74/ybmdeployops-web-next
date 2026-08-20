<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { getNodeConfig } from '@/api/overview';
import { request } from '@/api/request';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const { node = '', canEdit = false } = defineProps<{ node?: string; canEdit?: boolean }>();
const loading = shallowRef(false);
const editorVisible = shallowRef(false);
const description = shallowRef('');
const digest = shallowRef('');
const draft = shallowRef('');

const canSave = computed(() => canEdit && draft.value.length <= 64 * 1024 && !loading.value);

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

async function openEditor() {
  if (!canEdit || !node) return;
  await loadNotes();
  draft.value = description.value;
  editorVisible.value = true;
}

async function saveNotes() {
  if (!canSave.value) return;

  loading.value = true;
  try {
    await request(`/api2/json/nodes/${encodeURIComponent(node)}/config`, {
      method: 'PUT',
      data: { description: draft.value, digest: digest.value },
      keepEmptyKeys: ['description'],
      notifyOnError: true,
    });
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
  <section class="node-notes-panel">
    <header class="node-notes-panel__header row items-center no-wrap">
      <div class="node-notes-panel__title row items-center no-wrap">
        <q-icon name="sticky_note_2" size="22px" color="primary" />
        <div>
          <div class="text-subtitle1 text-weight-medium">{{ gettext('Notes') }}</div>
          <div class="text-caption text-grey-7">{{ gettext('Node configuration notes') }}</div>
        </div>
      </div>
      <q-space />
      <q-btn
        v-if="canEdit"
        no-caps
        outline
        dense
        color="primary"
        icon="edit"
        :label="gettext('Edit')"
        @click="openEditor"
      />
    </header>

    <div class="node-notes-panel__content">
      <pre v-if="description" class="node-notes-panel__text">{{ description }}</pre>
      <div v-else class="node-notes-panel__empty column flex-center">
        <q-icon name="speaker_notes_off" size="34px" />
        <span>{{ gettext('No notes available.') }}</span>
      </div>
    </div>
    <q-inner-loading :showing="loading" />
  </section>

  <q-dialog v-model="editorVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Edit Notes')" width="760px" :loading="loading">
      <div class="q-pa-md">
        <q-input v-model="draft" type="textarea" autogrow outlined :maxlength="64 * 1024" />
        <div class="text-caption text-grey-6 q-mt-sm">{{ draft.length }} / {{ 64 * 1024 }}</div>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps flat :label="gettext('Cancel')" />
        <q-btn no-caps color="primary" :disable="!canSave" :label="gettext('Save')" @click="saveNotes" />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped lang="scss">
.node-notes-panel {
  position: relative;
  min-height: 360px;
  border: 1px solid #e1e7ef;
  border-radius: 6px;
  background: #fff;
}
.node-notes-panel__header {
  min-height: 72px;
  padding: 0 20px;
  border-bottom: 1px solid #e8edf3;
}
.node-notes-panel__title {
  gap: 12px;
}
.node-notes-panel__content {
  min-height: 287px;
  padding: 20px 22px;
}
.node-notes-panel__text {
  margin: 0;
  color: #273746;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.node-notes-panel__empty {
  min-height: 244px;
  gap: 10px;
  color: #9aa8b6;
}
</style>
