<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { createHaResource, getHaResource, updateHaResource } from '@/api/ha';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  vmid?: number | string | undefined;
  resourceType: 'vm' | 'ct';
}>();
const emit = defineEmits<{ completed: [] }>();

const loading = shallowRef(false);
const resourceExists = shallowRef(false);
const state = shallowRef<'started' | 'stopped'>('started');
const maxRestart = shallowRef(1);
const maxRelocate = shallowRef(1);
const failback = shallowRef(true);
const autoRebalance = shallowRef(true);
const comment = shallowRef('');

function resourceId() {
  return props.vmid === undefined ? '' : `${props.resourceType}:${props.vmid}`;
}

async function load() {
  const id = resourceId();
  if (!visible.value || !id) return;

  loading.value = true;
  try {
    const response = await getHaResource(id).catch(() => null);
    const resource = response?.data;
    resourceExists.value = Boolean(resource);
    state.value = textValue(resource?.state) === 'stopped' ? 'stopped' : 'started';
    maxRestart.value = Number(resource?.max_restart ?? 1);
    maxRelocate.value = Number(resource?.max_relocate ?? 1);
    failback.value = resource?.failback !== 0;
    autoRebalance.value = resource?.['auto-rebalance'] !== 0;
    comment.value = textValue(resource?.comment);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const id = resourceId();
  if (!id) return;

  loading.value = true;
  try {
    const data = {
      sid: id,
      type: props.resourceType,
      state: state.value,
      max_restart: maxRestart.value,
      max_relocate: maxRelocate.value,
      failback: failback.value ? 1 : 0,
      'auto-rebalance': autoRebalance.value ? 1 : 0,
      comment: comment.value,
    };
    if (resourceExists.value) await updateHaResource(id, data);
    else await createHaResource(data);
    visible.value = false;
    emit('completed');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [visible.value, props.resourceType, props.vmid],
  () => void load(),
);
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Manage HA')" width="420px" :loading="loading">
      <div class="q-pa-md">
        <q-select
          v-model="state"
          dense
          options-dense
          emit-value
          map-options
          class="q-field--with-bottom"
          :options="[
            { label: gettext('Started'), value: 'started' },
            { label: gettext('Stopped'), value: 'stopped' },
          ]"
          :label="gettext('Requested State')"
        />
        <div class="row q-gutter-lg">
          <div class="col">
            <q-input
              v-model.number="maxRestart"
              dense
              type="number"
              min="0"
              class="q-field--with-bottom"
              :label="gettext('Max Restart')"
            />
          </div>
          <div class="col">
            <q-input
              v-model.number="maxRelocate"
              dense
              type="number"
              min="0"
              class="q-field--with-bottom"
              :label="gettext('Max Relocate')"
            />
          </div>
        </div>
        <q-checkbox v-model="failback" dense right-label color="primary" :label="gettext('Failback')" />
        <q-checkbox v-model="autoRebalance" dense right-label color="primary" :label="gettext('Auto Rebalance')" />
        <q-input
          v-model="comment"
          dense
          class="q-field--with-bottom"
          :label="gettext('Comment')"
        />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :disable="loading" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :loading="loading" :label="gettext('Save')" @click="submit" />
      </template>
    </UWindow>
  </q-dialog>
</template>
