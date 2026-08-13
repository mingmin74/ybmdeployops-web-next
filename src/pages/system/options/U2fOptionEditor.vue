<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ modelValue?: PveRecord }>();
const emit = defineEmits<{ 'update:modelValue': [value: PveRecord] }>();

const form = reactive({ appid: '', origin: '' });

watch(
  () => props.modelValue,
  (value) => {
    form.appid = textValue(value?.appid);
    form.origin = textValue(value?.origin);
  },
  { immediate: true, deep: true },
);
watch(form, (value) => emit('update:modelValue', { ...value }), { deep: true });
</script>

<template>
  <div class="column q-gutter-sm">
    <q-input v-model="form.appid" dense :label="gettext('U2F AppID URL')" :hint="gettext('Defaults to origin')" />
    <q-input v-model="form.origin" dense :label="gettext('U2F Origin')" :hint="gettext('Defaults to requesting host URI')" />
    <div class="text-caption text-warning">{{ gettext('Note: U2F is deprecated, use WebAuthn') }}</div>
    <div class="text-caption text-warning">{{ gettext('NOTE: Changing an AppID breaks existing U2F registrations!') }}</div>
  </div>
</template>
