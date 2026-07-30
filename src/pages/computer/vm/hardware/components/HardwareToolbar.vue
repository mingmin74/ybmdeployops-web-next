<script setup lang="ts">
import { gettext } from '@/locale';

defineProps<{
  isDisk: boolean;
  canRemove: boolean;
  canRevert: boolean;
}>();

const emit = defineEmits<{
  add: [];
  importDisk: [];
  remove: [];
  resize: [];
  move: [];
  revert: [];
}>();
</script>

<template>
  <div class="row q-gutter-sm q-py-sm hardware-toolbar">
    <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')">
      <q-list>
        <q-item v-close-popup clickable dense @click="emit('add')"><q-item-section>{{ gettext('Add') }}</q-item-section></q-item>
        <q-item v-close-popup clickable dense @click="emit('importDisk')"><q-item-section>{{ gettext('Import Hard Disk') }}</q-item-section></q-item>
      </q-list>
    </q-btn-dropdown>
    <q-btn no-caps outline size="12px" color="negative" class="u-button" :disable="!canRemove" :label="gettext('Remove')" @click="emit('remove')" />
    <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!isDisk" :label="gettext('Resize disk')" @click="emit('resize')" />
    <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!isDisk" :label="gettext('Move disk')" @click="emit('move')" />
    <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!canRevert" :label="gettext('Revert pending changes')" @click="emit('revert')" />
  </div>
</template>

<style scoped lang="scss">
.hardware-toolbar { margin-top: 0; margin-bottom: 4px; }
</style>
