<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import OptionFormHint from './OptionFormHint.vue';

const props = defineProps<{ modelValue?: PveRecord; registeredTags?: unknown }>();
const emit = defineEmits<{ 'update:modelValue': [value: PveRecord] }>();
const form = reactive({ mode: '__default__', tags: '' });

const registered = computed(() =>
  (Array.isArray(props.registeredTags) ? props.registeredTags : textValue(props.registeredTags).split(/[;,]/))
    .map((value) => textValue(value).trim())
    .filter(Boolean),
);
const overlappingTags = computed(() => form.tags.split(/[;,\s]+/).filter((tag) => registered.value.includes(tag)));

watch(
  () => props.modelValue,
  (value) => {
    form.mode = textValue(value?.['user-allow'], '__default__');
    const tags = value?.['user-allow-list'];
    form.tags = Array.isArray(tags) ? tags.map((item) => textValue(item)).join(';') : textValue(tags);
  },
  { immediate: true, deep: true },
);
watch(
  form,
  (value) =>
    emit('update:modelValue', {
      'user-allow': value.mode,
      'user-allow-list': value.tags.split(/[;,\s]+/).filter(Boolean),
    }),
  { deep: true },
);

const modeOptions = ['free', 'existing', 'list', 'none'].map((value) => ({ label: value, value }));
modeOptions.unshift({ label: `${gettext('Default')} (free)`, value: '__default__' });

function isValidTagList(value: string) {
  return !value || value.split(/[;,\s]+/).every((tag) => /^[a-z0-9+_.-]+$/i.test(tag));
}
</script>

<template>
  <div class="column q-gutter-sm">
    <q-select v-model="form.mode" dense emit-value map-options options-dense :options="modeOptions" :label="gettext('Mode')" />
    <q-input v-model="form.tags" dense type="textarea" :label="gettext('Predefined Tags')" :rules="[(value) => isValidTagList(value) || gettext('Invalid tag')]" />
    <OptionFormHint>{{ gettext('Separate tags with semicolons') }}</OptionFormHint>
    <OptionFormHint v-if="overlappingTags.length">{{ gettext('NOTE: The following tags are also defined as registered tags.') }} {{ overlappingTags.join(', ') }}</OptionFormHint>
  </div>
</template>
