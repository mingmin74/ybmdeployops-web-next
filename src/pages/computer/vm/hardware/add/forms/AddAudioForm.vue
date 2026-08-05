<script setup lang="ts">
import { computed } from 'vue';
import { gettext } from '@/locale';

export interface AddAudioFormModel {
  audioDevice: string;
  audioDriver: string;
}

const form = defineModel<AddAudioFormModel>('form', { required: true });
const { deviceInUse = false } = defineProps<{ deviceInUse?: boolean }>();

const audioDeviceOptions = [
  { label: 'ich9-intel-hda', value: 'ich9-intel-hda' },
  { label: 'intel-hda', value: 'intel-hda' },
  { label: 'AC97', value: 'AC97' },
];

const backendDriverOptions = [
  { label: 'SPICE', value: 'spice' },
  { label: `${gettext('None')} (${gettext('Dummy Device')})`, value: 'none' },
];

const deviceValid = computed(() => Boolean(form.value.audioDevice.trim()));
</script>

<template>
  <div class="add-audio-form u-dense">
    <div class="u-border q-pa-md">
      <div class="row q-col-gutter-lg">
        <div class="col">
          <q-select
            v-model="form.audioDevice"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="audioDeviceOptions"
            :label="gettext('Audio Device')"
            :error="!deviceValid || deviceInUse"
            :error-message="
              deviceInUse
                ? gettext('This device is already in use')
                : gettext('This field is required')
            "
          />
          <q-select
            v-model="form.audioDriver"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="backendDriverOptions"
            :label="gettext('Backend Driver')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
