<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import {
  createMetricServer,
  deleteMetricServer,
  getMetricServer,
  getMetricServers,
  updateMetricServer,
} from '@/api/metricServer';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const dialogVisible = ref(false);
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
type MetricForm = {
  action: 'add' | 'edit';
  type: string;
  id: string;
  server: string;
  port: string;
  influxdbproto: string;
  enabled: boolean;
  organization: string;
  bucket: string;
  token: string;
  'api-path-prefix': string;
  timeout: string;
  'max-body-size': string;
  mtu: string;
};

const form = reactive<MetricForm>({
  action: 'add',
  type: 'influxdb',
  id: '',
  server: '',
  port: '8089',
  influxdbproto: 'udp',
  enabled: false,
  organization: '',
  bucket: '',
  token: '',
  'api-path-prefix': '',
  timeout: '',
  'max-body-size': '',
  mtu: '',
});

const protoOptions = [
  { value: 'udp', label: 'UDP' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

const isUdp = computed(() => form.influxdbproto === 'udp');
const canSubmit = computed(() => Boolean(form.id && form.server && form.port));

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'id',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: 'id',
    sortable: true,
  },
  { name: 'type', label: gettext('Type'), align: 'left', field: 'type' },
  {
    name: 'enabled',
    label: gettext('Enabled'),
    align: 'left',
    field: (row) => (Number(row.disable) ? gettext('No') : gettext('Yes')),
  },
  { name: 'server', label: gettext('Server'), align: 'left', field: 'server' },
  { name: 'port', label: gettext('Port'), align: 'left', field: 'port' },
];

function resetForm(action: 'add' | 'edit') {
  Object.assign(form, {
    action,
    type: 'influxdb',
    id: '',
    server: '',
    port: '8089',
    influxdbproto: 'udp',
    enabled: false,
    organization: '',
    bucket: '',
    token: '',
    'api-path-prefix': '',
    timeout: '',
    'max-body-size': '',
    mtu: '',
  });
}

async function reload() {
  loading.value = true;
  try {
    const response = await getMetricServers();
    rows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.id).localeCompare(textValue(right.id)),
    );
  } finally {
    loading.value = false;
  }
}

async function openDialog(action: 'add' | 'edit') {
  resetForm(action);
  dialogVisible.value = true;
  if (action === 'edit' && selected.value[0]?.id) {
    dialogLoading.value = true;
    try {
      const id = textValue(selected.value[0].id);
      const response = await getMetricServer(id);
      Object.assign(form, response.data || {});
      form.id = id;
      form.enabled = !Number(response.data?.disable || 0);
    } finally {
      dialogLoading.value = false;
    }
  }
}

function buildSubmitData() {
  const data: Record<string, unknown> = {
    server: form.server,
    port: form.port,
    disable: form.enabled ? 0 : 1,
  };
  if (form.action === 'add') {
    data.type = form.type;
    data.id = form.id;
  }
  if (form.influxdbproto === 'udp') {
    if (form.action === 'edit') data.delete = ['influxdbproto'];
    if (form.mtu) data.mtu = form.mtu;
  } else {
    data.influxdbproto = String(form.influxdbproto).toLowerCase();
    const keys: Array<
      keyof Pick<
        MetricForm,
        'organization' | 'bucket' | 'token' | 'api-path-prefix' | 'timeout' | 'max-body-size'
      >
    > = ['organization', 'bucket', 'token', 'api-path-prefix', 'timeout', 'max-body-size'];
    keys.forEach((key) => {
      if (form[key]) data[key] = form[key];
    });
  }
  return data;
}

async function save() {
  dialogLoading.value = true;
  try {
    if (form.action === 'add') {
      await createMetricServer(form.id, buildSubmitData());
    } else {
      await updateMetricServer(form.id, buildSubmitData());
    }
    dialogVisible.value = false;
    selected.value = [];
    await reload();
  } finally {
    dialogLoading.value = false;
  }
}

