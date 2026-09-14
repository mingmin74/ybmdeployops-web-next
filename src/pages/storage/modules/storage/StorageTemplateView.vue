<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import StorageDownloadUrlDialog from './StorageDownloadUrlDialog.vue';
import StorageUploadDialog from './StorageUploadDialog.vue';
import type { PveRecord } from '@/api/resources';
import {
  deleteStorageContent,
  downloadContainerTemplate,
  getContainerTemplates,
  getStorageContent,
  pullOciRegistryImage,
  queryOciRepositoryTags,
} from '@/api/storageContent';
import { gettext } from '@/locale';
import {
  formatContentDate,
  formatContentSize,
  formatStorageContent,
  textValue,
} from '@/utils/pveFormat';
import { Dialog } from 'quasar';
import { getNodeStatus } from '@/api/overview';

const props = defineProps<{ node: string; storage: string; active?: boolean }>();
const loading = ref(false);
const filter = ref('');
const rows = shallowRef<PveRecord[]>([]);
const selected = ref<PveRecord[]>([]);
const templates = shallowRef<PveRecord[]>([]);
const templateFilter = ref('');
const templateSection = shallowRef('');
const showAllArchitectures = ref(false);
const nodeArchitecture = ref('');
const selectedTemplate = ref<PveRecord>();
const templatesVisible = ref(false);
const ociVisible = ref(false);
const taskVisible = ref(false);
const taskUpid = ref('');
const taskTitle = ref('');
const uploadVisible = ref(false);
const downloadVisible = ref(false);
const oci = reactive({ reference: '', tag: '', filename: '' });
const ociTags = shallowRef<string[]>([]);
const selectedRow = computed(() => selected.value[0]);
const ociReferencePattern =
  /^((?:[a-zA-Z\d](?:[a-zA-Z\d-]*[a-zA-Z\d])?(?:\.(?:[a-zA-Z\d](?:[a-zA-Z\d-]*[a-zA-Z\d])?))*(?::\d+)?\/)?[a-z\d]+(?:(?:[._]|__|-+)[a-z\d]+)*(?:\/[a-z\d]+(?:(?:[._]|__|-+)[a-z\d]+)*)*)(?::(\w[\w.-]{0,127}))?$/;
