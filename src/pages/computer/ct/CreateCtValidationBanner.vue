<script setup lang="ts">
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

const { errors } = useCreateCtWizardContext();
const { validationErrorEntries } = errors;
</script>

<template>
  <div v-if="validationErrorEntries.length" class="ct-create-validation-slot">
    <q-banner dense class="ct-create-validation">
      <template #avatar><q-icon name="warning_amber" size="18px" /></template>
      <div
        v-for="([field, message], index) in validationErrorEntries"
        :key="field"
        class="ct-create-validation__item"
      >
        {{ index + 1 }}. {{ message }}
      </div>
    </q-banner>
  </div>
</template>

<style scoped>
.ct-create-validation-slot {
  height: 72px;
  box-sizing: border-box;
  padding: 8px 8px 0;
}

.ct-create-validation {
  align-items: flex-start;
  height: 64px;
  overflow-y: auto;
  background: #fff4f2;
  border: 1px solid #ffb7aa;
  border-radius: 0;
  box-shadow: none;
  color: #cf4c35;
  font-size: 12px;
  line-height: 1.5;
}

.ct-create-validation :deep(.q-banner__avatar) {
  align-self: flex-start;
  min-width: 28px;
  padding: 6px 0 0 8px;
}

.ct-create-validation :deep(.q-banner__content) {
  padding: 6px 10px 6px 4px;
}

.ct-create-validation__item + .ct-create-validation__item {
  margin-top: 2px;
}
</style>
