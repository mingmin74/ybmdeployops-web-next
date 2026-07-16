<template>
  <q-page class="dashboard-page">
    <div class="page-title-row">
      <div>
        <h1>{{ $t('Dashboard') }}</h1>
        <p>{{ $t('PVE connection overview') }}</p>
      </div>
      <q-btn flat round icon="refresh" :aria-label="$t('Refresh')" :loading="loading" @click="loadData" />
    </div>

    <div class="status-grid">
      <q-card flat bordered class="status-card">
        <q-card-section>
          <div class="status-label">{{ $t('PVE Version') }}</div>
          <div class="status-value">{{ versionText }}</div>
        </q-card-section>
      </q-card>
      <q-card flat bordered class="status-card">
        <q-card-section>
          <div class="status-label">{{ $t('Cluster Resources') }}</div>
          <div class="status-value">{{ resourceCount }}</div>
        </q-card-section>
      </q-card>
      <q-card flat bordered class="status-card">
        <q-card-section>
          <div class="status-label">{{ $t('Session') }}</div>
          <div class="status-value">{{ session.userid }}</div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { getClusterResources, getPveVersion } from '@/api/system';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const loading = shallowRef(false);
const version = shallowRef<Record<string, unknown> | null>(null);
const resources = shallowRef<unknown[]>([]);

const versionText = computed(() => {
  if (!version.value) return '--';
  return [version.value.version, version.value.release].filter(Boolean).join(' / ') || '--';
});
const resourceCount = computed(() => String(resources.value.length));

async function loadData() {
  loading.value = true;
  try {
    const [versionResponse, resourceResponse] = await Promise.all([getPveVersion(), getClusterResources()]);
    version.value = (versionResponse.data || null) as Record<string, unknown> | null;
    resources.value = Array.isArray(resourceResponse.data) ? resourceResponse.data : [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadData();
});
</script>
