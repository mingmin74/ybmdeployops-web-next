<script setup lang="ts">
import { computed, shallowRef, toRef } from 'vue';
import { gettext } from '@/locale';

const props = defineProps<{ node: string }>();
const nodeRef = toRef(props, 'node');

const splitter = shallowRef(146);
const activeTab = shallowRef('ceph');

const tabs = [
  { name: 'ceph', label: 'Ceph', icon: 'cloud_queue' },
  { name: 'monitor', label: gettext('Monitor'), icon: 'visibility' },
  { name: 'osd', label: 'OSD', icon: 'dns' },
  { name: 'pool', label: gettext('Pool'), icon: 'view_quilt' },
];

const sectionTitle = computed(() => tabs.find((t) => t.name === activeTab.value)?.label || '');
</script>

<template>
  <section class="node-ceph-panel">
    <q-splitter v-model="splitter" unit="px" :limits="[126, 220]">
      <template #before>
        <q-tabs
          v-model="activeTab"
          vertical
          dense
          inline-label
          align="left"
          active-bg-color="blue-1"
          active-color="primary"
          class="node-ceph-tabs"
        >
          <q-tab v-for="tab in tabs" :key="tab.name" :name="tab.name" :label="tab.label" :icon="tab.icon" />
        </q-tabs>
      </template>
      <template #after>
        <q-tab-panels v-model="activeTab" class="bg-transparent">
          <q-tab-panel
            v-for="tab in tabs"
            :key="tab.name"
            :name="tab.name"
            class="q-pa-md node-ceph-placeholder"
          >
            <div class="row items-center q-mb-md node-ceph-placeholder__title">
              <q-icon :name="tab.icon" color="primary" size="18px" class="q-mr-sm" />
              <span class="text-h6">{{ sectionTitle }}</span>
            </div>
            <q-card flat bordered class="text-grey-6 q-pa-md">
              <q-icon name="construction" size="32px" class="q-mr-sm text-grey-5" />
              <span class="text-sm">{{ gettext('Module under construction.') }}</span>
            </q-card>
            <div class="row q-col-gutter-md q-mt-md">
              <div class="col-12 col-md-4">
                <q-skeleton type="text" width="42%" />
                <q-skeleton type="rect" height="74px" />
              </div>
              <div class="col-12 col-md-4">
                <q-skeleton type="text" width="52%" />
                <q-skeleton type="rect" height="74px" />
              </div>
              <div class="col-12 col-md-4">
                <q-skeleton type="text" width="38%" />
                <q-skeleton type="rect" height="74px" />
              </div>
            </div>
            <q-skeleton class="q-mt-lg" type="rect" height="220px" />
            <q-skeleton class="q-mt-md" type="rect" height="180px" />
          </q-tab-panel>
        </q-tab-panels>
      </template>
    </q-splitter>
  </section>
</template>

<style scoped>
.node-ceph-panel {
  min-height: calc(100vh - 272px);
  background: #fff;
}
.node-ceph-panel :deep(.q-splitter__before) {
  background: #f7f9fc;
  border-right: 1px solid #e6ebf2;
}
.node-ceph-tabs {
  padding: 10px 8px;
}
.node-ceph-tabs :deep(.q-tab) {
  min-height: 36px;
  justify-content: flex-start;
  margin: 0 0 3px;
  padding: 0 10px 0 9px;
  border-left: 3px solid transparent;
  border-radius: 0 5px 5px 0;
  color: #5e6b7c;
}
.node-ceph-tabs :deep(.q-tab--active) {
  border-left-color: #1976d2;
  font-weight: 600;
}
.node-ceph-tabs :deep(.q-tab__label) {
  margin-left: 7px;
  font-size: 13px;
}
.node-ceph-tabs :deep(.q-tab__icon) {
  width: 14px;
  height: 14px;
  font-size: 14px;
}
.node-ceph-tabs :deep(.q-tab__indicator) {
  display: none;
}
.node-ceph-tabs :deep(.q-tab:hover:not(.q-tab--active)) {
  background: #edf1f6;
  color: #334155;
}
.node-ceph-placeholder__title {
  font-size: 14px;
  color: #333;
}
</style>
