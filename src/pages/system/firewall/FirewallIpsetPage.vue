<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallIpsetByBaseUrl,
  createFirewallIpsetEntryByBaseUrl,
  deleteFirewallIpsetByBaseUrl,
  deleteFirewallIpsetEntryByBaseUrl,
  getFirewallIpsetEntriesByBaseUrl,
  getFirewallIpsetsByBaseUrl,
  getFirewallRefs,
  updateFirewallIpsetByBaseUrl,
  updateFirewallIpsetEntryByBaseUrl,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const { baseUrl = '/cluster/firewall/ipset', refsUrl = '/cluster/firewall/refs' } = defineProps<{
  baseUrl?: string;
  refsUrl?: string;
}>();

const loading = shallowRef(false);
const entryLoading = shallowRef(false);
const selectedIpset = ref<PveRecord[]>([]);
const selectedEntry = ref<PveRecord[]>([]);
const ipsets = shallowRef<PveRecord[]>([]);
const entries = shallowRef<PveRecord[]>([]);
const aliasRefs = shallowRef<PveRecord[]>([]);
const ipsetDialog = shallowRef(false);
const entryDialog = shallowRef(false);
const editingIpset = shallowRef(false);
const editingEntry = shallowRef(false);
const ipsetForm = ref<Record<string, string | number | undefined>>({});
const entryForm = ref<Record<string, string | number | undefined>>({});
const originalIpsetName = shallowRef('');
const originalCidr = shallowRef('');

const selectedSet = computed(() => selectedIpset.value[0]);
const selectedCidr = computed(() => selectedEntry.value[0]);
const aliases = computed(() =>
  aliasRefs.value
    .filter((item) => textValue(item.type) === 'alias')
    .map((item) => ({ label: textValue(item.ref), value: textValue(item.ref) }))
);
const ipsetColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || '-',
    sortable: true,
  },
  {
    name: 'comment',
    label: gettext('Comment'),
    align: 'left',
    field: (row) => row.comment || '-',
    sortable: true,
  },
];
const entryColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'cidr',
    required: true,
    label: 'CIDR',
    align: 'left',
    field: (row) => row.cidr || row.name || '-',
    sortable: true,
  },
  {
    name: 'nomatch',
    label: gettext('Match'),
    align: 'left',
    field: (row) => (row.nomatch ? gettext('No') : gettext('Yes')),
    sortable: true,
  },
  {
    name: 'comment',
    label: gettext('Comment'),
    align: 'left',
    field: (row) => row.comment || '-',
    sortable: true,
  },
];

async function refreshIpsets() {
  loading.value = true;
  try {
    ipsets.value = (await getFirewallIpsetsByBaseUrl(baseUrl)).data || [];
    const current = ipsets.value.find(
      (item) => textValue(item.name) === textValue(selectedSet.value?.name)
    );
    selectedIpset.value = current ? [current] : ipsets.value[0] ? [ipsets.value[0]] : [];
  } finally {
    loading.value = false;
  }
}
async function refreshEntries() {
  const name = textValue(selectedSet.value?.name);
  if (!name) {
    entries.value = [];
    return;
  }
  entryLoading.value = true;
  try {
    entries.value = (await getFirewallIpsetEntriesByBaseUrl(baseUrl, name)).data || [];
    selectedEntry.value = [];
  } finally {
    entryLoading.value = false;
  }
}
async function loadAliases() {
  aliasRefs.value = (await getFirewallRefs(refsUrl)).data || [];
}

