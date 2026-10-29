<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import {
  getNoVncScalingPreference,
  setNoVncScalingPreference,
  type NoVncScalingPreference,
} from '@/utils/consolePreferences';

type XtermSetting = 'fontFamily' | 'fontSize' | 'letterSpacing' | 'lineHeight';

const visible = defineModel<boolean>({ required: true });
const xtermSettings: XtermSetting[] = ['fontFamily', 'fontSize', 'letterSpacing', 'lineHeight'];
const form = reactive<Record<XtermSetting, string>>({
  fontFamily: '',
  fontSize: '',
  letterSpacing: '',
  lineHeight: '',
});
const saved = reactive<Record<XtermSetting, string>>({ ...form });
const scaling = shallowRef<NoVncScalingPreference>('__default__');
const scalingOptions: { label: string; value: NoVncScalingPreference }[] = [
  { label: gettext('Default'), value: '__default__' },
  { label: gettext('Local Scaling'), value: 'scale' },
  { label: gettext('Remote Resizing'), value: 'remote' },
  { label: gettext('Off'), value: 'off' },
];

function validNumber(value: string, minimum?: number, integer = false) {
  if (!value.trim()) return true;
  const number = Number(value);
  return (
    Number.isFinite(number) &&
    (!integer || Number.isInteger(number)) &&
    (minimum === undefined || number >= minimum)
  );
}

const valid = computed(
  () =>
    validNumber(form.fontSize, 1, true) &&
    validNumber(form.letterSpacing) &&
    validNumber(form.lineHeight, 0.1)
);
const dirty = computed(() => xtermSettings.some((setting) => form[setting] !== saved[setting]));
const hasValues = computed(() => xtermSettings.some((setting) => Boolean(form[setting])));

function loadSettings() {
  xtermSettings.forEach((setting) => {
    const value = localStorage.getItem(`pve-xterm-${setting}`) || '';
    form[setting] = value;
    saved[setting] = value;
  });
  scaling.value = getNoVncScalingPreference();
}

function saveXterm() {
  if (!dirty.value || !valid.value) return;
  xtermSettings.forEach((setting) => {
    const value = form[setting];
    if (value) localStorage.setItem(`pve-xterm-${setting}`, value);
    else localStorage.removeItem(`pve-xterm-${setting}`);
    saved[setting] = value;
  });
}

function resetXterm() {
  xtermSettings.forEach((setting) => {
    form[setting] = '';
    saved[setting] = '';
    localStorage.removeItem(`pve-xterm-${setting}`);
  });
}

function updateScaling(value: NoVncScalingPreference) {
  scaling.value = value;
  setNoVncScalingPreference(value);
}

watch(visible, (isVisible) => {
  if (isVisible) loadSettings();
});
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('My Settings')"
      width="560px"
    >
      <div class="q-pa-sm u-dense">
        <fieldset class="u-border q-pa-md q-mb-sm">
          <legend>{{ gettext('xterm.js Settings') }}</legend>
          <q-input
            v-model="form.fontFamily"
            dense
            class="q-field--with-bottom"
            :label="gettext('Font-Family')"
            :placeholder="gettext('Default')"
          />
          <q-input
            v-model="form.fontSize"
            dense
            type="number"
            min="1"
            step="1"
            class="q-field--with-bottom"
            :error="!validNumber(form.fontSize, 1, true)"
            :error-message="gettext('Value must be a positive integer')"
            :label="gettext('Font-Size')"
            :placeholder="gettext('Default')"
          />
          <q-input
            v-model="form.letterSpacing"
            dense
            type="number"
            step="any"
            class="q-field--with-bottom"
            :error="!validNumber(form.letterSpacing)"
            :error-message="gettext('Invalid number')"
            :label="gettext('Letter Spacing')"
            :placeholder="gettext('Default')"
          />
          <q-input
            v-model="form.lineHeight"
            dense
            type="number"
            min="0.1"
            step="any"
            class="q-field--with-bottom"
            :error="!validNumber(form.lineHeight, 0.1)"
            :error-message="gettext('Value must be at least 0.1')"
            :label="gettext('Line Height')"
            :placeholder="gettext('Default')"
          />
          <div class="row justify-end q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!hasValues"
              :label="gettext('Reset')"
              @click="resetXterm"
            />
            <q-btn
              no-caps
              flat
              size="12px"
              class="bg-primary text-grey-1 u-button"
              :disable="!dirty || !valid"
              :label="gettext('Save')"
              @click="saveXterm"
            />
          </div>
        </fieldset>
        <fieldset class="u-border q-pa-md">
          <legend>{{ gettext('noVNC Settings') }}</legend>
          <q-select
            :model-value="scaling"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="scalingOptions"
            :label="gettext('Scaling mode')"
            @update:model-value="updateScaling"
          />
        </fieldset>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Close')"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