function parseOciReference(value: string) {
  return value.trim().match(ociReferencePattern);
}
const validOciReference = computed(() => !!parseOciReference(oci.reference));
const visibleTemplates = computed(() => {
  if (showAllArchitectures.value || !nodeArchitecture.value) return templates.value;
  return templates.value.filter((template) => {
    const architecture = normalizeArchitecture(textValue(template.architecture));
    return !architecture || architecture === 'all' || architecture === nodeArchitecture.value;
  });
});
const templateSections = computed(() => {
  const groups = new Map<string, PveRecord[]>();
  visibleTemplates.value.forEach((template) => {
    const section = textValue(template.section, gettext('Other'));
    groups.set(section, [...(groups.get(section) || []), template]);
  });
  return [...groups.entries()].map(([section, rows]) => ({ section, rows }));
});
const activeTemplateRows = computed(
  () => templateSections.value.find((group) => group.section === templateSection.value)?.rows || []
);
watch(templateSections, (groups) => {
  if (!groups.some((group) => group.section === templateSection.value)) {
    templateSection.value = groups[0]?.section || '';
  }
});
watch([templateSection, templateFilter, showAllArchitectures], () => {
  selectedTemplate.value = undefined;
});
function normalizeArchitecture(value: string) {
  if (value === 'amd64') return 'x86_64';
  if (value === 'arm64') return 'aarch64';
  return value;
}
function isForeignArchitecture(template: PveRecord) {
  const architecture = normalizeArchitecture(textValue(template.architecture));
  return (
    !!nodeArchitecture.value &&
    !!architecture &&
    architecture !== 'all' &&
    architecture !== nodeArchitecture.value
  );
}
const templateColumns: QTableColumn<PveRecord>[] = [
  { name: 'type', label: gettext('Type'), align: 'left', field: 'type', sortable: true },
  { name: 'package', label: gettext('Name'), align: 'left', field: 'package', sortable: true },
  { name: 'version', label: gettext('Version'), align: 'left', field: 'version', sortable: true },
  {
    name: 'architecture',
    label: gettext('Architecture'),
    align: 'left',
    field: (row) => textValue(row.architecture, gettext('unknown')),
    sortable: true,
  },
  {
    name: 'headline',
    label: gettext('Description'),
    align: 'left',
    field: 'headline',
    sortable: true,
  },
];
const contentColumns = computed<QTableColumn<PveRecord>[]>(() => [
  {
    name: 'name',
    label: gettext('Name'),
    align: 'left',
    field: (row) => formatStorageContent(row.volid),
    sortable: true,
    sort: (a, b) => textValue(a).localeCompare(textValue(b), undefined, { numeric: true }),
  },
  { name: 'date', label: gettext('Date'), align: 'left', field: formatContentDate, sortable: true },
  {
    name: 'format',
    label: gettext('Format'),
    align: 'left',
    field: (row) => textValue(row.format, '-'),
    sortable: true,
  },
  { name: 'size', label: gettext('Size'), align: 'left', field: formatContentSize, sortable: true },
]);
async function reload() {
  if (!props.node || !props.storage) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    rows.value = (await getStorageContent(props.node, props.storage, 'vztmpl')).data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
async function openTemplates() {
  loading.value = true;
  try {
    const [templateResponse, statusResponse] = await Promise.all([
      getContainerTemplates(props.node),
      getNodeStatus(props.node),
    ]);
    templates.value = templateResponse.data || [];
    const cpuInfo = statusResponse.data?.cpuinfo as PveRecord | undefined;
    nodeArchitecture.value = normalizeArchitecture(
      textValue(statusResponse.data?.arch || cpuInfo?.arch)
    );
    selectedTemplate.value = undefined;
    showAllArchitectures.value = false;
    templateSection.value = templateSections.value[0]?.section || '';
    templatesVisible.value = true;
  } finally {
    loading.value = false;
  }
}
function templateRowClick(_: Event, row: PveRecord) {
  selectedTemplate.value = row;
}
async function downloadTemplate() {
  const template = textValue(selectedTemplate.value?.template);
  if (!template) return;
  loading.value = true;
  try {
    taskUpid.value = String(
      (await downloadContainerTemplate(props.node, props.storage, template)).data || ''
    );
    taskTitle.value = gettext('Download');
    templatesVisible.value = false;
    taskVisible.value = !!taskUpid.value;
  } finally {
    loading.value = false;
  }
}
async function queryTags() {
  if (!oci.reference.trim() || !validOciReference.value) return;
  loading.value = true;
  try {
    oci.tag = '';
    ociTags.value = (await queryOciRepositoryTags(props.node, oci.reference.trim())).data || [];
  } finally {
    loading.value = false;
  }
}
async function pullOci() {
  if (!validOciReference.value || !oci.tag.trim()) return;
  loading.value = true;
  try {
    taskUpid.value = String(
      (
        await pullOciRegistryImage(props.node, props.storage, {
          reference: `${oci.reference.trim()}:${oci.tag.trim()}`,
          ...(oci.filename.trim() ? { filename: oci.filename.trim() } : {}),
        })
      ).data || ''
    );
    taskTitle.value = gettext('Download');
    ociVisible.value = false;
    taskVisible.value = !!taskUpid.value;
  } finally {
    loading.value = false;
  }
}
function remove() {
  if (!selectedRow.value) return;
  const volid = textValue(selectedRow.value.volid);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', volid),
    cancel: true,
    persistent: true,
  }).onOk(() => void deleteStorageContent(props.node, props.storage, volid).then(reload));
}
watch(
  () => props.active,
  (active) => {
    if (active) void reload();
  },
  { immediate: true }
);
watch(
  () => oci.reference,
  (value, previous) => {
    const parsed = parseOciReference(value);
    if (parsed?.[2]) {
      oci.reference = parsed[1] || '';
      oci.tag = parsed[2];
      ociTags.value = [];
      return;
    }
    if (value.trim() !== previous.trim()) {
      ociTags.value = [];
      oci.tag = '';
    }
  }
);
</script>

