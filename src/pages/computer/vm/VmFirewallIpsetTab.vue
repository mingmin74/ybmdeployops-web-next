<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  createVmFirewallIpset,
  createVmFirewallIpsetEntry,
  deleteVmFirewallIpset,
  deleteVmFirewallIpsetEntry,
  getVmFirewallIpsetEntries,
  getVmFirewallIpsets,
} from '@/api/firewall';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ node: string; vmid: string; editable: boolean }>();
const loading = shallowRef(false);
const entryLoading = shallowRef(false);
const ipsets = shallowRef<PveRecord[]>([]);
const entries = shallowRef<PveRecord[]>([]);
const selectedIpset = shallowRef<PveRecord[]>([]);
const selectedEntry = shallowRef<PveRecord[]>([]);
const ipsetVisible = shallowRef(false);
const entryVisible = shallowRef(false);
const ipsetForm = reactive({ name: '', comment: '' });
const entryForm = reactive({ cidr: '', nomatch: 0, comment: '' });
const activeName = computed(() => textValue(selectedIpset.value[0]?.name));
const ipsetColumns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
]);
const entryColumns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'cidr', label: 'CIDR', field: 'cidr', align: 'left', sortable: true },
  {
    name: 'nomatch',
    label: gettext('Match'),
    field: (row) => (row.nomatch ? gettext('No') : gettext('Yes')),
    align: 'left',
  },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
]);

