<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getSdnVnets } from '@/api/sdn';
import FirewallOptionsPage from '@/pages/system/firewall/FirewallOptionsPage.vue';
import FirewallRulesPage from '@/pages/system/firewall/FirewallRulesPage.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const tab = ref('rules');
const selected = ref<PveRecord[]>([]);
const vnets = shallowRef<PveRecord[]>([]);

const columns: QTableColumn<PveRecord>[] = [
  { name: 'vnet', label: 'ID', align: 'left', field: (row) => row.vnet || '-', sortable: true },
  {
    name: 'zone',
    label: gettext('Zone'),
    align: 'left',
    field: (row) => row.zone || '-',
    sortable: true,
  },
  {
    name: 'alias',
    label: gettext('Alias'),
    align: 'left',
    field: (row) => row.alias || '-',
    sortable: true,
  },
];

const selectedVnet = computed(() => textValue(selected.value[0]?.vnet));
const rulesBaseUrl = computed(() =>
  selectedVnet.value
    ? `/cluster/sdn/vnets/${encodeURIComponent(selectedVnet.value)}/firewall/rules`
    : '',
);
const optionsBaseUrl = computed(() =>
  selectedVnet.value
    ? `/cluster/sdn/vnets/${encodeURIComponent(selectedVnet.value)}/firewall/options`
    : '',
);

async function refreshVnets() {
  loading.value = true;
  try {
    const previous = selectedVnet.value;
    vnets.value = [...((await getSdnVnets(0)).data || [])].sort((a, b) =>
      `${textValue(a.zone)}\u0000${textValue(a.vnet)}`.localeCompare(
        `${textValue(b.zone)}\u0000${textValue(b.vnet)}`,
      ),
    );
    selected.value = previous
      ? vnets.value.filter((vnet) => textValue(vnet.vnet) === previous).slice(0, 1)
      : [];
  } finally {
    loading.value = false;
  }
}

onMounted(refreshVnets);
</script>

<template>
  <div class="vnet-firewall q-ma-md bg-white">
    <section class="vnet-firewall-list">
      <q-table
        flat
        row-key="vnet"
        table-header-class="u-table-header"
        selection="single"
        :rows="vnets"
        :columns="columns"
        :selected="selected"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        :no-data-label="gettext('No VNet configured.')"
        @update:selected="selected = [...$event]"
      >
        <template #top>
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="refreshVnets"
          />
        </template>
      </q-table>
    </section>
    <section class="vnet-firewall-detail">
      <q-tabs
        v-model="tab"
        dense
        active-color="primary"
        indicator-color="primary"
        align="left"
        class="bg-grey-2 text-grey-8"
      >
        <q-tab name="rules" :label="gettext('Rules')" :disable="!selectedVnet" />
        <q-tab name="options" :label="gettext('Options')" :disable="!selectedVnet" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="tab" animated>
        <q-tab-panel name="rules" class="q-pa-sm">
          <FirewallRulesPage v-if="rulesBaseUrl" :base-url="rulesBaseUrl" firewall-type="vnet" />
          <div v-else class="vnet-firewall-empty text-grey-7">
            {{ gettext('No VNet selected') }}
          </div>
        </q-tab-panel>
        <q-tab-panel name="options" class="q-pa-sm">
          <FirewallOptionsPage v-if="optionsBaseUrl" :base-url="optionsBaseUrl" fwtype="vnet" />
          <div v-else class="vnet-firewall-empty text-grey-7">
            {{ gettext('No VNet selected') }}
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </section>
  </div>
</template>

<style scoped>
.vnet-firewall {
  display: flex;
  min-height: 420px;
  border: 1px solid #e0e0e0;
}
.vnet-firewall-list {
  width: 36%;
  min-width: 320px;
  border-right: 1px solid #e0e0e0;
}
.vnet-firewall-detail {
  min-width: 0;
  flex: 1;
}
.vnet-firewall-empty {
  padding: 24px 16px;
}
@media (max-width: 960px) {
  .vnet-firewall {
    display: block;
  }
  .vnet-firewall-list {
    width: auto;
    min-width: 0;
    border-right: 0;
    border-bottom: 1px solid #e0e0e0;
  }
}
</style>