<template>
  <q-table
    flat
    row-key="volid"
    table-header-class="u-table-header"
    selection="single"
    :rows="rows"
    :columns="contentColumns"
    :selected="selected"
    :filter="filter"
    :pagination="{ page: 1, rowsPerPage: 10 }"
    :rows-per-page-options="[10]"
    :loading="loading"
    :no-data-label="gettext('no record can be found')"
    @row-click="(_, row) => (selected = selected[0] === row ? [] : [row])"
    @update:selected="selected = [...$event]"
  >
    <template #top>
      <div class="row q-gutter-sm">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Templates')"
          @click="openTemplates"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Pull from OCI Registry')"
          @click="ociVisible = true"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Upload')"
          @click="uploadVisible = true"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Download from URL')"
          @click="downloadVisible = true"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedRow ? 'red' : 'grey'"
          :disable="!selectedRow"
          :label="gettext('Remove')"
          @click="remove"
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
    v-model="templatesVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Templates')"
      width="900px"
      :loading="loading"
    >
      <div class="q-pa-md">
        <div class="template-toolbar">
          <q-input
            v-model="templateFilter"
            borderless
            dense
            class="template-search"
            :placeholder="gettext('Search')"
            :aria-label="gettext('Search')"
          >
            <template #prepend>
              <q-icon
                name="search"
                size="18px"
              />
            </template>
          </q-input>
          <q-checkbox
            v-model="showAllArchitectures"
            dense
            color="primary"
            right-label
            :label="gettext('Show all architectures')"
          />
        </div>
        <div
          v-if="nodeArchitecture && !showAllArchitectures"
          class="text-caption text-grey-7 q-mb-sm"
        >
          {{ gettext('Showing templates for architecture') }}: {{ nodeArchitecture }}
        </div>
        <q-tabs
          v-model="templateSection"
          dense
          no-caps
          align="left"
          active-color="primary"
          indicator-color="primary"
          narrow-indicator
          class="template-section-tabs"
        >
          <q-tab
            v-for="group in templateSections"
            :key="group.section"
            :name="group.section"
            :label="`${group.section} (${group.rows.length})`"
          />
        </q-tabs>
        <div class="template-table-container">
          <q-table
            flat
            :key="templateSection"
            class="template-table"
            table-header-class="u-table-header"
            row-key="template"
            :rows="activeTemplateRows"
            :columns="templateColumns"
            :filter="templateFilter"
            :pagination="{ rowsPerPage: 10 }"
            :rows-per-page-options="[10, 20, 50]"
            :no-data-label="gettext('no record can be found')"
            selection="single"
            :selected="selectedTemplate ? [selectedTemplate] : []"
            @update:selected="selectedTemplate = $event[0]"
            @row-click="templateRowClick"
          >
            <template #body-cell-architecture="scope">
              <q-td :props="scope">
                {{ scope.value }}
                <q-icon
                  v-if="isForeignArchitecture(scope.row)"
                  name="info"
                  color="info"
                  size="16px"
                  class="q-ml-xs"
                >
                  <q-tooltip>
                    {{
                      gettext(
                        'This template cannot run natively on this node and requires binfmt_misc with qemu-user-static.'
                      )
                    }}
                  </q-tooltip>
                </q-icon>
              </q-td>
            </template>
          </q-table>
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button u-border-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!selectedTemplate"
          :label="gettext('Download')"
          @click="downloadTemplate"
        />
      </template>
    </UWindow>
  </q-dialog>
  <q-dialog
    v-model="ociVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Pull from OCI Registry')"
      width="560px"
      :loading="loading"
    >
      <div class="q-pa-md">
        <div class="oci-reference-row">
          <q-input
            v-model="oci.reference"
            dense
            class="q-field--with-bottom"
            :label="gettext('Reference')"
            :error="!!oci.reference && !validOciReference"
            :error-message="gettext('Invalid OCI reference')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button oci-query-button"
            :disable="!validOciReference"
            :label="gettext('Query Tags')"
            @click="queryTags"
          />
        </div>
        <q-select
          v-model="oci.tag"
          dense
          class="q-field--with-bottom"
          options-dense
          use-input
          input-debounce="0"
          new-value-mode="add-unique"
          :options="ociTags"
          :label="gettext('Tag')"
        />
        <q-input
          v-model="oci.filename"
          dense
          class="q-field--with-bottom"
          :label="gettext('File name')"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button u-border-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!validOciReference || !oci.tag.trim()"
          :label="gettext('Download')"
          @click="pullOci"
        />
      </template>
    </UWindow>
  </q-dialog>
  <TaskOutputDialog
    v-model="taskVisible"
    :node="node"
    :upid="taskUpid"
    :title="taskTitle"
    @finished="reload"
  />
  <StorageUploadDialog
    v-model="uploadVisible"
    :node="node"
    :storage="storage"
    content="vztmpl"
    @task="
      (upid) => {
        taskUpid = upid;
        taskTitle = gettext('Upload');
        taskVisible = !!upid;
      }
    "
  />
  <StorageDownloadUrlDialog
    v-model="downloadVisible"
    :node="node"
    :storage="storage"
    content="vztmpl"
    @task="
      (upid) => {
        taskUpid = upid;
        taskTitle = gettext('Download');
        taskVisible = !!upid;
      }
    "
  />
</template>

<style scoped>
.oci-reference-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}

.oci-query-button {
  margin-top: 8px;
}

@media (max-width: 400px) {
  .oci-reference-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .oci-query-button {
    justify-self: end;
    margin: 0 0 12px;
  }
}

.template-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.template-search {
  flex: 1 1 240px;
  min-width: 0;
}

.template-section-tabs {
  background: #f2f5fc;
  border: 1px solid #dfe1e6;
}

.template-section-tabs :deep(.q-tab) {
  min-height: 40px;
  padding: 0 16px;
}

.template-table-container {
  border: 1px solid #dfe1e6;
  border-top: 0;
}

.template-table {
  border-radius: 0;
}

.template-table :deep(.q-table__middle) {
  max-height: min(440px, 50vh);
}

.template-table :deep(thead tr th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f2f5fc;
}
</style>
