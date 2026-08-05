<script setup lang="ts">
import { gettext } from '@/locale';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

const { form } = useCreateCtWizardContext();
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <q-input
        v-model="form.searchdomain"
        dense
        class="q-field--with-bottom"
        :label="gettext('DNS domain')"
        :placeholder="gettext('use host settings')"
      />
      <q-input
        v-model="form.nameserver"
        dense
        class="q-field--with-bottom"
        :label="gettext('DNS servers')"
        :placeholder="gettext('use host settings')"
      />
    </div>
  </q-scroll-area>
</template>
