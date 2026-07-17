<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { gettext } from '@/locale';
import type { PveRecord } from '@/api/resources';

const props = defineProps<{
  columns: QTableColumn<PveRecord>[];
  loadRows: () => Promise<PveRecord[]>;
  rowKey: string;
  visibleColumns?: string[];
  embedded?: boolean;
}>();

const loading = ref(false);
const filter = ref('');
const rows = shallowRef<PveRecord[]>([]);

const tableColumns = computed(() => props.columns);

async function reload() {
  loading.value = true;
  try {
    rows.value = await props.loadRows();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <q-card
    class="no-border-radius no-shadow"
    :class="props.embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'"
  >
    <q-card-section :class="props.embedded ? 'q-pa-none' : undefined">
      <q-table
        flat
        :row-key="rowKey"
        table-header-class="u-table-header"
        :rows="rows"
        :columns="tableColumns"
        :visible-columns="visibleColumns"
        :filter="filter"
        :rows-per-page-options="[10]"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :loading="loading"
        :no-data-label="gettext('no record can be found')"
      >
        <template #top>
          <div class="q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="reload"
            />
          </div>
          <q-space />
          <q-input
            v-model="filter"
            borderless
            dense
            debounce="300"
            :placeholder="gettext('Search')"
          >
            <template #append>
              <q-icon name="search" />
            </template>
          </q-input>
        </template>

        <template #body-cell-comment="scope">
          <q-td :props="scope">
            <div class="text-overflow simple-comment" :title="String(scope.value || '')">
              {{ scope.value }}
            </div>
          </q-td>
        </template>

        <template #no-data="{ message }">
          <div class="full-width row flex-center text-accent q-gutter-sm">
            <span class="text-grey-6">{{ message }}</span>
          </div>
        </template>
      </q-table>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.simple-comment {
  max-width: 700px;
}
</style>
