<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import OptionFormHint from './OptionFormHint.vue';

const props = defineProps<{ modelValue?: PveRecord }>();
const emit = defineEmits<{ 'update:modelValue': [value: PveRecord] }>();

interface CrsForm {
  ha: string;
  'ha-rebalance-on-start': number;
  'ha-auto-rebalance': number;
  'ha-auto-rebalance-threshold': string;
  'ha-auto-rebalance-method': string;
  'ha-auto-rebalance-hold-duration': string;
  'ha-auto-rebalance-margin': string;
}

const form = reactive<CrsForm>({
  ha: '__default__',
  'ha-rebalance-on-start': 0,
  'ha-auto-rebalance': 0,
  'ha-auto-rebalance-threshold': '',
  'ha-auto-rebalance-method': '__default__',
  'ha-auto-rebalance-hold-duration': '',
  'ha-auto-rebalance-margin': '',
});

function syncForm(value?: PveRecord) {
  form.ha = textValue(value?.ha, '__default__');
  form['ha-rebalance-on-start'] = Number(value?.['ha-rebalance-on-start']) ? 1 : 0;
  form['ha-auto-rebalance'] = Number(value?.['ha-auto-rebalance']) ? 1 : 0;
  form['ha-auto-rebalance-threshold'] = textValue(value?.['ha-auto-rebalance-threshold']);
  form['ha-auto-rebalance-method'] = textValue(value?.['ha-auto-rebalance-method'], '__default__');
  form['ha-auto-rebalance-hold-duration'] = textValue(value?.['ha-auto-rebalance-hold-duration']);
  form['ha-auto-rebalance-margin'] = textValue(value?.['ha-auto-rebalance-margin']);
}

watch(() => props.modelValue, syncForm, { immediate: true, deep: true });
watch(form, (value) => emit('update:modelValue', { ...value }), { deep: true });

const modeOptions = [
  { label: `${gettext('Default')} (basic)`, value: '__default__' },
  { label: gettext('Basic (Resource Count)'), value: 'basic' },
  { label: gettext('Static Load'), value: 'static' },
  { label: gettext('Dynamic Load'), value: 'dynamic' },
];

const methodOptions = [
  { label: `${gettext('Default')} (bruteforce)`, value: '__default__' },
  { label: 'Bruteforce', value: 'bruteforce' },
  { label: 'TOPSIS', value: 'topsis' },
];

const canUseAutoRebalancing = computed(() => form.ha === 'static' || form.ha === 'dynamic');
const autoRebalancingDisabled = computed(() => !canUseAutoRebalancing.value || !form['ha-auto-rebalance']);
</script>

<template>
  <div class="column q-gutter-sm">
    <q-select v-model="form.ha" dense emit-value map-options options-dense :options="modeOptions" :label="gettext('Scheduling Mode')" />
    <q-checkbox v-model="form['ha-rebalance-on-start']" :true-value="1" :false-value="0" :label="gettext('Rebalance on Start')" />
    <q-checkbox v-model="form['ha-auto-rebalance']" :true-value="1" :false-value="0" :disable="!canUseAutoRebalancing" :label="gettext('Automatic Rebalance')" />
    <template>
      <q-input v-model="form['ha-auto-rebalance-threshold']" dense type="number" min="0" max="100" :disable="autoRebalancingDisabled" :label="gettext('Imbalance Threshold (%)')" :rules="[(value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100) || gettext('Value must be between 0 and 100')]" />
      <OptionFormHint>{{ `${gettext('Default')} (30)` }}</OptionFormHint>
      <q-select v-model="form['ha-auto-rebalance-method']" dense emit-value map-options options-dense :disable="autoRebalancingDisabled" :options="methodOptions" :label="gettext('Rebalancing Method')" />
      <q-input v-model="form['ha-auto-rebalance-hold-duration']" dense type="number" min="0" :disable="autoRebalancingDisabled" :label="gettext('Hold Duration')" :rules="[(value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 0) || gettext('Invalid hold duration')]" />
      <OptionFormHint>{{ `${gettext('Default')} (3)` }}</OptionFormHint>
      <q-input v-model="form['ha-auto-rebalance-margin']" dense type="number" min="0" max="100" :disable="autoRebalancingDisabled" :label="gettext('Minimum Imbalance Improvement (%)')" :rules="[(value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100) || gettext('Value must be between 0 and 100')]" />
      <OptionFormHint>{{ `${gettext('Default')} (10)` }}</OptionFormHint>
    </template>
  </div>
</template>
