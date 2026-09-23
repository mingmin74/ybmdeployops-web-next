<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { updateVmConfig } from '@/api/overview';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const props = defineProps<{
  node: string;
  vmid: string | number;
  tags?: string;
  digest?: string;
  canEdit: boolean;
}>();

const emit = defineEmits<{ updated: [] }>();

const visible = shallowRef(false);
const saving = shallowRef(false);
const draft = shallowRef('');
const tags = computed(() => String(props.tags || '').split(/[;, ]+/).filter(Boolean));

function openEditor() {
  draft.value = String(props.tags || '');
  visible.value = true;
}

async function save() {
  if (!props.node || !props.vmid) return;
  saving.value = true;
  try {
    await updateVmConfig(
      props.node,
      props.vmid,
      {
        ...(props.digest ? { digest: props.digest } : {}),
        tags: draft.value.trim(),
      },
      'qemu',
      'PUT',
      ['tags']
    );
    visible.value = false;
    emit('updated');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    v-if="tags.length || canEdit"
    class="vm-tag-control row items-center no-wrap q-ml-sm"
  >
    <div
      v-if="tags.length"
      class="row no-wrap q-gutter-xs"
    >
      <q-chip
        v-for="tag in tags"
        :key="tag"
        dense
        square
        size="12px"
        color="primary"
        text-color="white"
      >
        {{ tag }}
      </q-chip>
    </div>
    <span
      v-else
      class="text-grey-6 u-size-12"
    >
      {{ gettext('No Tags') }}
    </span>
    <q-btn
      v-if="canEdit"
      flat
      dense
      round
      size="10px"
      color="primary"
      icon="edit"
      :aria-label="gettext('Edit Tags')"
      @click="openEditor"
    />

    <q-dialog
      v-model="visible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="gettext('Edit Tags')"
        width="460px"
        :loading="saving"
      >
        <div class="q-pa-md">
          <q-input
            v-model="draft"
            dense
            class="q-field--with-bottom"
            :label="gettext('Tags')"
            hint="tag1;tag2"
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
            :loading="saving"
            :label="gettext('Save')"
            @click="save"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped>
.vm-tag-control :deep(.q-chip) {
  margin: 0;
}
</style>
