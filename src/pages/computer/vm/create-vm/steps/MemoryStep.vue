<script setup lang="ts">
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, state, errors, derived } = useCreateVmWizardContext();
const { advanced } = state;
const { validationErrors } = errors;
const { stepContentHeight } = derived;
</script>

<template>
  <q-scroll-area class="q-pa-sm" :style="{ height: stepContentHeight('memory') }">
    <div class="q-px-md q-py-sm u-border-dotted-blue bg-white">
      <div class="row q-gutter-lg">
        <div class="col">
          <q-input
            v-model.number="form.memory"
            :error="Boolean(validationErrors.memory)"
            :error-message="validationErrors.memory"
            dense
            type="number"
            min="128"
            step="32"
            class="q-field--with-bottom"
            :label="gettext('Memory (MiB)')"
          />
        </div>
      </div>
    </div>
    <div v-if="advanced" class="q-mt-sm u-border-dotted-blue q-px-md q-py-sm bg-white">
      <div class="row q-gutter-lg">
        <div class="col">
          <q-input
            v-model.number="form.balloon"
            :error="Boolean(validationErrors.balloon)"
            :error-message="validationErrors.balloon"
            dense
            type="number"
            min="1"
            :max="form.memory"
            step="32"
            class="q-field--with-bottom"
            :disable="!form.ballooning"
            :label="gettext('Minimum memory')"
          />
          <q-checkbox
            v-model="form.ballooning"
            dense
            right-label
            color="primary"
            :label="gettext('Ballooning Device')"
            class="q-field--with-bottom"
          />
        </div>
        <div class="col">
          <q-input
            v-model="form.shares"
            :error="Boolean(validationErrors.shares)"
            :error-message="validationErrors.shares"
            dense
            type="number"
            min="0"
            max="50000"
            step="10"
            class="q-field--with-bottom"
            :disable="!form.ballooning || form.balloon === form.memory"
            :label="gettext('Shares')"
            :placeholder="`${gettext('Default')} (1000)`"
          />
          <q-checkbox
            v-model="form.allowKsm"
            dense
            right-label
            color="primary"
            :label="gettext('Allow KSM')"
            class="q-field--with-bottom"
          />
        </div>
      </div>
    </div>
  </q-scroll-area>
</template>
