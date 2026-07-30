<script setup lang="ts">
import { reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const form = reactive({
  directoryId: '',
  cache: '__default__',
  xattr: false,
  acl: false,
  directIo: false,
});
const { hasVmCapability, loading, nextDeviceKey, updateConfig } = useVmHardwareContext();

watch(visible, (isVisible) => {
  if (!isVisible) return;
  Object.assign(form, {
    directoryId: '',
    cache: '__default__',
    xattr: false,
    acl: false,
    directIo: false,
  });
});

async function addVirtiofs() {
  if (!hasVmCapability('VM.Config.Options') || !form.directoryId.trim()) return;
  const values = [`dirid=${form.directoryId.trim()}`];
  if (form.cache !== '__default__') values.push(`cache=${form.cache}`);
  if (form.xattr || form.acl) values.push('expose-xattr=1');
  if (form.acl) values.push('expose-acl=1');
  if (form.directIo) values.push('direct-io=1');
  await updateConfig({ [nextDeviceKey('virtiofs')]: values.join(',') });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Virtiofs Filesystem Passthrough')" width="460px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-input
          v-model="form.directoryId"
          dense
          square
          outlined
          :label="gettext('Directory ID')"
          :hint="gettext('Directory Mappings can be managed under Datacenter -> Directory Mappings')"
        />
        <q-select
          v-model="form.cache"
          dense
          square
          outlined
          emit-value
          map-options
          :options="[
            { label: `${gettext('Default')} (auto)`, value: '__default__' },
            { label: 'auto', value: 'auto' },
            { label: 'always', value: 'always' },
            { label: 'metadata', value: 'metadata' },
            { label: 'never', value: 'never' },
          ]"
          :label="gettext('Cache')"
        />
        <q-checkbox v-model="form.xattr" :disable="form.acl" :label="gettext('xattr Support')" />
        <q-checkbox v-model="form.acl" :label="gettext('POSIX ACLs')" />
        <q-checkbox v-model="form.directIo" :label="gettext('Allow Direct IO')" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!form.directoryId.trim()"
          :label="gettext('Add')"
          @click="addVirtiofs"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
