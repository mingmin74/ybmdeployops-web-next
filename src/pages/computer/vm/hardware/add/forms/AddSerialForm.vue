<script setup lang="ts">
import { computed } from 'vue';
import { gettext } from '@/locale';

export interface AddSerialFormModel {
  serialId: number;
}

const form = defineModel<AddSerialFormModel>('form', { required: true });
const { deviceInUse = false } = defineProps<{ deviceInUse?: boolean }>();

const serialValid = computed(
  () =>
    Number.isInteger(form.value.serialId) && form.value.serialId >= 0 && form.value.serialId <= 3,
);

function clampSerialId() {
  if (!Number.isFinite(form.value.serialId)) {
    form.value.serialId = 0;
    return;
  }
  if (form.value.serialId > 3) form.value.serialId = 3;
  if (form.value.serialId < 0) form.value.serialId = 0;
}
</script>

<template>
  <div class="add-serial-form u-dense">
    <div class="u-border q-pa-md">
      <div class="row q-col-gutter-lg">
        <div class="col">
          <q-input
            v-model.number="form.serialId"
            dense
            type="number"
            min="0"
            max="3"
            class="q-field--with-bottom"
            :label="gettext('Serial Port')"
            :error="!serialValid || deviceInUse"
            :error-message="deviceInUse ? gettext('This device is already in use') : '[0-3]'"
            @blur="clampSerialId"
            @update:model-value="clampSerialId"
          />
        </div>
      </div>
    </div>
  </div>
</template>
