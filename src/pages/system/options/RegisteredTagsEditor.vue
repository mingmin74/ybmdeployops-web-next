<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import OptionFormHint from './OptionFormHint.vue';

const props = defineProps<{ modelValue?: unknown; userTagAccess?: unknown }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const tags = shallowRef('');

const allowedTags = computed(() => {
  const access = props.userTagAccess && typeof props.userTagAccess === 'object' ? props.userTagAccess as Record<string, unknown> : {};
  const value = access['user-allow-list'];
  return (Array.isArray(value) ? value : textValue(value).split(/[;,]/)).map((item) => textValue(item)).filter(Boolean);
});
const overlappingTags = computed(() => tags.value.split(/[;,\s]+/).filter((tag) => allowedTags.value.includes(tag)));

watch(
  () => props.modelValue,
  (value) => {
    tags.value = Array.isArray(value) ? value.map((item) => textValue(item)).join(';') : textValue(value);
  },
  { immediate: true, deep: true },
);
watch(tags, (value) => emit('update:modelValue', value.split(/[;,\s]+/).filter(Boolean)));

function isValidTagList(value: string) {
  return !value || value.split(/[;,\s]+/).every((tag) => /^[a-z0-9+_.-]+$/i.test(tag));
}
</script>

<template>
  <div class="column q-gutter-sm">
    <q-input v-model="tags" dense type="textarea" :label="gettext('Tags')" :rules="[(value) => isValidTagList(value) || gettext('Invalid tag')]" />
    <OptionFormHint>{{ gettext('Separate tags with semicolons') }}</OptionFormHint>
    <OptionFormHint v-if="overlappingTags.length">{{ gettext('NOTE: The following tags are also defined in the user allow list.') }} {{ overlappingTags.join(', ') }}</OptionFormHint>
  </div>
</template>
