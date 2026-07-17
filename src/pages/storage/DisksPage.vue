<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import DirectoryPage from './disks/DirectoryPage.vue';
import DiskPage from './disks/DiskPage.vue';
import LVMPage from './disks/LVMPage.vue';
import LVMThinPage from './disks/LVMThinPage.vue';
import ZFSPage from './disks/ZFSPage.vue';

const activeTab = shallowRef('disk');
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-card>
        <q-tabs
          v-model="activeTab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="left"
          narrow-indicator
        >
          <q-tab no-caps name="disk" :label="gettext('Disks')" />
          <q-tab no-caps name="directory" :label="gettext('Mount Point')" />
          <q-tab no-caps name="LVM" :label="gettext('LVM')" />
          <q-tab no-caps name="LVMThin" :label="gettext('LVMThin')" />
          <q-tab no-caps name="ZFS" :label="gettext('ZFS')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="activeTab" animated>
          <q-tab-panel name="disk">
            <DiskPage embedded />
          </q-tab-panel>
          <q-tab-panel name="directory">
            <DirectoryPage embedded />
          </q-tab-panel>
          <q-tab-panel name="LVM">
            <LVMPage embedded />
          </q-tab-panel>
          <q-tab-panel name="LVMThin">
            <LVMThinPage embedded />
          </q-tab-panel>
          <q-tab-panel name="ZFS">
            <ZFSPage embedded />
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </q-card>
  </div>
</template>
