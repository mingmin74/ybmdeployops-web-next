<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { getCephMetadata, getCephStatus } from '@/api/ceph';
import { gettext } from '@/locale';
import { formatBytes, textValue, usedPercent } from '@/utils/pveFormat';

const loading = ref(false);
const status = shallowRef<PveRecord>({});
const metadata = shallowRef<PveRecord>({});

const health = computed(() =>
  textValue(
    (status.value.health as PveRecord | undefined)?.status || status.value.health,
    'UNKNOWN',
  ),
);
const pgmap = computed(() => (status.value.pgmap || {}) as PveRecord);
const osdmap = computed(
  () => ((status.value.osdmap as PveRecord | undefined)?.osdmap || {}) as PveRecord,
);
const usage = computed(() =>
  usedPercent(Number(pgmap.value.bytes_used), Number(pgmap.value.bytes_total)),
);
const services = computed(() =>
  Object.keys(metadata.value || {}).filter((key) => ['mon', 'mgr', 'mds', 'osd'].includes(key)),
);

async function refreshData() {
  loading.value = true;
  try {
    const [statusResponse, metadataResponse] = await Promise.allSettled([
      getCephStatus(),
      getCephMetadata(),
    ]);
    if (statusResponse.status === 'fulfilled') status.value = statusResponse.value.data || {};
    if (metadataResponse.status === 'fulfilled') metadata.value = metadataResponse.value.data || {};
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
</script>

<template>
  <div>
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-3">
        <q-card flat bordered
          ><q-card-section
            ><div class="text-grey-7">{{ gettext('Ceph Health') }}</div>
            <div class="text-h6">{{ health }}</div></q-card-section
          ></q-card
        >
      </div>
      <div class="col-12 col-md-3">
        <q-card flat bordered
          ><q-card-section
            ><div class="text-grey-7">{{ gettext('OSDs') }}</div>
            <div class="text-h6">
              {{ osdmap.num_up_osds || 0 }} / {{ osdmap.num_osds || 0 }}
            </div></q-card-section
          ></q-card
        >
      </div>
      <div class="col-12 col-md-3">
        <q-card flat bordered
          ><q-card-section
            ><div class="text-grey-7">{{ gettext('PG Number') }}</div>
            <div class="text-h6">{{ pgmap.num_pgs || 0 }}</div></q-card-section
          ></q-card
        >
      </div>
      <div class="col-12 col-md-3">
        <q-card flat bordered
          ><q-card-section
            ><div class="text-grey-7">{{ gettext('Capacity') }}</div>
            <div class="text-h6">
              {{ formatBytes(pgmap.bytes_used as number) }} /
              {{ formatBytes(pgmap.bytes_total as number) }}
            </div>
            <UsageProgress :percent="usage" /></q-card-section
        ></q-card>
      </div>
    </div>
    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle2">{{ gettext('Services') }}</div>
          <q-space /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :loading="loading"
            :label="gettext('Refresh')"
            @click="refreshData"
          />
        </div>
        <div class="row q-col-gutter-sm">
          <div v-for="service in services" :key="service" class="col-12 col-md-3">
            <div class="bg-grey-2 q-pa-sm">
              {{ service }}:
              {{
                Array.isArray(metadata[service])
                  ? metadata[service].length
                  : Object.keys(metadata[service] || {}).length
              }}
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>
