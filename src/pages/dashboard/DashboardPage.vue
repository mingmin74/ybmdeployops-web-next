<template>
  <q-page class="dashboard-page">
    <div class="page-title-row">
      <div>
        <h1>{{ gettext('Dashboard') }}</h1>
        <p>{{ gettext('PVE connection overview') }}</p>
      </div>
      <q-btn flat round icon="refresh" :aria-label="gettext('Refresh')" :loading="loading" @click="loadData" />
    </div>

    <div class="status-grid">
      <q-card flat bordered class="status-card">
        <q-card-section>
          <div class="status-label">{{ gettext('PVE Version') }}</div>
          <div class="status-value">{{ versionText }}</div>
        </q-card-section>
      </q-card>
      <q-card flat bordered class="status-card">
        <q-card-section>
          <div class="status-label">{{ gettext('Cluster Resources') }}</div>
          <div class="status-value">{{ resourceCount }}</div>
        </q-card-section>
      </q-card>
      <q-card flat bordered class="status-card">
        <q-card-section>
          <div class="status-label">{{ gettext('Session') }}</div>
          <div class="status-value">{{ session.userid }}</div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { getClusterResources, getPveVersion } from '@/api/system';
import { gettext } from '@/locale';
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
