<script setup lang="ts">
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

defineOptions({ name: 'CtConfirmStep' });

const { derived } = useCreateCtWizardContext();
const { summaryRows } = derived;
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <q-list>
        <q-item v-for="[key, value] in summaryRows" :key="key">
          <q-item-section>
            <div>
              <strong>{{ key }}:</strong> {{ value }}
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-scroll-area>
</template>
