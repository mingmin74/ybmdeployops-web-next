<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  deleteStorageContent,
  getNodeStorage,
  getStorageContent,
  getStorageStatus,
  getVmResources,
  uploadStorageContent,
} from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatBytes, formatContent, textValue, usedPercent } from '@/utils/pveFormat';

const props = defineProps<{
  content: 'iso' | 'images';
  showUpload?: boolean;
}>();

const loading = ref(false);
const filter = ref('');
const node = ref('');
const storage = ref('');
const selected = ref<PveRecord[]>([]);
const uploadDialog = ref(false);
const uploading = ref(false);
const uploadProgress = ref(0);
const uploadSize = ref(0);
const uploadFile = ref<File>();
const storages = shallowRef<PveRecord[]>([]);
const status = shallowRef<PveRecord>({});
const rows = shallowRef<PveRecord[]>([]);
const vmMap = shallowRef<Record<string, string>>({});

const storageOptions = computed(() =>
  storages.value.map((item) => ({
    label: textValue(item.storage),
    value: textValue(item.storage),
  })),
);

const usage = computed(() => usedPercent(Number(status.value.used), Number(status.value.total)));

const columns = computed<QTableColumn<PveRecord>[]>(() => {
  const base: QTableColumn<PveRecord>[] = [
    {
      name: 'volid',
      required: true,
      label: gettext('Name'),
      align: 'left',
      field: (row) => row.volid || '-',
      sortable: true,
    },
  ];

  if (props.content === 'iso') {
    base.push({
      name: 'md5',
      label: gettext('MD5'),
      align: 'left',
      field: (row) => row.md5 || '-',
      sortable: true,
    });
  } else {
    base.push({
      name: 'vmid',
      label: gettext('VMID'),
      align: 'left',
      field: (row) => {
        const vmid = textValue(row.vmid);
        return vmid ? `${vmid}${vmMap.value[vmid] ? `(${vmMap.value[vmid]})` : ''}` : '-';
      },
      sortable: true,
    });
  }

  base.push(
    {
      name: 'format',
      label: gettext('Format'),
      align: 'left',
      field: (row) => row.format || '-',
      sortable: true,
    },
    {
      name: 'content',
      label: gettext('Content'),
      align: 'left',
      field: (row) => formatContent(row.content),
      sortable: true,
    },
    {
      name: 'size',
      label: gettext('Size'),
      align: 'left',
      field: (row) => formatBytes(row.size as number),
      sortable: true,
    },
  );

  if (props.content === 'images') {
    base.push({
      name: 'used',
      label: gettext('Used'),
      align: 'left',
      field: (row) => formatBytes(row.used as number),
      sortable: true,
    });
  }

  return base;
});

async function loadStorages() {
  if (!node.value) return;
  loading.value = true;
  try {
    const response = await getNodeStorage(node.value, props.content);
    storages.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage)),
    );
    storage.value = textValue(storages.value[0]?.storage);
    await refreshData();
  } finally {
    loading.value = false;
  }
}

async function refreshData() {
  if (!node.value || !storage.value) {
    status.value = {};
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const [statusResponse, contentResponse] = await Promise.all([
      getStorageStatus(node.value, storage.value),
      getStorageContent(node.value, storage.value, props.content),
    ]);
    status.value = statusResponse.data || {};
    rows.value = contentResponse.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadVmMap() {
  if (props.content !== 'images') return;
  const response = await getVmResources();
  const nextMap: Record<string, string> = {};
  (response.data || []).forEach((item) => {
    if (item.vmid) nextMap[textValue(item.vmid)] = textValue(item.name);
  });
  vmMap.value = nextMap;
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = selected.value[0] === row ? [] : [row];
}

function removeSelected() {
  const row = selected.value[0];
  if (!row || !node.value || !storage.value) return;
  const volid = textValue(row.volid);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', volid),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteStorageContent(node.value, storage.value, volid)
      .then(() => refreshData())
      .finally(() => {
        loading.value = false;
      });
  });
}

function openUpload() {
  uploadFile.value = undefined;
  uploadProgress.value = 0;
  uploadSize.value = 0;
  uploadDialog.value = true;
}

function selectUploadFile(event: Event) {
  const input = event.target as HTMLInputElement;
  uploadFile.value = input.files?.[0];
  uploadProgress.value = 0;
  uploadSize.value = uploadFile.value?.size || 0;
}

async function uploadSelectedFile() {
  if (!uploadFile.value || !node.value || !storage.value) return;
  uploading.value = true;
  try {
    await uploadStorageContent(
      node.value,
      storage.value,
      uploadFile.value,
      props.content,
      (progress, total) => {
        uploadProgress.value = progress;
        uploadSize.value = total;
      },
    );
    uploadDialog.value = false;
    await refreshData();
  } finally {
    uploading.value = false;
  }
}

watch(node, () => {
  void loadStorages();
});

watch(storage, () => {
  void refreshData();
});

onMounted(() => {
  void loadVmMap();
});
</script>

