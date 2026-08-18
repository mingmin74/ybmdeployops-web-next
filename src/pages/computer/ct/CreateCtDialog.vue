<script setup lang="ts">
import { computed, provide } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { createCtWizardKey } from './create-ct/context/createCtWizardContext';
import { useCreateCtWizard } from './create-ct/composables/useCreateCtWizard';
import CreateCtGeneral from './General.vue';
import CreateCtTemplate from './Template.vue';
import CreateCtHardware from './Hardware.vue';
import CreateCtConfirm from './Confirm.vue';
import CreateCtMounts from './Mounts.vue';
import CreateCtBindMounts from './BindMounts.vue';
import CreateCtLimits from './Limits.vue';
import CreateCtDns from './Dns.vue';
import CreateCtValidationBanner from './CreateCtValidationBanner.vue';

const model = defineModel<boolean>({ required: true });
const props = defineProps<{ preferredNode?: string }>();
const emit = defineEmits<{
  completed: [];
  task: [payload: { node: string; upid: string; title: string }];
}>();
const wizard = useCreateCtWizard(model, emit, () => props.preferredNode || '');
provide(createCtWizardKey, wizard);

const { state, errors, actions, derived } = wizard;
const { loading, step, advanced, networkAdvanced } = state;
const { validationError } = errors;
const { moveStep, submit } = actions;
const { canSubmit, canProceedGeneral } = derived;
const nextDisabled = computed(
  () => loading.value || (step.value === 'general' && !canProceedGeneral.value)
);

async function next() {
  await moveStep(1);
}

const currentAdvanced = computed({
  get: () => (step.value === 'limits' ? networkAdvanced.value : advanced.value),
  set: (value: boolean) => {
    if (step.value === 'limits') networkAdvanced.value = value;
    else advanced.value = value;
  },
});
</script>

<template>
  <q-dialog
    v-model="model"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Create CT Container')"
      width="800px"
      :loading="loading"
    >
      <q-stepper
        v-model="step"
        flat
        bordered
        animated
        color="primary"
        header-class="bg-white"
        class="ct-create-stepper no-box-shadow no-shadow q-ma-sm no-border-radius bg-grey-1"
      >
        <q-step
          name="general"
          :title="gettext('General')"
          icon="settings"
          active-icon="settings"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtGeneral />
        </q-step>
        <q-step
          name="template"
          :title="gettext('Template')"
          icon="inventory_2"
          active-icon="inventory_2"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtTemplate />
        </q-step>
        <q-step
          name="hardware"
          :title="gettext('Disk')"
          icon="storage"
          active-icon="storage"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtHardware />
        </q-step>
        <q-step
          name="mounts"
          :title="gettext('CPU')"
          icon="memory"
          active-icon="memory"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtMounts />
        </q-step>
        <q-step
          name="bindmounts"
          :title="gettext('Memory')"
          icon="developer_board"
          active-icon="developer_board"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtBindMounts />
        </q-step>
        <q-step
          name="limits"
          :title="gettext('Network')"
          icon="settings_ethernet"
          active-icon="settings_ethernet"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtLimits />
        </q-step>
        <q-step
          name="dns"
          :title="gettext('DNS')"
          icon="dns"
          active-icon="dns"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtDns />
        </q-step>
        <q-step
          name="confirm"
          :title="gettext('Confirm')"
          icon="check"
          active-icon="check"
          done-icon="check"
        >
          <CreateCtValidationBanner />
          <CreateCtConfirm />
          <div
            v-if="validationError"
            class="text-negative text-caption q-mt-sm q-pa-md"
          >
            {{ validationError }}
          </div>
        </q-step>
      </q-stepper>
      <template #foot>
        <q-checkbox
          v-if="step === 'general' || step === 'mounts' || step === 'limits'"
          v-model="currentAdvanced"
          dense
          right-label
          color="primary"
          :label="gettext('Advanced')"
        />
        <q-space />
        <q-btn
          v-if="step !== 'general'"
          no-caps
          flat
          size="12px"
          class="bg-grey-8 text-grey-1 u-button"
          :disable="nextDisabled"
          :label="gettext('Back')"
          @click="moveStep(-1)"
        />
        <q-btn
          v-if="step !== 'confirm'"
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :disable="loading"
          :label="gettext('Next')"
          @click="next"
        />
        <q-btn
          v-else
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :disable="!canSubmit"
          :loading="loading"
          :label="gettext('Create')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.ct-create-stepper :deep(.q-stepper__header) {
  box-shadow: none;
}

.ct-create-stepper :deep(.q-stepper__tab) {
  min-height: 48px;
  /* padding: 8px; */
}

.ct-create-stepper :deep(.q-stepper__dot) {
  font-size: 18px;
}
</style>
