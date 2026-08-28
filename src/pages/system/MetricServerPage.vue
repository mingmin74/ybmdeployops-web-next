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

type MetricType = 'influxdb' | 'graphite' | 'opentelemetry';
type MetricForm = {
  action: 'add' | 'edit';
  type: MetricType;
  id: string;
  server: string;
  port: string;
  enabled: boolean;
  influxdbproto: string;
  organization: string;
  bucket: string;
  token: string;
  'api-path-prefix': string;
  timeout: string;
  'max-body-size': string;
  'verify-certificate': boolean;
  mtu: string;
  path: string;
  proto: string;
  'otel-protocol': string;
  'otel-path': string;
  'otel-timeout': string;
  'otel-verify-ssl': boolean;
  'otel-max-body-size': string;
  'otel-compression': string;
  headers_advanced: string;
  resource_attributes_advanced: string;
};

const loading = ref(false);
const dialogLoading = ref(false);
const submitted = ref(false);
const filter = ref('');
const dialogVisible = ref(false);
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const form = reactive<MetricForm>({} as MetricForm);

const influxProtocolOptions = [
  { value: 'udp', label: 'UDP' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];
const graphiteProtocolOptions = [
  { value: '', label: 'UDP' },
  { value: 'tcp', label: 'TCP' },
];
const otelProtocolOptions = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];
const compressionOptions = [
  { value: 'none', label: gettext('None') },
  { value: 'gzip', label: 'Gzip' },
];
const isUdp = computed(() => form.influxdbproto === 'udp');
const isGraphiteTcp = computed(() => form.proto === 'tcp');
const dialogTypeLabel = computed(() => formatMetricType(form.type));
const jsonValid = computed(
  () => isJsonOrEmpty(form.headers_advanced) && isJsonOrEmpty(form.resource_attributes_advanced)
);
const canSubmit = computed(() => validForm() && jsonValid.value);

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'id',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: 'id',
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    align: 'left',
    field: (row) => formatMetricType(textValue(row.type)),
  },
  {
    name: 'enabled',
    label: gettext('Enabled'),
    align: 'left',
    field: (row) => (Number(row.disable) ? gettext('No') : gettext('Yes')),
  },
  { name: 'server', label: gettext('Server'), align: 'left', field: 'server' },
  { name: 'port', label: gettext('Port'), align: 'left', field: 'port' },
];

function formatMetricType(type: unknown) {
  switch (textValue(type)) {
    case 'influxdb':
      return 'InfluxDB';
    case 'graphite':
      return 'Graphite';
    case 'opentelemetry':
      return 'OpenTelemetry';
    default:
      return gettext('Unknown');
  }
}

function resetForm(action: 'add' | 'edit', type: MetricType) {
  submitted.value = false;
  Object.assign(form, {
    action,
    type,
    id: '',
    server: '',
    enabled: true,
    port: type === 'graphite' ? '2003' : type === 'opentelemetry' ? '4318' : '8089',
    influxdbproto: 'udp',
    organization: '',
    bucket: '',
    token: '',
    'api-path-prefix': '',
    timeout: '',
    'max-body-size': '',
    'verify-certificate': true,
    mtu: '',
    path: '',
    proto: '',
    'otel-protocol': 'https',
    'otel-path': '/v1/metrics',
    'otel-timeout': '5',
    'otel-verify-ssl': true,
    'otel-max-body-size': '10000000',
    'otel-compression': 'gzip',
    headers_advanced: '',
    resource_attributes_advanced: '',
  });
}

function toMetricType(value: unknown): MetricType | undefined {
  const type = textValue(value);
  return type === 'influxdb' || type === 'graphite' || type === 'opentelemetry' ? type : undefined;
}

async function reload() {
  loading.value = true;
  try {
    const response = await getMetricServers();
    rows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.id).localeCompare(textValue(right.id))
    );
  } finally {
    loading.value = false;
  }
}

