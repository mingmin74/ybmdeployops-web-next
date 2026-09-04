<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

export interface NodeDiskFormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox';
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  hint?: string;
  visible?: (values: Record<string, unknown>) => boolean;
  multiple?: boolean;
}

const props = defineProps<{ title: string; fields: NodeDiskFormField[]; defaults?: Record<string, unknown>; loading?: boolean }>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ submit: [values: Record<string, unknown>] }>();
const values = reactive<Record<string, unknown>>({});
const hasValue = (value: unknown) => textValue(value).trim() !== '';
const valid = computed(() => props.fields.filter((field) => field.required && (!field.visible || field.visible(values))).every((field) => hasValue(values[field.name])));

watch(visible, (open) => {
  if (!open) return;
  Object.keys(values).forEach((key) => delete values[key]);
  props.fields.forEach((field) => { values[field.name] = props.defaults?.[field.name] ?? (field.type === 'checkbox' ? false : field.multiple ? [] : ''); });
});
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="title" width="560px" :loading="loading">
      <q-form class="q-pa-md" @submit.prevent="emit('submit', { ...values })">
        <div class="row q-gutter-lg">
          <div v-for="field in fields" v-show="!field.visible || field.visible(values)" :key="field.name" class="col-12">
            <q-checkbox v-if="field.type === 'checkbox'" v-model="values[field.name] as boolean" dense right-label color="primary" :label="field.label" />
            <q-select v-else-if="field.type === 'select'" v-model="values[field.name] as string | string[]" dense options-dense emit-value map-options class="q-field--with-bottom" :options="field.options || []" :label="field.label" :hint="field.hint" :multiple="field.multiple" />
            <q-input v-else-if="field.type === 'number'" v-model.number="values[field.name] as number" dense type="number" class="q-field--with-bottom" :label="field.label" :hint="field.hint" :rules="field.required ? [(value) => hasValue(value) || gettext('This field is required')] : []" />
            <q-input v-else v-model="values[field.name] as string" dense class="q-field--with-bottom" :label="field.label" :hint="field.hint" :rules="field.required ? [(value) => !!String(value || '').trim() || gettext('This field is required')] : []" />
          </div>
        </div>
      </q-form>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!valid || loading" :label="gettext('Create')" @click="emit('submit', { ...values })" />
      </template>
    </UWindow>
  </q-dialog>
</template>
