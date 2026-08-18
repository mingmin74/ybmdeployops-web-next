<script setup lang="ts">
import { gettext } from '@/locale';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

defineOptions({ name: 'CtMountsStep' });

const { form, state, errors, derived } = useCreateCtWizardContext();
const { advanced } = state;
const { validationErrors } = errors;
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <q-input
          v-model.number="form.cores"
          dense
          type="number"
          min="1"
          max="8192"
          class="col q-field--with-bottom"
          :error="Boolean(validationErrors.cores)"
          :error-message="validationErrors.cores"
          :label="gettext('Cores')"
          :placeholder="gettext('unlimited')"
        />
      </div>

      <div v-if="advanced" class="row q-gutter-lg">
        <q-input
          v-model.number="form.cpuLimit"
          dense
          type="number"
          min="0"
          step="1"
          class="col q-field--with-bottom"
          :error="Boolean(validationErrors.cpuLimit)"
          :error-message="validationErrors.cpuLimit"
          :label="gettext('CPU limit')"
          :placeholder="gettext('unlimited')"
        />
        <q-input
          v-model.number="form.cpuUnits"
          dense
          type="number"
          min="8"
          :max="derived.cpuUnitsMaximum.value"
          class="col q-field--with-bottom"
          :error="Boolean(validationErrors.cpuUnits)"
          :error-message="validationErrors.cpuUnits"
          :label="gettext('CPU units')"
          :placeholder="String(derived.cpuUnitsDefault.value)"
        />
      </div>
    </div>
  </q-scroll-area>
</template>