async function openDialog(action: 'add' | 'edit', addType?: MetricType) {
  const type = addType || toMetricType(selected.value[0]?.type);
  if (!type) return;
  resetForm(action, type);
  dialogVisible.value = true;
  if (action !== 'edit' || !selected.value[0]?.id) return;
  dialogLoading.value = true;
  try {
    const id = textValue(selected.value[0].id);
    const response = await getMetricServer(id);
    const data = response.data || {};
    const loadedType = toMetricType(data.type) || type;
    resetForm(action, loadedType);
    Object.assign(form, data, {
      action,
      type: loadedType,
      id,
      enabled: !Number(data.disable || 0),
    });
    if (data['verify-certificate'] !== undefined) {
      form['verify-certificate'] = Number(data['verify-certificate']) !== 0;
    }
    if (data['otel-verify-ssl'] !== undefined) {
      form['otel-verify-ssl'] = Number(data['otel-verify-ssl']) !== 0;
    }
    if (loadedType === 'opentelemetry') {
      form.headers_advanced = decodeBase64(textValue(data['otel-headers']));
      form.resource_attributes_advanced = decodeBase64(textValue(data['otel-resource-attributes']));
    }
  } finally {
    dialogLoading.value = false;
  }
}

function setOptional(
  data: Record<string, unknown>,
  deleted: string[],
  key: keyof MetricForm,
  preserveEmpty = false
) {
  const value = textValue(form[key]).trim();
  if (value) data[key] = value;
  else if (form.action === 'edit' && !preserveEmpty) deleted.push(key);
}

function buildSubmitData() {
  const data: Record<string, unknown> = {
    server: form.server.trim(),
    port: form.port,
    disable: form.enabled ? 0 : 1,
  };
  const deleted: string[] = [];
  if (form.action === 'add') {
    data.type = form.type;
    data.id = form.id.trim();
  }
  if (form.type === 'influxdb') {
    if (isUdp.value) {
      if (form.action === 'edit') deleted.push('influxdbproto');
      setOptional(data, deleted, 'mtu');
    } else {
      data.influxdbproto = form.influxdbproto;
      (['organization', 'bucket', 'api-path-prefix', 'timeout', 'max-body-size'] as const).forEach(
        (key) => setOptional(data, deleted, key)
      );
      setOptional(data, deleted, 'token', true);
      if (form.influxdbproto === 'https') {
        if (form['verify-certificate']) {
          if (form.action === 'edit') deleted.push('verify-certificate');
        } else {
          data['verify-certificate'] = 0;
        }
      }
    }
  } else if (form.type === 'graphite') {
    setOptional(data, deleted, 'path');
    setOptional(data, deleted, 'proto');
    if (isGraphiteTcp.value) {
      setOptional(data, deleted, 'timeout');
      if (form.action === 'edit') deleted.push('mtu');
    } else {
      setOptional(data, deleted, 'mtu');
      if (form.action === 'edit') deleted.push('timeout');
    }
  } else {
    data['otel-protocol'] = form['otel-protocol'];
    data['otel-path'] = form['otel-path'];
    data['otel-timeout'] = form['otel-timeout'];
    data['otel-verify-ssl'] = form['otel-verify-ssl'] ? 1 : 0;
    data['otel-max-body-size'] = form['otel-max-body-size'];
    data['otel-compression'] = form['otel-compression'];
    data['otel-headers'] = encodeBase64(form.headers_advanced.trim());
    data['otel-resource-attributes'] = encodeBase64(form.resource_attributes_advanced.trim());
  }
  if (deleted.length) data.delete = [...new Set(deleted)].join(',');
  return data;
}

function isJsonOrEmpty(value: string) {
  if (!value.trim()) return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
function encodeBase64(value: string) {
  return value ? btoa(String.fromCharCode(...new TextEncoder().encode(value))) : '';
}
function decodeBase64(value: string) {
  try {
    return value
      ? new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)))
      : '';
  } catch {
    return '';
  }
}
function validNumber(value: string, min: number, max?: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= min && (max === undefined || numeric <= max);
}
function validForm() {
  if (
    !form.id.trim() ||
    !form.server.trim() ||
    !validNumber(form.port, 1, form.type === 'opentelemetry' ? 65535 : 65536)
  )
    return false;
  if (form.type === 'influxdb')
    return (
      (!form.timeout || validNumber(form.timeout, 1)) &&
      (!form['max-body-size'] || validNumber(form['max-body-size'], 1)) &&
      (!form.mtu || validNumber(form.mtu, 1))
    );
  if (form.type === 'graphite')
    return (
      (!form.mtu || validNumber(form.mtu, 1)) && (!form.timeout || validNumber(form.timeout, 1))
    );
  return (
    Boolean(form['otel-path'].trim()) &&
    validNumber(form['otel-timeout'], 1, 300) &&
    validNumber(form['otel-max-body-size'], 1024)
  );
}

function onOtelProtocolChange(value: string) {
  form['otel-protocol'] = value;
  form.port = value === 'https' ? '4318' : '4317';
}

