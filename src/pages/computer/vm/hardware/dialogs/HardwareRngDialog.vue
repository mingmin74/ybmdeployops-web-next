<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const form = reactive({
  source: '/dev/urandom',
  maxBytes: '1024',
  period: '',
});
const { config, hasVmCapability, loading, updateConfig } = useVmHardwareContext();

const entropySourceOptions = ['/dev/urandom', '/dev/random', '/dev/hwrng'];
const hasRngDevice = computed(() => config.value.rng0 !== undefined);
const maxBytesValid = computed(() => {
  if (form.maxBytes.trim() === '') return true;
  const value = Number(form.maxBytes);
  return Number.isInteger(value) && value >= 0;
});
const periodValid = computed(() => {
  if (form.period.trim() === '') return true;
  const value = Number(form.period);
  return Number.isInteger(value) && value >= 1;
});
const canAdd = computed(
  () =>
    hasVmCapability('VM.Config.HWType') &&
    !hasRngDevice.value &&
    Boolean(form.source.trim()) &&
    maxBytesValid.value &&
    periodValid.value
);
const showLimiterWarning = computed(() => form.maxBytes.trim() === '');

watch(visible, (open) => {
  if (!open) return;
  Object.assign(form, {
    source: '/dev/urandom',
    maxBytes: '1024',
    period: '',
  });
});

function rngValue() {
  const parts = [`source=${form.source.trim()}`];
  const maxBytes = form.maxBytes.trim();
  const period = form.period.trim();

  if (maxBytes === '') {
    parts.push('max_bytes=0');
  } else if (!(maxBytes === '1024' && period === '')) {
    parts.push(`max_bytes=${maxBytes}`);
  }
  if (period) parts.push(`period=${period}`);
  return parts.join(',');
}

async function save() {
  if (!canAdd.value) return;
  await updateConfig({ rng0: rngValue() });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="`${gettext('Add')}:${gettext('VirtIO RNG')}`" width="440px" :loading="loading">
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <q-select
            v-model="form.source"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="entropySourceOptions"
            :label="gettext('Entropy source')"
          />
          <q-input
            v-model="form.maxBytes"
            dense
            type="number"
            min="0"
            step="1"
            class="q-field--with-bottom"
            :placeholder="gettext('unlimited')"
            :label="gettext('Limit (Bytes/Period)')"
            :error="!maxBytesValid"
            error-message="[0-]"
          />
          <q-input
            v-model="form.period"
            dense
            type="number"
            min="1"
            step="1"
            class="q-field--with-bottom"
            placeholder="1000"
            :label="`${gettext('Period')} (ms)`"
            :error="!periodValid"
            error-message="[1-]"
          />
        </div>
        <div v-if="showLimiterWarning" class="rng-warning q-mt-sm">
          {{ gettext('Disabling the limiter can potentially allow a guest to overload the host. Proceed with caution.') }}
        </div>
        <div v-if="hasRngDevice" class="rng-warning q-mt-sm">
          {{ gettext('VirtIO RNG') }} {{ gettext('This device is already in use') }}
        </div>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canAdd"
          :label="gettext('Add')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.rng-warning {
  padding: 8px 10px;
  border: 1px solid #f3d29a;
  background: #fff7e6;
  color: #8a5a00;
  font-size: 12px;
  line-height: 1.5;
}
</style>