function removeSelected() {
  const row = selected.value[0];
  if (!row?.id) return;
  const id = textValue(row.id);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', id),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteMetricServer(id)
      .then(() => reload())
      .finally(() => {
        loading.value = false;
      });
  });
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = selected.value[0] === row ? [] : [row];
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-md no-shadow no-border-radius">
      <q-card-section>
        <q-table
          flat
          row-key="id"
          table-header-class="u-table-header"
          selection="single"
          :rows="rows"
          :columns="columns"
          :selected="selected"
          :filter="filter"
          :pagination="{ page: 1, rowsPerPage: 10 }"
          :rows-per-page-options="[10]"
          :loading="loading"
          :no-data-label="gettext('no record can be found')"
          @row-click="rowClick"
          @update:selected="selected = [...$event]"
        >
          <template #top>
            <div class="q-gutter-sm">
              <q-btn
                no-caps
                outline
                size="12px"
                color="primary"
                class="u-button"
                :label="gettext('Add')"
                @click="openDialog('add')"
              />
              <q-btn
                no-caps
                outline
                size="12px"
                class="u-button"
                :color="selected.length !== 1 ? 'grey' : 'primary'"
                :disable="selected.length !== 1"
                :label="gettext('Edit')"
                @click="openDialog('edit')"
              />
              <q-btn
                no-caps
                outline
                size="12px"
                class="u-button"
                :color="selected.length !== 1 ? 'grey' : 'red'"
                :disable="selected.length !== 1"
                :label="gettext('Remove')"
                @click="removeSelected"
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
              <template #append><q-icon name="search" /></template>
            </q-input>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <q-dialog v-model="dialogVisible" persistent transition-show="scale" transition-hide="scale">
      <UWindow
        :title="`${gettext(form.action === 'add' ? 'Add' : 'Edit')}: ${gettext('InfluxDB')}`"
        width="580px"
        :loading="dialogLoading"
      >
        <div class="q-pa-sm">
          <div class="row q-col-gutter-lg u-border q-pa-md">
            <div class="col">
              <q-input
                v-model="form.id"
                dense
                :disable="form.action !== 'add'"
                :label="`${gettext('Name')}*`"
              />
              <q-input v-model="form.server" dense :label="`${gettext('Server')}*`" />
              <q-input
                v-model="form.port"
                dense
                type="number"
                min="1"
                :label="`${gettext('Port')}*`"
              />
              <q-select
                v-model="form.influxdbproto"
                dense
                emit-value
                map-options
                options-dense
                :options="protoOptions"
                :label="gettext('Protocol')"
              />
              <q-input
                v-model="form['api-path-prefix']"
                dense
                :disable="isUdp"
                :label="gettext('API Path Prefix')"
              />
              <q-input
                v-model="form.timeout"
                dense
                type="number"
                min="1"
                :disable="isUdp"
                :label="`${gettext('Timeout')}(s)`"
              />
            </div>
            <div class="col">
              <q-checkbox
                v-model="form.enabled"
                dense
                color="primary"
                :label="gettext('Enabled')"
              />
              <q-input
                v-model="form.organization"
                dense
                :disable="isUdp"
                :label="gettext('Organization')"
              />
              <q-input v-model="form.bucket" dense :disable="isUdp" :label="gettext('Bucket')" />
              <q-input v-model="form.token" dense :disable="isUdp" :label="gettext('Token')" />
              <q-input
                v-model="form['max-body-size']"
                dense
                type="number"
                :disable="isUdp"
                :label="gettext('Batch Size(b)')"
              />
              <q-input
                v-model="form.mtu"
                dense
                type="number"
                min="512"
                max="65536"
                :disable="!isUdp"
                :label="gettext('MTU')"
              />
            </div>
          </div>
        </div>
        <template #foot>
          <q-btn
            no-caps
            flat
            size="12px"
            :disable="!canSubmit || dialogLoading"
            :class="
              canSubmit && !dialogLoading
                ? 'bg-primary text-grey-1 u-button'
                : 'bg-grey-4 text-grey-6 u-button'
            "
            :label="gettext(form.action === 'add' ? 'Add' : 'OK')"
            @click="save"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
