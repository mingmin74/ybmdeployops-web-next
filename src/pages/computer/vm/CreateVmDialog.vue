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

const { state, options, actions, derived } = wizard;
const { loading, step, advanced } = state;
const { steps } = options;
const { moveStep, submit } = actions;
const { canCreate } = derived;
</script>
<template>
  <q-dialog
    v-model="model"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Create Virtual Machine')"
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
          class="u-button"
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
.vm-create-stepper :deep(.q-field__bottom) {
  display: block !important;
}
</style>
