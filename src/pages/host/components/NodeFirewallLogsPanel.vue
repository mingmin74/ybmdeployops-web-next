<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getNodeFirewallLogs } from '@/api/firewall';
import { textValue } from '@/utils/pveFormat';
const { node } = defineProps<{ node: string }>();
const loading = shallowRef(false);
const rows = shallowRef<PveRecord[]>([]);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const output = computed(() => rows.value.map((row) => textValue(row.t)).join('\n'));
async function refreshData() {
  loading.value = true;
  try {
    rows.value = (await getNodeFirewallLogs(node, { start: 0, limit: 500 })).data?.data || [];
  } finally {
    loading.value = false;
    refreshTimer = setTimeout(() => {
      void refreshData();
    }, 5000);
  }
}
onMounted(refreshData);
onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>
<template>
  <div class="q-ma-sm node-firewall-logs">
    <pre>{{ output }}</pre>
    <q-inner-loading :showing="loading" />
  </div>
</template>
<style scoped>
.node-firewall-logs {
  position: relative;
  height: 500px;
  overflow: auto;
  border: 1px solid #ccc;
  padding: 8px;
  color: #666;
  font-size: 12px;
  line-height: 18px;
  white-space: pre;
}
.node-firewall-logs pre {
  margin: 0;
  font: inherit;
}
</style>
