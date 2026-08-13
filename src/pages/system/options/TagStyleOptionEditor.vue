<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import TagColorGrid from './TagColorGrid.vue';

const props = defineProps<{ modelValue?: PveRecord }>();
const emit = defineEmits<{ 'update:modelValue': [value: PveRecord] }>();

const form = reactive({
  shape: '__default__',
  ordering: '__default__',
  caseSensitive: false,
  colors: '',
});

watch(
  () => props.modelValue,
  (value) => {
    form.shape = textValue(value?.shape, '__default__');
    form.ordering = textValue(value?.ordering, '__default__');
    form.caseSensitive = Number(value?.['case-sensitive']) === 1;
    form.colors = textValue(value?.['color-map']);
  },
  { immediate: true, deep: true },
);
watch(
  form,
  (value) =>
    emit('update:modelValue', {
      shape: value.shape,
      ordering: value.ordering,
      'case-sensitive': value.caseSensitive ? 1 : 0,
      'color-map': value.colors,
    }),
  { deep: true },
);

const shapeOptions = [
  { label: `${gettext('Default')} (${gettext('Circle')})`, value: '__default__' },
  { label: gettext('Full'), value: 'full' },
  { label: gettext('Circle'), value: 'circle' },
  { label: gettext('Dense'), value: 'dense' },
  { label: gettext('None'), value: 'none' },
];
const orderingOptions = [
  { label: `${gettext('Default')} (${gettext('Alphabetical')})`, value: '__default__' },
  { label: gettext('Configuration'), value: 'config' },
  { label: gettext('Alphabetical'), value: 'alphabetical' },
];
</script>

<template>
  <div class="column q-gutter-sm">
    <q-select v-model="form.shape" dense emit-value map-options options-dense :options="shapeOptions" :label="gettext('Shape')" />
    <q-select v-model="form.ordering" dense emit-value map-options options-dense :options="orderingOptions" :label="gettext('Ordering')" />
    <q-checkbox v-model="form.caseSensitive" :label="gettext('Case-Sensitive')" />
    <div class="text-caption text-grey-8">{{ gettext('Color Overrides') }}</div>
    <TagColorGrid v-model="form.colors" />
  </div>
</template>
