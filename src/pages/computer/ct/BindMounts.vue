<script setup lang="ts">
import { gettext } from '@/locale';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

const { form, errors } = useCreateCtWizardContext();
const { validationErrors } = errors;
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <q-input
          v-model.number="form.memory"
          dense
          type="number"
          min="16"
          step="32"
          class="col q-field--with-bottom"
          :error="Boolean(validationErrors.memory)"
          :error-message="validationErrors.memory"
          :label="`${gettext('Memory')} (MiB)`"
        />
        <q-input
          v-model.number="form.swap"
          dense
          type="number"
          min="0"
          step="32"
          class="col q-field--with-bottom"
          :error="Boolean(validationErrors.swap)"
          :error-message="validationErrors.swap"
          :label="`${gettext('Swap')} (MiB)`"
        />
      </div>
    </div>
  </q-scroll-area>
</template>
