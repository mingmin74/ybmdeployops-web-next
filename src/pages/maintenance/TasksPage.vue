<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';

const activeTab = shallowRef('backup');
const tabs = [
  { name: 'backup', label: 'Backup Tasks' },
  { name: 'snapshot', label: 'Snapshot Tasks' },
  { name: 'replication', label: 'Replication Tasks' },
  { name: 'bks', label: 'Bks management' },
];
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-tabs v-model="activeTab" class="text-grey" active-color="primary" indicator-color="primary" align="left" narrow-indicator>
        <q-tab v-for="tab in tabs" :key="tab.name" no-caps :name="tab.name" :label="gettext(tab.label)" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="activeTab" animated>
        <q-tab-panel v-for="tab in tabs" :key="tab.name" :name="tab.name">
          <div class="u-main-area text-grey-7">
            {{ gettext('This task page will be migrated in a later phase.') }}
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </div>
</template>
