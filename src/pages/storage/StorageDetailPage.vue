<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { PveRecord } from '@/api/resources';
import { getClusterResources } from '@/api/resources';
import { getStorages } from '@/api/storage';
import StorageDetailPanel from '@/pages/storage/modules/storage/StorageDetailPage.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const route = useRoute();
const router = useRouter();
const loading = shallowRef(false);
const storageRecord = shallowRef<PveRecord>({});
const node = computed(() => String(route.params.node || ''));
const storage = computed(() => String(route.params.storage || ''));
const title = computed(() => storage.value || gettext('Storage'));

async function loadStorage() {
  if (!node.value || !storage.value) return;

  loading.value = true;
  try {
    const [resourceResponse, configResponse] = await Promise.all([
      getClusterResources({ type: 'storage' }),
      getStorages().catch(() => null),
    ]);
    const config = (configResponse?.data || []).find(
      (item) => textValue(item.storage) === storage.value
    );
    const resource = (resourceResponse.data || []).find(
      (item) => textValue(item.node) === node.value && textValue(item.storage) === storage.value
    );
    storageRecord.value = {
      ...config,
      ...resource,
      node: node.value,
      storage: storage.value,
      type: resource?.plugintype || config?.type || '',
    };
  } finally {
    loading.value = false;
  }
}

function backToList() {
  void router.push({ name: 'storage-list' });
}

watch([node, storage], () => void loadStorage());
onMounted(() => void loadStorage());
</script>

<template>
  <div class="q-ma-md storage-detail-page">
    <section class="storage-detail-page__surface">
      <header class="storage-detail-page__header row items-center no-wrap">
        <q-btn
          flat
          dense
          round
          icon="arrow_back"
          color="primary"
          :aria-label="gettext('Back')"
          @click="backToList"
        />
        <div class="storage-detail-page__title q-ml-sm">
          {{ gettext('Storage') }}
          <span>{{ title }}</span>
        </div>
        <q-space />
        <q-btn
          flat
          dense
          round
          icon="refresh"
          color="primary"
          :loading="loading"
          :aria-label="gettext('Refresh')"
          @click="loadStorage"
        />
      </header>
      <StorageDetailPanel
        :node="node"
        :storage="storageRecord"
      />
    </section>
  </div>
</template>

<style scoped>
.storage-detail-page__surface {
  min-height: calc(100vh - 154px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(34, 51, 84, 0.05);
}

.storage-detail-page__header {
  min-height: 62px;
  padding: 0 16px;
  background: linear-gradient(90deg, #f8fbff 0%, #fff 44%);
  border-bottom: 1px solid #e5eaf1;
}

.storage-detail-page__title {
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.storage-detail-page__title span {
  margin-left: 10px;
  color: var(--q-primary);
  font-weight: 500;
}
</style>
