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
const tagPattern = /^[a-z0-9+_.-]+$/i;

const visible = shallowRef(false);
const saving = shallowRef(false);
const draftTags = shallowRef<string[]>([]);
const newTag = shallowRef('');
const tags = computed(() =>
  String(props.tags || '')
    .split(/[;, ]+/)
    .filter(Boolean)
);
const changed = computed(() => draftTags.value.join(',') !== tags.value.join(','));
const hasDraftError = computed(() =>
  draftTags.value.some((_, index) => Boolean(draftError(index)))
);

function draftError(index: number) {
  const value = draftTags.value[index]?.trim() || '';
  if (!tagPattern.test(value)) return gettext('Invalid tag');
  if (draftTags.value.some((tag, otherIndex) => otherIndex !== index && tag.trim() === value)) {
    return gettext('Duplicate tag');
  }
  return '';
}
const tagError = computed(() => {
  const value = newTag.value.trim();
  if (!value) return '';
  if (!tagPattern.test(value)) return gettext('Invalid tag');
  if (draftTags.value.includes(value)) return gettext('Duplicate tag');
  return '';
});

function openEditor() {
  draftTags.value = [...tags.value];
  newTag.value = '';
  visible.value = true;
}

function addTag() {
  const tag = newTag.value.trim();
  if (!tag || !tagPattern.test(tag) || draftTags.value.includes(tag)) return;
  draftTags.value = [...draftTags.value, tag];
  newTag.value = '';
}

function editTag(index: number, value: string | number | null) {
  draftTags.value = draftTags.value.map((tag, itemIndex) =>
    itemIndex === index ? String(value ?? '') : tag
  );
}

function removeTag(index: number) {
  draftTags.value = draftTags.value.filter((_, itemIndex) => itemIndex !== index);
}

async function save() {
  if (!props.node || !props.vmid || !changed.value || tagError.value || hasDraftError.value) return;
  saving.value = true;
  try {
    await updateVmConfig(
      props.node,
      props.vmid,
      {
        ...(props.digest ? { digest: props.digest } : {}),
        tags: draftTags.value.map((tag) => tag.trim()).join(','),
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
    class="vm-tag-control row items-center no-wrap"
  >
    <div
      v-if="tags.length"
      class="vm-tag-control__list row items-center no-wrap"
    >
      <q-badge
        v-for="tag in tags"
        :key="tag"
        class="vm-tag-control__tag q-px-sm"
        color="primary"
        :label="tag"
      />
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
          <div class="vm-tag-control__section-title q-mb-sm">{{ gettext('Tags') }}</div>
          <div
            v-if="draftTags.length"
            class="vm-tag-control__editor-list column q-mb-sm"
          >
            <div
              v-for="(tag, index) in draftTags"
              :key="index"
              class="vm-tag-control__editor-row row items-start q-gutter-sm"
            >
              <q-input
                :model-value="tag"
                dense
                class="q-field--with-bottom col"
                :label="gettext('Tag')"
                :error="Boolean(draftError(index))"
                :error-message="draftError(index)"
                @update:model-value="editTag(index, $event)"
              />
              <q-btn
                flat
                dense
                size="12px"
                color="negative"
                icon="remove_circle_outline"
                class="u-button q-mt-sm"
                :aria-label="`${gettext('Remove')} ${tag}`"
                @click="removeTag(index)"
              />
            </div>
          </div>
          <div
            v-else
            class="text-grey-6 q-mb-md"
          >
            {{ gettext('No Tags') }}
          </div>
          <div class="vm-tag-control__new-row row items-start q-gutter-sm">
            <q-input
              v-model="newTag"
              dense
              class="q-field--with-bottom col"
              :label="gettext('Tag')"
              :error="Boolean(tagError)"
              :error-message="tagError"
              @keyup.enter="addTag()"
            />
            <q-btn
              flat
              dense
              size="12px"
              color="primary"
              icon="add_circle_outline"
              class="u-button q-mt-sm"
              :aria-label="gettext('Add')"
              :disable="!newTag.trim() || Boolean(tagError)"
              @click="addTag()"
            />
          </div>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
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
            :disable="!changed || Boolean(tagError) || hasDraftError"
            :label="gettext('Save')"
            @click="save"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped>
.vm-tag-control {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: 16px;
  gap: 6px;
}
.vm-tag-control__list {
  min-width: 0;
  gap: 6px;
  overflow-x: auto;
}
.vm-tag-control__tag {
  flex: 0 0 auto;
  white-space: nowrap;
}
</style>
