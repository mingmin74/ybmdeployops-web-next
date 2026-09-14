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
const state = shallowRef<'started' | 'stopped' | 'ignored' | 'disabled'>('started');
const maxRestart = shallowRef(1);
const maxRelocate = shallowRef(1);
const failback = shallowRef(true);
// The currently connected PVE API schema does not support this newer HA resource option.
// const autoRebalance = shallowRef(true);
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
    const savedState = textValue(resource?.state);
    state.value = ['started', 'stopped', 'ignored', 'disabled'].includes(savedState)
      ? (savedState as typeof state.value)
      : 'started';
    maxRestart.value = Number(resource?.max_restart ?? 1);
    maxRelocate.value = Number(resource?.max_relocate ?? 1);
    failback.value = resource?.failback !== 0;
    // autoRebalance.value = resource?.['auto-rebalance'] !== 0;
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
      // 'auto-rebalance': autoRebalance.value ? 1 : 0,
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
  () => void load()
);
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Manage HA')"
      width="600px"
      :loading="loading"
    >
      <div class="q-pa-md">
        <div class="row q-col-gutter-lg">
          <div class="col-6">
            <q-input
              :model-value="props.vmid === undefined ? '' : String(props.vmid)"
              dense
              readonly
              class="q-field--with-bottom"
              :label="gettext(props.resourceType === 'ct' ? 'CT' : 'VM')"
            />
            <q-input
              v-model.number="maxRestart"
              dense
              type="number"
              min="0"
              max="10"
              class="q-field--with-bottom"
              :label="gettext('Max Restart')"
            />
            <q-input
              v-model.number="maxRelocate"
              dense
              type="number"
              min="0"
              max="10"
              class="q-field--with-bottom"
              :label="gettext('Max Relocate')"
            />
          </div>
          <div class="col-6">
            <div class="ha-checkbox-field q-field--with-bottom">
              <q-checkbox
                v-model="failback"
                dense
                right-label
                color="primary"
                class="full-width"
                :label="gettext('Failback')"
              />
            </div>
            <!--
            The current backend rejects the newer `auto-rebalance` HA resource property.
            Restore this field together with its state handling and request parameter once supported.
            <div class="ha-checkbox-field q-field--with-bottom">
              <q-checkbox
                v-model="autoRebalance"
                dense
                right-label
                color="primary"
                class="full-width"
                :label="gettext('Auto Rebalance')"
              />
            </div>
            -->
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
                { label: gettext('Ignored'), value: 'ignored' },
                { label: gettext('Disabled'), value: 'disabled' },
              ]"
              :label="gettext('Request State')"
            />
          </div>
        </div>
        <q-input
          v-model="comment"
          dense
          class="q-field--with-bottom"
          :label="gettext('Comment')"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :disable="loading"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :loading="loading"
          :label="gettext('Save')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.ha-checkbox-field {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  height: 55px;
}
</style>
