<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import DirectoryPage from '@/pages/storage/disks/DirectoryPage.vue';
import DiskPage from '@/pages/storage/disks/DiskPage.vue';
import LVMPage from '@/pages/storage/disks/LVMPage.vue';
import LVMThinPage from '@/pages/storage/disks/LVMThinPage.vue';
import ZFSPage from '@/pages/storage/disks/ZFSPage.vue';

defineProps<{
  node: string;
}>();

const activeTab = shallowRef('disk');

const tabs = [
  { name: 'disk', label: gettext('Disks'), icon: 'storage' },
  { name: 'lvm', label: 'LVM', icon: 'dns' },
  { name: 'lvmthin', label: 'LVM-Thin', icon: 'layers' },
  { name: 'directory', label: gettext('Directory'), icon: 'folder' },
  { name: 'zfs', label: 'ZFS', icon: 'view_module' },
];
</script>

<template>
  <q-splitter :model-value="146" unit="px" disable class="node-disk-panel full-height">
    <template #before>
      <q-tabs
        v-model="activeTab"
        align="left"
        vertical
        dense
        inline-label
        active-bg-color="blue-1"
        active-color="primary"
        class="node-disk-panel__tabs"
      >
        <q-tab v-for="tab in tabs" :key="tab.name" v-bind="tab" />
      </q-tabs>
    </template>

    <template #after>
      <q-tab-panels v-model="activeTab" class="bg-transparent full-height">
        <q-tab-panel name="disk" class="q-pa-none"><DiskPage embedded :node="node" /></q-tab-panel>
        <q-tab-panel name="lvm" class="q-pa-none"><LVMPage embedded :node="node" /></q-tab-panel>
        <q-tab-panel name="lvmthin" class="q-pa-none"><LVMThinPage embedded :node="node" /></q-tab-panel>
        <q-tab-panel name="directory" class="q-pa-none"><DirectoryPage embedded :node="node" /></q-tab-panel>
        <q-tab-panel name="zfs" class="q-pa-none"><ZFSPage embedded :node="node" /></q-tab-panel>
      </q-tab-panels>
    </template>
  </q-splitter>
</template>

<style scoped lang="scss">
.node-disk-panel { min-height: calc(100vh - 272px); }
.node-disk-panel :deep(.q-splitter__before) { background: #f7f9fc; border-right: 1px solid #e6ebf2; }
.node-disk-panel__tabs { padding: 10px 8px; }
.node-disk-panel__tabs :deep(.q-tab) { min-height: 36px; justify-content: flex-start; margin: 0 0 3px; padding: 0 10px 0 9px; border-left: 3px solid transparent; border-radius: 0 5px 5px 0; color: #5e6b7c; }
.node-disk-panel__tabs :deep(.q-tab--active) { border-left-color: #1976d2; font-weight: 600; }
.node-disk-panel__tabs :deep(.q-tab__label) { margin-left: 7px; font-size: 13px; }
.node-disk-panel__tabs :deep(.q-tab__icon) { width: 14px; height: 14px; font-size: 14px; }
.node-disk-panel__tabs :deep(.q-tab__indicator) { display: none; }
.node-disk-panel__tabs :deep(.q-tab:hover:not(.q-tab--active)) { background: #edf1f6; color: #334155; }
</style>
