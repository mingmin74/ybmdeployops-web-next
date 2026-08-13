<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ modelValue?: PveRecord }>();
const emit = defineEmits<{ 'update:modelValue': [value: PveRecord] }>();
const form = reactive({ name: '', latitude: '', longitude: '' });

watch(
  () => props.modelValue,
  (value) => {
    form.name = textValue(value?.name);
    form.latitude = textValue(value?.latitude);
    form.longitude = textValue(value?.longitude);
  },
  { immediate: true, deep: true },
);
watch(form, (value) => emit('update:modelValue', { ...value }), { deep: true });

function inRange(value: string, min: number, max: number) {
  return !value || (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max);
}
</script>

<template>
  <div class="column q-gutter-sm">
    <q-input v-model="form.name" dense :label="gettext('Name')" :hint="gettext('Optional')" :rules="[(value) => !value || !/[=,]/.test(value) || gettext('No comma and equals sign allowed')]" />
    <q-input v-model="form.latitude" dense type="number" step="0.000001" min="-90" max="90" :label="gettext('Latitude')" :rules="[(value) => inRange(value, -90, 90) || gettext('Invalid latitude')]" />
    <q-input v-model="form.longitude" dense type="number" step="0.000001" min="-180" max="180" :label="gettext('Longitude')" :rules="[(value) => inRange(value, -180, 180) || gettext('Invalid longitude')]" />
  </div>
</template>
