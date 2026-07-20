<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { getCephLogs } from '@/api/ceph';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const rows = shallowRef<string[]>([]);
const limit = ref(510);

const visibleRows = computed(() => rows.value.slice(Math.max(rows.value.length - limit.value, 0)));

function normalizeLogRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : textValue((item as Record<string, unknown>).t || (item as Record<string, unknown>).msg)))
    .filter(Boolean);
}

async function refreshData() {
  loading.value = true;
  try {
    const response = await getCephLogs('localhost', { start: 0, limit: limit.value });
    rows.value = normalizeLogRows(response.data);
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
</script>

<template>
  <div>
    <div class="row items-center q-mb-sm">
      <q-btn no-caps outline size="12px" color="primary" class="u-button" :loading="loading" :label="gettext('Refresh')" @click="refreshData" />
      <q-space />
      <q-input v-model.number="limit" square outlined dense type="number" min="50" max="2000" class="log-limit" :label="gettext('Limit')" />
    </div>
    <q-card flat bordered>
      <q-card-section class="ceph-log">
        <div v-if="visibleRows.length === 0" class="text-grey-6">{{ gettext('No logs found') }}</div>
        <div v-for="(row, index) in visibleRows" :key="`${index}-${row}`" class="ceph-log-line">{{ row }}</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.log-limit {
  width: 140px;
}

.ceph-log {
  height: 520px;
  overflow: auto;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: normal;
}

.ceph-log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