async function save() {
  submitted.value = true;
  if (!canSubmit.value) return;
  dialogLoading.value = true;
  try {
    const id = form.id.trim();
    if (form.action === 'add') await createMetricServer(id, buildSubmitData());
    else await updateMetricServer(id, buildSubmitData());
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
function editSelected() {
  void openDialog('edit');
}
function rowDblClick(_: Event, row: PveRecord) {
  selected.value = [row];
  void openDialog('edit');
}
onMounted(() => {
  void reload();
});
</script>

<template>
  <div class="q-pa-md bg-white q-ma-md">
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
      @row-dblclick="rowDblClick"
      @update:selected="selected = [...$event]"
    >
      <template #top>
        <div class="q-gutter-sm">
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
          >
            <q-list>
              <q-item
                v-for="type in ['graphite', 'influxdb', 'opentelemetry'] as MetricType[]"
                :key="type"
                v-close-popup
                clickable
                @click="openDialog('add', type)"
              >
                <q-item-section>{{ formatMetricType(type) }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selected.length !== 1 ? 'grey' : 'primary'"
            :disable="selected.length !== 1"
            :label="gettext('Edit')"
            @click="editSelected"
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
    <q-dialog
      v-model="dialogVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="`${gettext(form.action === 'add' ? 'Add' : 'Edit')}: ${dialogTypeLabel}`"
        width="580px"
        :loading="dialogLoading"
      >
        <div class="q-pa-sm u-dense">
          <div class="u-border q-pa-md">
            <div class="row q-col-gutter-lg metric-server-form">
              <div class="col">
                <q-input
                  v-model="form.id"
                  dense
                  :disable="form.action !== 'add'"
                  :label="`${gettext('Name')} *`"
                  :error="submitted && !form.id.trim()"
                  :error-message="gettext('This field is required')"
                />
                <q-input
                  v-model="form.server"
                  dense
                  :label="`${gettext('Server')} *`"
                  :error="submitted && !form.server.trim()"
                  :error-message="gettext('This field is required')"
                />
                <q-input
                  v-model="form.port"
                  dense
                  type="number"
                  min="1"
                  :max="form.type === 'opentelemetry' ? 65535 : 65536"
                  :label="`${gettext('Port')} *`"
                  :error="
                    submitted &&
                    !validNumber(form.port, 1, form.type === 'opentelemetry' ? 65535 : 65536)
                  "
                  :error-message="
                    form.port ? gettext('Invalid value') : gettext('This field is required')
                  "
                />
                <template v-if="form.type === 'influxdb'">
                  <q-select
                    v-model="form.influxdbproto"
                    dense
                    emit-value
                    map-options
                    options-dense
                    :options="influxProtocolOptions"
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
                    :label="`${gettext('Timeout')} (s)`"
                    :error="submitted && Boolean(form.timeout) && !validNumber(form.timeout, 1)"
                    :error-message="gettext('Invalid value')"
                  />
                </template>
                <template v-else-if="form.type === 'graphite'">
                  <q-select
                    v-model="form.proto"
                    dense
                    emit-value
                    map-options
                    options-dense
                    :options="graphiteProtocolOptions"
                    :label="gettext('Protocol')"
                  />
                  <q-input
                    v-model="form.mtu"
                    dense
                    type="number"
                    min="1"
                    :disable="isGraphiteTcp"
                    :label="gettext('MTU')"
                    :error="submitted && Boolean(form.mtu) && !validNumber(form.mtu, 1)"
                    :error-message="gettext('Invalid value')"
                  />
                </template>
                <template v-else>
                  <q-select
                    :model-value="form['otel-protocol']"
                    dense
                    emit-value
                    map-options
                    options-dense
                    :options="otelProtocolOptions"
                    :label="gettext('Protocol')"
                    @update:model-value="onOtelProtocolChange"
                  />
                  <q-input
                    v-model="form['otel-path']"
                    dense
                    :label="`${gettext('Path')} *`"
                    :error="submitted && !form['otel-path'].trim()"
                    :error-message="gettext('This field is required')"
                  />
                  <q-input
                    v-model="form['otel-timeout']"
                    dense
                    type="number"
                    min="1"
                    max="300"
                    :label="`${gettext('Timeout')} (s) *`"
                    :error="submitted && !validNumber(form['otel-timeout'], 1, 300)"
                    :error-message="gettext('Invalid value')"
                  />
                </template>
              </div>
              <div class="col">
                <q-checkbox
                  v-model="form.enabled"
                  dense
                  color="primary"
                  :label="gettext('Enabled')"
                />
                <template v-if="form.type === 'influxdb'">
                  <q-input
                    v-model="form.organization"
                    dense
                    :disable="isUdp"
                    :placeholder="'proxmox'"
                    :label="gettext('Organization')"
                  />
                  <q-input
                    v-model="form.bucket"
                    dense
                    :disable="isUdp"
                    :placeholder="'proxmox'"
                    :label="gettext('Bucket')"
                  />
                  <q-input
                    v-model="form.token"
                    dense
                    :disable="isUdp"
                    :placeholder="form.action === 'edit' ? gettext('unchanged') : ''"
                    :label="gettext('Token')"
                  />
                  <q-checkbox
                    v-model="form['verify-certificate']"
                    dense
                    color="primary"
                    :disable="form.influxdbproto !== 'https'"
                    :label="gettext('Verify Certificate')"
                  />
                  <q-input
                    v-model="form['max-body-size']"
                    dense
                    type="number"
                    min="1"
                    :disable="isUdp"
                    placeholder="25000000"
                    :label="gettext('Batch Size (bytes)')"
                    :error="
                      submitted &&
                      Boolean(form['max-body-size']) &&
                      !validNumber(form['max-body-size'], 1)
                    "
                    :error-message="gettext('Invalid value')"
                  />
                  <q-input
                    v-model="form.mtu"
                    dense
                    type="number"
                    min="1"
                    :disable="!isUdp"
                    placeholder="1500"
                    :label="gettext('MTU')"
                    :error="submitted && Boolean(form.mtu) && !validNumber(form.mtu, 1)"
                    :error-message="gettext('Invalid value')"
                  />
                </template>
                <template v-else-if="form.type === 'graphite'">
                  <q-input
                    v-model="form.path"
                    dense
                    placeholder="proxmox"
                    :label="gettext('Path')"
                  />
                  <q-input
                    v-model="form.timeout"
                    dense
                    type="number"
                    min="1"
                    :disable="!isGraphiteTcp"
                    placeholder="1"
                    :label="gettext('TCP Timeout')"
                    :error="submitted && Boolean(form.timeout) && !validNumber(form.timeout, 1)"
                    :error-message="gettext('Invalid value')"
                  />
                </template>
                <template v-else>
                  <q-checkbox
                    v-model="form['otel-verify-ssl']"
                    dense
                    color="primary"
                    :label="gettext('Verify SSL')"
                  />
                  <q-input
                    v-model="form['otel-max-body-size']"
                    dense
                    type="number"
                    min="1024"
                    :label="`${gettext('Max Body Size (bytes)')} *`"
                    :error="submitted && !validNumber(form['otel-max-body-size'], 1024)"
                    :error-message="gettext('Invalid value')"
                  />
                  <q-select
                    v-model="form['otel-compression']"
                    dense
                    emit-value
                    map-options
                    options-dense
                    :options="compressionOptions"
                    :label="gettext('Compression')"
                  />
                </template>
              </div>
            </div>
          </div>
          <q-expansion-item
            v-if="form.type === 'opentelemetry'"
            class="q-mt-md u-border"
            :label="gettext('Advanced JSON Configuration')"
          >
            <div class="q-pa-md metric-server-advanced-form">
              <q-input
                v-model="form.headers_advanced"
                type="textarea"
                :error="submitted && !isJsonOrEmpty(form.headers_advanced)"
                :error-message="gettext('Invalid JSON format')"
                :label="gettext('HTTP Headers (JSON)')"
              />
              <q-input
                v-model="form.resource_attributes_advanced"
                type="textarea"
                :error="submitted && !isJsonOrEmpty(form.resource_attributes_advanced)"
                :error-message="gettext('Invalid JSON format')"
                :label="gettext('Resource Attributes (JSON)')"
              />
            </div>
          </q-expansion-item>
        </div>
        <template #foot>
          <q-btn
            no-caps
            flat
            size="12px"
            :disable="dialogLoading"
            class="bg-primary text-grey-1 u-button"
            :label="gettext(form.action === 'add' ? 'Add' : 'OK')"
            @click="save"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.metric-server-form :deep(.q-field),
.metric-server-advanced-form :deep(.q-field) {
  padding-bottom: 15px;
}

.metric-server-form :deep(.q-checkbox) {
  display: flex;
  align-items: center;
  height: 40px;
  margin-bottom: 15px;
}
</style>