function openIpsetDialog(mode: 'add' | 'edit') {
  editingIpset.value = mode === 'edit';
  const item = selectedSet.value;
  originalIpsetName.value = textValue(item?.name);
  ipsetForm.value = editingIpset.value
    ? {
        name: originalIpsetName.value,
        comment: textValue(item?.comment),
        digest: textValue(item?.digest),
      }
    : { name: '', comment: '' };
  ipsetDialog.value = true;
}
function openEntryDialog(mode: 'add' | 'edit') {
  editingEntry.value = mode === 'edit';
  const item = selectedCidr.value;
  originalCidr.value = textValue(item?.cidr || item?.name);
  entryForm.value = editingEntry.value
    ? {
        cidr: originalCidr.value,
        nomatch: Number(item?.nomatch) ? 1 : 0,
        comment: textValue(item?.comment),
        digest: textValue(item?.digest),
      }
    : { cidr: '', nomatch: 0, comment: '' };
  entryDialog.value = true;
}
async function submitIpset() {
  const name = textValue(ipsetForm.value.name);
  if (!name) return;
  loading.value = true;
  try {
    if (editingIpset.value)
      await updateFirewallIpsetByBaseUrl(baseUrl, {
        ...ipsetForm.value,
        rename: originalIpsetName.value,
      });
    else await createFirewallIpsetByBaseUrl(baseUrl, ipsetForm.value);
    ipsetDialog.value = false;
    await refreshIpsets();
  } finally {
    loading.value = false;
  }
}
async function submitEntry() {
  const name = textValue(selectedSet.value?.name);
  const cidr = textValue(entryForm.value.cidr);
  if (!name || !cidr) return;
  entryLoading.value = true;
  try {
    if (editingEntry.value) {
      const data = { ...entryForm.value };
      delete data.cidr;
      await updateFirewallIpsetEntryByBaseUrl(baseUrl, name, originalCidr.value, data);
    } else await createFirewallIpsetEntryByBaseUrl(baseUrl, name, entryForm.value);
    entryDialog.value = false;
    await refreshEntries();
  } finally {
    entryLoading.value = false;
  }
}
function removeIpset() {
  const item = selectedSet.value;
  const name = textValue(item?.name);
  if (!name) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', name),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteFirewallIpsetByBaseUrl(baseUrl, name, item?.digest)
      .then(refreshIpsets)
      .finally(() => {
        loading.value = false;
      });
  });
}
function removeEntry() {
  const item = selectedCidr.value;
  const name = textValue(selectedSet.value?.name);
  const cidr = textValue(item?.cidr || item?.name);
  if (!name || !cidr) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', cidr),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    entryLoading.value = true;
    void deleteFirewallIpsetEntryByBaseUrl(baseUrl, name, cidr, item?.digest)
      .then(refreshEntries)
      .finally(() => {
        entryLoading.value = false;
      });
  });
}
function cellError(row: PveRecord, field: string) {
  return textValue((row.errors as PveRecord | undefined)?.[field]);
}
function acceptCidrValue(
  value: string,
  done: (value?: string, mode?: 'add' | 'add-unique') => void
) {
  const cidr = value.trim();
  if (cidr) done(cidr, 'add-unique');
  else done();
}
watch(selectedIpset, () => {
  void refreshEntries();
});
onMounted(() => {
  void refreshIpsets();
  void loadAliases();
});
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-4">
      <q-table
        flat
        row-key="name"
        table-header-class="u-table-header"
        selection="single"
        :rows="ipsets"
        :columns="ipsetColumns"
        :selected="selectedIpset"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @update:selected="selectedIpset = [...$event]"
        @row-dblclick="
          (_, row) => {
            selectedIpset = [row];
            openIpsetDialog('edit');
          }
        "
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
              @click="openIpsetDialog('add')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!selectedSet"
              :label="gettext('Edit')"
              @click="openIpsetDialog('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="selectedSet ? 'red' : 'grey'"
              class="u-button"
              :disable="!selectedSet"
              :label="gettext('Remove')"
              @click="removeIpset"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshIpsets"
            />
          </div>
        </template>
      </q-table>
    </div>
    <div class="col-8">
      <q-table
        flat
        row-key="cidr"
        table-header-class="u-table-header"
        selection="single"
        :rows="entries"
        :columns="entryColumns"
        :selected="selectedEntry"
        :loading="entryLoading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @update:selected="selectedEntry = [...$event]"
        @row-dblclick="
          (_, row) => {
            selectedEntry = [row];
            openEntryDialog('edit');
          }
        "
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!selectedSet"
              :label="gettext('Add')"
              @click="openEntryDialog('add')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!selectedCidr"
              :label="gettext('Edit')"
              @click="openEntryDialog('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="selectedCidr ? 'red' : 'grey'"
              class="u-button"
              :disable="!selectedCidr"
              :label="gettext('Remove')"
              @click="removeEntry"
            />
          </div>
        </template>
        <template #body-cell-cidr="scope">
          <q-td :props="scope">
            <span :class="{ 'text-negative': cellError(scope.row, 'cidr') }">
              {{ scope.value }}
            </span>
            <q-tooltip v-if="cellError(scope.row, 'cidr')">
              {{ cellError(scope.row, 'cidr') }}
            </q-tooltip>
          </q-td>
        </template>
        <template #body-cell-nomatch="scope">
          <q-td :props="scope">
            <span :class="{ 'text-negative': cellError(scope.row, 'nomatch') }">
              {{ scope.value }}
            </span>
            <q-tooltip v-if="cellError(scope.row, 'nomatch')">
              {{ cellError(scope.row, 'nomatch') }}
            </q-tooltip>
          </q-td>
        </template>
      </q-table>
    </div>
    <q-dialog
      v-model="ipsetDialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="gettext(editingIpset ? 'Edit' : 'Add')"
        width="420px"
        :loading="loading"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-input
            v-model="ipsetForm.name"
            dense
            class="q-field--with-bottom"
            :label="gettext('Name')"
            :rules="[(value) => !!value || gettext('This field is required')]"
          />
          <q-input
            v-model="ipsetForm.comment"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!ipsetForm.name"
            :label="gettext('OK')"
            @click="submitIpset"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="entryDialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="gettext(editingEntry ? 'Edit' : 'Add')"
        width="420px"
        :loading="entryLoading"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-select
            v-if="!editingEntry"
            v-model="entryForm.cidr"
            dense
            class="q-field--with-bottom"
            options-dense
            use-input
            clearable
            emit-value
            map-options
            :label="gettext('IP/CIDR')"
            :options="aliases"
            :rules="[(value) => !!value || gettext('This field is required')]"
            @new-value="acceptCidrValue"
          />
          <q-input
            v-else
            v-model="entryForm.cidr"
            dense
            class="q-field--with-bottom"
            readonly
            label="CIDR"
          />
          <q-checkbox
            v-model="entryForm.nomatch"
            class="q-field--with-bottom"
            dense
            right-label
            color="primary"
            :true-value="1"
            :false-value="0"
            :label="gettext('No Match')"
          />
          <q-input
            v-model="entryForm.comment"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!entryForm.cidr"
            :label="gettext('OK')"
            @click="submitEntry"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
