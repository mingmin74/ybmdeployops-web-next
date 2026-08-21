<script setup lang="ts">
import { reactive } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

defineProps<{ item: string; loading?: boolean }>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ submit: [params: { 'cleanup-disks': number; 'cleanup-config': number }] }>();
const options = reactive({ cleanupDisks: true, cleanupConfig: true });

function submit() {
  emit('submit', { 'cleanup-disks': options.cleanupDisks ? 1 : 0, 'cleanup-config': options.cleanupConfig ? 1 : 0 });
}
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Destroy')" width="480px" :loading="loading">
      <div class="q-pa-md">
        <div class="q-mb-md">{{ gettext('This action cannot be undone.') }} {{ item }}</div>
        <q-checkbox v-model="options.cleanupDisks" dense right-label color="primary" :label="gettext('Cleanup Disks')" />
        <q-checkbox v-model="options.cleanupConfig" dense right-label color="primary" :label="gettext('Cleanup Storage Configuration')" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="loading" :label="gettext('Destroy')" @click="submit" />
      </template>
    </UWindow>
  </q-dialog>
</template>
