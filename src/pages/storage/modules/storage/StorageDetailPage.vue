<script setup lang="ts">
import { computed, ref } from 'vue';
import StorageContentTable from '@/components/StorageContentTable.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes, formatContent, textValue, usedPercent } from '@/utils/pveFormat';

const props = defineProps<{
  node: string;
  storage: PveRecord;
}>();

const tab = ref('summary');

const contentTabs = computed(() => {
  const content = textValue(props.storage.content);
  const tokens = content.split(',').map((item) => item.trim()).filter(Boolean);
  const map: Record<string, string> = {
    backup: 'Backup',
    images: 'VM Disks',
    rootdir: 'CT Volumes',
    iso: 'ISO Image',
    vztmpl: 'CT Templates',
    snippets: 'Snippets',
  };

  return tokens
    .filter((item) => map[item])
    .map((item) => ({ name: item, label: map[item] }));
});

const usage = computed(() => usedPercent(Number(props.storage.used), Number(props.storage.total)));

function boolLabel(value: unknown) {
  return value ? gettext('Yes') : gettext('No');
}
</script>

<template>
  <div>
    <q-tabs v-model="tab" dense active-color="primary" indicator-color="primary" align="left" class="bg-grey-2 text-grey-8">
      <q-tab name="summary" :label="gettext('Summary')" />
      <q-tab v-for="item in contentTabs" :key="item.name" :name="item.name" :label="gettext(item.label || '')" />
    </q-tabs>
    <q-separator />

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="summary" class="q-pa-md">
        <div class="bg-grey-3 q-pa-md">
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-4">{{ gettext('Storage') }}: <span class="text-grey-8">{{ storage.storage }}</span></div>
            <div class="col-4">{{ gettext('Type') }}: <span class="text-grey-8">{{ storage.type || '-' }}</span></div>
            <div class="col-4">{{ gettext('Node') }}: <span class="text-grey-8">{{ node || '-' }}</span></div>
            <div class="col-4">{{ gettext('Content') }}: <span class="text-grey-8">{{ formatContent(storage.content) }}</span></div>
            <div class="col-4">{{ gettext('Enabled') }}: <span class="text-grey-8">{{ boolLabel(storage.enabled) }}</span></div>
            <div class="col-4">{{ gettext('Active') }}: <span class="text-grey-8">{{ boolLabel(storage.active) }}</span></div>
            <div class="col-4">{{ gettext('Shared') }}: <span class="text-grey-8">{{ boolLabel(storage.shared) }}</span></div>
            <div class="col-4">{{ gettext('Total Size') }}: <span class="text-grey-8">{{ formatBytes(storage.total as number) }}</span></div>
            <div class="col-4">{{ gettext('Avail Size') }}: <span class="text-grey-8">{{ formatBytes(storage.avail as number) }}</span></div>
          </div>
          <UsageProgress :percent="usage" />
        </div>
      </q-tab-panel>

      <q-tab-panel v-for="item in contentTabs" :key="item.name" :name="item.name" class="q-pa-md">
        <StorageContentTable :node="node" :storage="textValue(storage.storage)" :content="item.name" />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>
