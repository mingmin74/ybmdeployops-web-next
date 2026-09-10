<script setup lang="ts">
import type { QForm } from 'quasar';
import { reactive, useTemplateRef, watch } from 'vue';
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

const props = defineProps<{
  title: string;
  fields: NodeDiskFormField[];
  defaults?: Record<string, unknown>;
  loading?: boolean;
}>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ submit: [values: Record<string, unknown>] }>();
const values = reactive<Record<string, unknown>>({});
const form = useTemplateRef<QForm>('form');
const hasValue = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : textValue(value).trim() !== '';
const requiredRule = (value: unknown) => hasValue(value) || gettext('This field is required');
const fieldLabel = (field: NodeDiskFormField) =>
  field.required ? `${field.label} *` : field.label;

async function submit() {
  if (!(await form.value?.validate())) return;
  emit('submit', { ...values });
}

watch(visible, (open) => {
  if (!open) return;
  Object.keys(values).forEach((key) => delete values[key]);
  props.fields.forEach((field) => {
    values[field.name] =
      props.defaults?.[field.name] ??
      (field.type === 'checkbox' ? false : field.multiple ? [] : '');
  });
});
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="title"
      width="560px"
      :loading="loading"
    >
      <q-form
        ref="form"
        class="node-disk-form u-border q-ma-sm q-pa-md"
        @submit.prevent="submit"
      >
        <div class="column q-gutter-sm">
          <div
            v-for="field in fields"
            v-show="!field.visible || field.visible(values)"
            :key="field.name"
          >
            <q-checkbox
              v-if="field.type === 'checkbox'"
              v-model="values[field.name] as boolean"
              dense
              right-label
              color="primary"
              :label="fieldLabel(field)"
            />
            <q-select
              v-else-if="field.type === 'select'"
              v-model="values[field.name] as string | string[]"
              dense
              options-dense
              emit-value
              map-options
              class="q-field--with-bottom"
              :options="field.options || []"
              :label="fieldLabel(field)"
              :hint="field.hint"
              :multiple="field.multiple"
              :rules="field.required ? [requiredRule] : []"
            />
            <q-input
              v-else-if="field.type === 'number'"
              v-model.number="values[field.name] as number"
              dense
              type="number"
              class="q-field--with-bottom"
              :label="fieldLabel(field)"
              :hint="field.hint"
              :rules="field.required ? [requiredRule] : []"
            />
            <q-input
              v-else
              v-model="values[field.name] as string"
              dense
              class="q-field--with-bottom"
              :label="fieldLabel(field)"
              :hint="field.hint"
              :rules="field.required ? [requiredRule] : []"
            />
          </div>
        </div>
      </q-form>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button u-border-button"
          :disable="loading"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :disable="loading"
          :loading="loading"
          :label="gettext('Create')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.node-disk-form {
  min-height: 190px;
}
</style>
