<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import OptionFormHint from './OptionFormHint.vue';

const props = defineProps<{ modelValue?: PveRecord; originalId?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: PveRecord] }>();

const origin = window.location.origin;
const form = reactive({ rp: '', origin: '', id: '' });
const idChanged = computed(() => Boolean(props.originalId) && form.id !== props.originalId);

watch(
  () => props.modelValue,
  (value) => {
    form.rp = textValue(value?.rp);
    form.origin = textValue(value?.origin);
    form.id = textValue(value?.id);
  },
  { immediate: true, deep: true },
);
watch(form, (value) => emit('update:modelValue', { ...value }), { deep: true });

function autoFill() {
  const hostname = window.location.hostname;
  form.rp = hostname;
  if (!form.id) form.id = hostname;
}
</script>

<template>
  <div class="column q-gutter-sm">
    <q-input v-model="form.rp" dense :label="gettext('Name')" :rules="[(value) => Boolean(value) || gettext('Required')]" />
    <q-input v-model="form.origin" dense :label="gettext('Origin')" />
    <OptionFormHint>{{ gettext('Domain Lockdown (e.g., {0})').replace('{0}', origin) }}</OptionFormHint>
    <q-input v-model="form.id" dense label="ID" :rules="[(value) => Boolean(value) || gettext('Required')]" />
    <div class="row justify-end"><q-btn dense flat no-caps color="primary" :label="gettext('Auto-fill')" @click="autoFill" /></div>
    <OptionFormHint>
      <div>{{ gettext('Note: WebAuthn requires using a trusted certificate.') }}</div>
      <div v-if="idChanged">{{ gettext('Changing the ID breaks existing WebAuthn TFA entries.') }}</div>
    </OptionFormHint>
  </div>
</template>
