<script setup lang="ts">
import { provide } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { createVmWizardKey } from './create-vm/context/createVmWizardContext';
import { useCreateVmWizard } from './create-vm/composables/useCreateVmWizard';
import ConfirmStep from './create-vm/steps/ConfirmStep.vue';
import DiskStep from './create-vm/steps/DiskStep.vue';
import CpuStep from './create-vm/steps/CpuStep.vue';
import GeneralStep from './create-vm/steps/GeneralStep.vue';
import MemoryStep from './create-vm/steps/MemoryStep.vue';
import NetworkStep from './create-vm/steps/NetworkStep.vue';
import OsStep from './create-vm/steps/OsStep.vue';
import SystemStep from './create-vm/steps/SystemStep.vue';

const model = defineModel<boolean>({ required: true });
const emit = defineEmits<{
  completed: [];
  task: [payload: { node: string; upid: string; title: string }];
}>();
const wizard = useCreateVmWizard(model, emit);
provide(createVmWizardKey, wizard);

const { state, errors, options, actions, derived } = wizard;
const { loading, step, advanced } = state;
const { validationErrorEntries } = errors;
const { steps } = options;
const { moveStep, submit } = actions;
const { canCreate } = derived;
</script>
<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Create Virtual Machine')" width="800px" :loading="loading">
      <q-stepper
        v-model="step"
        flat
        bordered
        animated
        color="primary"
        header-class="bg-white"
        class="vm-create-stepper no-box-shadow no-shadow q-ma-sm no-border-radius bg-grey-1"
      >
        <q-step
          v-for="item in steps"
          :key="item.name"
          :name="item.name"
          :title="item.title"
          :icon="item.icon"
          :active-icon="item.icon"
          done-icon="check"
          :done="
            steps.findIndex((stepItem) => stepItem.name === step) >
            steps.findIndex((stepItem) => stepItem.name === item.name)
          "
        >
          <div
            v-if="item.name === step && validationErrorEntries.length"
            class="vm-create-validation-slot"
          >
            <q-banner dense class="vm-create-validation">
              <template #avatar>
                <q-icon name="warning_amber" size="18px" />
              </template>
              <div
                v-for="([field, message], index) in validationErrorEntries"
                :key="field"
                class="vm-create-validation__item"
              >
                {{ index + 1 }}. {{ message }}
              </div>
            </q-banner>
          </div>
          <GeneralStep v-if="item.name === 'general'" />
          <OsStep v-else-if="item.name === 'os'" />
          <SystemStep v-else-if="item.name === 'system'" />
          <DiskStep v-else-if="item.name === 'disks'" />
          <CpuStep v-else-if="item.name === 'cpu'" />
          <MemoryStep v-else-if="item.name === 'memory'" />
          <NetworkStep v-else-if="item.name === 'network'" />
          <ConfirmStep v-else />
        </q-step>
      </q-stepper>
      <template #foot>
        <q-checkbox
          v-if="step !== 'confirm'"
          v-model="advanced"
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
          :disable="loading"
          :label="gettext('Back')"
          @click="moveStep(-1)"
        />
        <q-btn
          v-if="step !== 'confirm'"
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :label="gettext('Next')"
          @click="moveStep(1)"
        />
        <q-btn
          v-else
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :disable="!canCreate"
          :loading="loading"
          :label="gettext('Create')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.vm-create-stepper :deep(.q-stepper__header) {
  box-shadow: none;
}

.vm-create-stepper :deep(.q-stepper__tab) {
  min-height: 48px;
  padding: 8px;
}
.vm-create-stepper :deep(.q-stepper__dot) {
  font-size: 18px;
}
.vm-create-stepper :deep(.q-checkbox) {
  margin-left: -4px;
  padding: 18px 0 17px;
}
.vm-create-validation-slot {
  height: 72px;
  box-sizing: border-box;
  padding: 8px 8px 0;
}
.vm-create-validation {
  align-items: flex-start;
  height: 64px;
  background: #fff4f2;
  border: 1px solid #ffb7aa;
  border-radius: 0;
  box-shadow: none;
  color: #cf4c35;
  font-size: 12px;
  line-height: 1.5;
  overflow-y: auto;
}
.vm-create-validation :deep(.q-banner__avatar) {
  align-self: flex-start;
  min-width: 28px;
  padding: 6px 0 0 8px;
}
.vm-create-validation :deep(.q-banner__content) {
  padding: 6px 10px 6px 4px;
}
.vm-create-validation__item + .vm-create-validation__item {
  margin-top: 2px;
}
</style>