<template>
  <div class="q-ma-md">
    <div class="no-shadow no-border-radius q-mb-sm bg-white q-pa-sm">
      <div class="row q-gutter-sm items-center">
        <NodeSelectTable v-model="node" />
        <q-select
          v-model="storage"
          square
          outlined
          dense
          emit-value
          map-options
          options-dense
          class="u-dense storage-select"
          :options="storageOptions"
          :label="gettext('Storage')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Refresh')"
          @click="refreshData"
        />
      </div>
    </div>

    <div class="content-center u-main-area">
      <div class="bg-grey-3 q-py-md q-px-md text-grey-10">
        <div class="row q-ma-sm">
          <div class="col">
            {{ gettext('Storage') }}: <span class="text-grey-8">{{ storage || '-' }}</span>
          </div>
          <div class="col">
            {{ gettext('Type') }}: <span class="text-grey-8">{{ status.type || '-' }}</span>
          </div>
          <div class="col">
            {{ gettext('Content') }}:
            <span class="text-grey-8">{{ formatContent(status.content) || '-' }}</span>
          </div>
        </div>
        <div class="row q-ma-sm">
          <div class="col">
            {{ gettext('Enabled') }}:
            <q-badge
              :color="status.enabled ? 'green' : 'red'"
              :label="status.enabled ? gettext('Yes') : gettext('No')"
            />
          </div>
          <div class="col">
            {{ gettext('Active') }}:
            <q-badge
              :color="status.active ? 'green' : 'red'"
              :label="status.active ? gettext('Yes') : gettext('No')"
            />
          </div>
          <div class="col">
            {{ gettext('Shared') }}:
            <q-badge
              :color="status.shared ? 'green' : 'red'"
              :label="status.shared ? gettext('Yes') : gettext('No')"
            />
          </div>
        </div>
        <div class="row q-ma-sm">
          <div class="col">
            {{ gettext('Total Size') }}:
            <span class="text-grey-8">{{ formatBytes(status.total as number) }}</span>
          </div>
          <div class="col">
            {{ gettext('Avail Size') }}:
            <span class="text-grey-8">{{ formatBytes(status.avail as number) }}</span>
          </div>
          <div class="col">
            {{ gettext('Used Size') }}:
            <span class="text-grey-8">{{ formatBytes(status.used as number) }}</span>
          </div>
        </div>
      </div>
      <div class="q-my-md">
        <UsageProgress :percent="usage" />
      </div>
      <q-table
        flat
        row-key="volid"
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
          <div class="row q-gutter-sm">
            <q-btn
              v-if="showUpload"
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Upload')"
              :disable="!storage || !node"
              @click="openUpload"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="selected.length !== 1 ? 'grey' : 'red'"
              :disable="selected.length !== 1"
              :label="gettext('Delete')"
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
            <template #append>
              <q-icon name="search" />
            </template>
          </q-input>
        </template>
        <template #no-data="{ message }">
          <div class="full-width row flex-center text-accent q-gutter-sm">
            <span class="text-grey-6">{{ message }}</span>
          </div>
        </template>
      </q-table>
    </div>
    <q-dialog v-model="uploadDialog" persistent transition-show="scale" transition-hide="scale">
      <UWindow
        :title="`${gettext('Upload')}: ${gettext('ISO')}`"
        width="400px"
        :loading="uploading"
      >
        <div class="q-pa-md">
          <div class="upload-border">
            <input type="file" accept=".iso" class="file-input" @change="selectUploadFile" />
            <div v-if="uploading" class="q-pa-md">
              <div class="column text-left u-size-12 text-grey-8 text-overflow q-gutter-sm">
                <span class="text-overflow"
                  >{{ gettext('File Name') }}: {{ uploadFile?.name }}</span
                >
                <span>{{ gettext('Size') }}: {{ formatBytes(uploadSize) }}</span>
                <q-linear-progress stripe size="20px" :value="uploadProgress" color="primary">
                  <div class="absolute-full flex flex-center">
                    <q-badge
                      class="bg-white"
                      text-color="primary"
                      :label="`${(uploadProgress * 100).toFixed(2)}%`"
                    />
                  </div>
                </q-linear-progress>
              </div>
            </div>
            <div v-else class="cursor-pointer upload-pick">
              <q-icon v-if="!uploadFile" name="cloud_upload" class="text-grey-3 upload-icon" />
              <span v-else class="text-overflow upload-name">{{ uploadFile.name }}</span>
            </div>
          </div>
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
            :disable="!uploadFile || uploading"
            :class="
              uploadFile && !uploading
                ? 'bg-primary text-grey-1 u-button'
                : 'bg-grey-4 text-grey-6 u-button'
            "
            :label="gettext('Upload')"
            @click="uploadSelectedFile"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped>
.storage-select {
  min-width: 180px;
}

.upload-border {
  position: relative;
  height: 120px;
  overflow: hidden;
  border: 1px solid #cccccc;
  text-align: center;
}

.file-input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}

.upload-pick {
  height: 120px;
  line-height: 120px;
}

.upload-icon {
  font-size: 5rem;
  vertical-align: middle;
}

.upload-name {
  display: block;
  width: 260px;
  margin: 0 auto;
}
</style>