async function reloadIpsets() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const response = await getVmFirewallIpsets(props.node, props.vmid);
    ipsets.value = response.data || [];
    selectedIpset.value = ipsets.value[0] ? [ipsets.value[0]] : [];
  } finally {
    loading.value = false;
  }
}
async function reloadEntries() {
  if (!activeName.value) {
    entries.value = [];
    return;
  }
  entryLoading.value = true;
  try {
    const response = await getVmFirewallIpsetEntries(props.node, props.vmid, activeName.value);
    entries.value = response.data || [];
    selectedEntry.value = [];
  } finally {
    entryLoading.value = false;
  }
}
function openIpset() {
  if (!props.editable) return;
  ipsetForm.name = '';
  ipsetForm.comment = '';
  ipsetVisible.value = true;
}
function openEntry() {
  if (!props.editable) return;
  entryForm.cidr = '';
  entryForm.nomatch = 0;
  entryForm.comment = '';
  entryVisible.value = true;
}
async function saveIpset() {
  if (!props.editable) return;
  loading.value = true;
  try {
    await createVmFirewallIpset(props.node, props.vmid, ipsetForm);
    ipsetVisible.value = false;
    await reloadIpsets();
  } finally {
    loading.value = false;
  }
}
async function saveEntry() {
  if (!props.editable || !activeName.value) return;
  entryLoading.value = true;
  try {
    await createVmFirewallIpsetEntry(props.node, props.vmid, activeName.value, entryForm);
    entryVisible.value = false;
    await reloadEntries();
  } finally {
    entryLoading.value = false;
  }
}
function removeIpset() {
  if (!props.editable || !activeName.value) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', activeName.value),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteVmFirewallIpset(props.node, props.vmid, activeName.value).then(reloadIpsets);
  });
}
function removeEntry() {
  const cidr = textValue(selectedEntry.value[0]?.cidr);
  if (!props.editable || !activeName.value || !cidr) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', cidr),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteVmFirewallIpsetEntry(props.node, props.vmid, activeName.value, cidr).then(
      reloadEntries,
    );
  });
}
watch(activeName, () => {
  void reloadEntries();
});
watch(
  () => [props.node, props.vmid],
  () => {
    void reloadIpsets();
  },
  { immediate: true },
);
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-12 col-md-4">
      <q-card class="no-border-radius no-shadow q-ma-none">
        <q-card-section class="q-pa-none">
          <q-table
            v-model:selected="selectedIpset"
            flat
            row-key="name"
            selection="single"
            table-header-class="u-table-header"
            :rows="ipsets"
            :columns="ipsetColumns"
            :loading="loading"
            :rows-per-page-options="[10]"
            :pagination="{ page: 1, rowsPerPage: 10 }"
            :no-data-label="gettext('no record can be found')"
            ><template #top
              ><div class="q-gutter-sm">
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button"
                  :disable="!editable"
                  :label="gettext('Add')"
                  @click="openIpset"
                /><q-btn
                  no-caps
                  outline
                  size="12px"
                  color="negative"
                  class="u-button"
                  :disable="!editable || !activeName"
                  :label="gettext('Remove')"
                  @click="removeIpset"
                />
              </div>
              <q-space /><q-btn
                no-caps
                outline
                size="12px"
                color="primary"
                class="u-button"
                :label="gettext('Refresh')"
                @click="reloadIpsets" /></template
            ><template #no-data
              ><div class="full-width row flex-center text-grey q-gutter-sm">
                <span>{{ gettext('no record can be found') }}</span>
              </div></template
            ></q-table
          >
        </q-card-section>
      </q-card>
    </div>
    <div class="col-12 col-md-8">
      <q-card class="no-border-radius no-shadow q-ma-none">
        <q-card-section class="q-pa-none">
          <q-table
            v-model:selected="selectedEntry"
            flat
            row-key="cidr"
            selection="single"
            table-header-class="u-table-header"
            :rows="entries"
            :columns="entryColumns"
            :loading="entryLoading"
            :rows-per-page-options="[10]"
            :pagination="{ page: 1, rowsPerPage: 10 }"
            :no-data-label="gettext('no record can be found')"
            ><template #top
              ><div class="q-gutter-sm">
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button"
                  :disable="!editable || !activeName"
                  :label="gettext('Add')"
                  @click="openEntry"
                /><q-btn
                  no-caps
                  outline
                  size="12px"
                  color="negative"
                  class="u-button"
                  :disable="!editable || !selectedEntry.length"
                  :label="gettext('Remove')"
                  @click="removeEntry"
                />
              </div>
              <q-space /><q-btn
                no-caps
                outline
                size="12px"
                color="primary"
                class="u-button"
                :label="gettext('Refresh')"
                @click="reloadEntries" /></template
            ><template #no-data
              ><div class="full-width row flex-center text-grey q-gutter-sm">
                <span>{{ gettext('no record can be found') }}</span>
              </div></template
            ></q-table
          >
        </q-card-section>
      </q-card>
    </div>
  </div>
  <q-dialog v-model="ipsetVisible" persistent
    ><UWindow :title="gettext('Add')" width="420px" :loading="loading"
      ><q-form
        class="firewall-ipset-form u-border q-ma-sm q-pa-md u-dense"
        @submit.prevent="saveIpset"
      >
        <q-input v-model="ipsetForm.name" dense :label="gettext('Name')" /><q-input
          v-model="ipsetForm.comment"
          dense
          :label="gettext('Comment')"
        />
      </q-form>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Save')"
          @click="saveIpset" /></template></UWindow
  ></q-dialog>
  <q-dialog v-model="entryVisible" persistent
    ><UWindow :title="gettext('Add')" width="420px" :loading="entryLoading"
      ><q-form
        class="firewall-ipset-form u-border q-ma-sm q-pa-md u-dense"
        @submit.prevent="saveEntry"
      >
        <q-input v-model="entryForm.cidr" dense label="CIDR" /><q-checkbox
          v-model="entryForm.nomatch"
          dense
          color="primary"
          :true-value="1"
          :false-value="0"
          :label="gettext('No Match')"
        /><q-input v-model="entryForm.comment" dense :label="gettext('Comment')" />
      </q-form>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Save')"
          @click="saveEntry" /></template></UWindow
  ></q-dialog>
</template>

<style scoped>
.firewall-ipset-form {
  display: grid;
  gap: 10px;
}

.firewall-ipset-form :deep(.q-checkbox) {
  min-height: 30px;
}
</style>
