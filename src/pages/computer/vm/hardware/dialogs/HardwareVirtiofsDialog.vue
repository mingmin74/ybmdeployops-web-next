<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { getDirectoryMappings } from '@/api/deviceMapping';
import { getVmConfig, updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const form = reactive({
  directoryId: '',
  cache: '__default__',
  xattr: false,
  acl: false,
  directIo: false,
});
const advanced = shallowRef(false);
const dirMappingRows = shallowRef<PveRecord[]>([]);
const mappingLoading = shallowRef(false);
const virtiofsConfig = shallowRef<PveRecord | null>(null);
const virtiofsDigest = shallowRef('');
const virtiofsConfigLoaded = shallowRef(false);
let virtiofsConfigSession = 0;
const { config, hasVmCapability, loading, node, vmid, notifyUpdated, pendingByKey } =
  useVmHardwareContext();

const cacheOptions = [
  { label: `${gettext('Default')} (auto)`, value: '__default__' },
  { label: 'auto', value: 'auto' },
  { label: 'always', value: 'always' },
  { label: 'metadata', value: 'metadata' },
  { label: 'never', value: 'never' },
];

const dirMappingColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'id',
    label: gettext('Directory ID'),
    field: (row) => textValue(row.id),
    align: 'left',
  },
  {
    name: 'description',
    label: gettext('Comment'),
    field: (row) => textValue(row.description),
    align: 'left',
  },
];

const activeVirtiofsConfig = computed(() => virtiofsConfig.value || config.value);
const virtiofsKey = computed(() => {
  for (let index = 0; index < 10; index += 1) {
    const key = `virtiofs${index}`;
    if (activeVirtiofsConfig.value[key] === undefined && !pendingByKey.value[key]) return key;
  }
  return '';
});
const virtiofsKeyAvailable = computed(() => Boolean(virtiofsKey.value));
const canAdd = computed(
  () =>
    hasVmCapability('VM.Config.Options') &&
    virtiofsConfigLoaded.value &&
    virtiofsKeyAvailable.value &&
    Boolean(form.directoryId.trim())
);

function resetForm() {
  Object.assign(form, {
    directoryId: '',
    cache: '__default__',
    xattr: false,
    acl: false,
    directIo: false,
  });
  advanced.value = false;
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  resetForm();
  void initializeVirtiofs();
  void loadDirectoryMappings();
});

watch(
  () => form.acl,
  (enabled) => {
    if (enabled) form.xattr = true;
  }
);

async function loadDirectoryMappings() {
  if (!node.value) return;
  mappingLoading.value = true;
  try {
    const response = await getDirectoryMappings(node.value);
    const rows = response.data || [];
    dirMappingRows.value = [...rows].sort((left, right) =>
      textValue(left.id).localeCompare(textValue(right.id))
    );
  } finally {
    mappingLoading.value = false;
  }
}

async function initializeVirtiofs() {
  const session = ++virtiofsConfigSession;
  virtiofsConfigLoaded.value = false;
  virtiofsConfig.value = null;
  virtiofsDigest.value = '';
  if (!hasVmCapability('VM.Config.Options')) return;
  loading.value = true;
  try {
    const response = await getVmConfig(node.value, vmid.value);
    if (session !== virtiofsConfigSession || !visible.value || !response.data) return;
    virtiofsConfig.value = response.data;
    virtiofsDigest.value = textValue(response.data.digest);
    virtiofsConfigLoaded.value = true;
  } finally {
    if (session === virtiofsConfigSession) loading.value = false;
  }
}

function getDirectoryId(row: PveRecord) {
  return textValue(row.id);
}

function virtiofsValue() {
  const values = [form.directoryId.trim()];
  if (form.cache !== '__default__') values.push(`cache=${form.cache}`);
  if (form.xattr) values.push('expose-xattr=1');
  if (form.acl) values.push('expose-acl=1');
  if (form.directIo) values.push('direct-io=1');
  return values.join(',');
}

async function addVirtiofs() {
  const key = virtiofsKey.value;
  if (!canAdd.value || !key) return;
  loading.value = true;
  try {
    await updateVmConfig(node.value, vmid.value, {
      digest: virtiofsDigest.value,
      [key]: virtiofsValue(),
    });
    notifyUpdated();
  } finally {
    loading.value = false;
  }
  visible.value = false;
}
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
  >
    <UWindow
      :title="`${gettext('Add')}:${gettext('Virtiofs Filesystem Passthrough')}`"
      width="450px"
      :loading="loading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <SelectTable
            v-model="form.directoryId"
            row-key="id"
            width="500px"
            field-style="standard"
            style="width: 100%"
            :rows="dirMappingRows"
            :columns="dirMappingColumns"
            :display-value="form.directoryId"
            :loading="mappingLoading"
            :label="gettext('Directory ID')"
            :error="!form.directoryId.trim()"
            :error-message="gettext('This field is required')"
            :get-row-value="getDirectoryId"
          />
          <div class="virtiofs-hint q-mt-xs">
            {{
              gettext('Directory Mappings can be managed under Datacenter -> Directory Mappings')
            }}
          </div>
          <div
            v-if="!virtiofsKeyAvailable"
            class="virtiofs-warning q-mt-sm"
          >
            {{ gettext('No free Virtiofs device slots are available') }}
          </div>
        </div>

        <div
          v-if="advanced"
          class="u-border q-pa-md q-mt-sm"
        >
          <q-select
            v-model="form.cache"
            dense
            options-dense
            emit-value
            map-options
            color="grey-8"
            class="q-field--with-bottom"
            :options="cacheOptions"
            :label="gettext('Cache')"
          />
          <q-checkbox
            v-model="form.xattr"
            class="virtiofs-checkbox"
            dense
            :disable="form.acl"
            :label="gettext('xattr Support')"
          />
          <q-checkbox
            v-model="form.acl"
            class="virtiofs-checkbox"
            dense
            :label="gettext('POSIX ACLs')"
          />
          <q-checkbox
            v-model="form.directIo"
            class="virtiofs-checkbox"
            dense
            :label="gettext('Allow Direct IO')"
          />
        </div>

        <q-checkbox
          v-model="advanced"
          class="q-mt-sm"
          dense
          :label="gettext('Advanced')"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canAdd"
          :label="gettext('Add')"
          @click="addVirtiofs"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.virtiofs-hint {
  color: #757575;
  font-size: 12px;
  line-height: 1.45;
}

.virtiofs-warning {
  color: #b7791f;
  font-size: 12px;
  line-height: 1.45;
}

.virtiofs-checkbox {
  display: flex;
  margin-top: 6px;
}
</style>
