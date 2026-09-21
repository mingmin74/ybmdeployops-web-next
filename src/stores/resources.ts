import { defineStore } from 'pinia';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getClusterResources } from '@/api/resources';

export const useResourcesStore = defineStore('cluster-resources', () => {
  const records = shallowRef<PveRecord[]>([]);
  const loading = shallowRef(false);
  const lastUpdated = shallowRef<number | undefined>(undefined);
  const refreshIntervalMs = 3000;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;

  async function refresh() {
    if (pending) return pending;
    loading.value = true;
    pending = (async () => {
      try {
        const response = await getClusterResources();
        if (Array.isArray(response.data)) {
          records.value = response.data;
          lastUpdated.value = Date.now();
        }
      } finally {
        loading.value = false;
        pending = undefined;
      }
    })();
    return pending;
  }

  function startPolling() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => void refresh(), refreshIntervalMs);
  }
  function stopPolling() {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function ensureFresh() {
    if (pending) return pending;
    if (
      records.value.length === 0 ||
      lastUpdated.value === undefined ||
      Date.now() - lastUpdated.value > refreshIntervalMs
    ) {
      return refresh();
    }
    return Promise.resolve();
  }

  function usePolling() {
    onMounted(() => {
      void ensureFresh();
      startPolling();
    });
    onBeforeUnmount(() => {
      stopPolling();
    });
  }

  return {
    records,
    loading,
    lastUpdated,
    refreshIntervalMs,
    refresh,
    ensureFresh,
    startPolling,
    stopPolling,
    usePolling,
  };
});
