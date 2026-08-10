<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createSnapshotTask,
  getSnapshotTask,
  getSnapshotTasks,
  removeSnapshotTask,
  updateSnapshotTask,
  type SnapshotTask,
} from '@/api/maintenance';
import { getClusterResources, type PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

type SnapshotTaskRow = SnapshotTask & { enabledText: string; dowText: string };

const loading = ref(false);
const filter = ref('');
const tasks = ref<SnapshotTaskRow[]>([]);
const selectedTasks = ref<SnapshotTaskRow[]>([]);
const formVisible = ref(false);
const formLoading = ref(false);
const formSaving = ref(false);
const formAction = ref<'add' | 'edit'>('add');
const vmOptions = ref<PveRecord[]>([]);
const form = reactive({
  id: '',
  snapname: '',
  starttime: '',
  keepnumber: 1,
  enabled: false,
  dow: [] as string[],
  vmid: '',
  description: '',
  vmstate: '1',
});

const dayOptions = (
  [
    ['mon', 'Monday'],
    ['tue', 'Tuesday'],
    ['wed', 'Wednesday'],
    ['thu', 'Thursday'],
    ['fri', 'Friday'],
    ['sat', 'Saturday'],
    ['sun', 'Sunday'],
  ] as const
).map(([value, label]) => ({ value, label: gettext(label) }));
const selectedTask = computed(() => selectedTasks.value[0]);
const canOperate = computed(() => selectedTasks.value.length === 1);
const formTitle = computed(
  () => `${gettext(formAction.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Snapshot Task')}`,
);
const filteredTasks = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return tasks.value;
  return tasks.value.filter((task) =>
    [task.snapname, task.dowText, task.starttime, task.vmid, task.keepnumber, task.description]
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  );
});
const columns: QTableColumn<SnapshotTaskRow>[] = [
  { name: 'snapname', label: gettext('Name'), field: 'snapname', align: 'left', sortable: true },
  {
    name: 'enabled',
    label: gettext('Enabled'),
    field: 'enabledText',
    align: 'left',
    sortable: true,
  },
  { name: 'dow', label: gettext('Dow'), field: 'dowText', align: 'left', sortable: true },
  {
    name: 'starttime',
    label: gettext('Start Time'),
    field: 'starttime',
    align: 'left',
    sortable: true,
  },
  { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left', sortable: true },
  {
    name: 'keepnumber',
    label: gettext('Keep Number'),
    field: 'keepnumber',
    align: 'left',
    sortable: true,
  },
  { name: 'description', label: gettext('Description'), field: 'description', align: 'left' },
];

function dayText(value?: string) {
  return String(value || '')
    .split(',')
    .filter(Boolean)
    .map((day) => dayOptions.find((option) => option.value === day)?.label || day)
    .join(', ');
}

function toRow(task: SnapshotTask): SnapshotTaskRow {
  return {
    ...task,
    enabledText:
      Number(task.enabled) === 1 || task.enabled === true
        ? gettext('Enabled')
        : gettext('Disabled'),
    dowText: dayText(task.dow),
  };
}

function rowClick(_: Event, row: SnapshotTaskRow) {
  selectedTasks.value = selectedTask.value === row ? [] : [row];
}

async function reload() {
  loading.value = true;
  try {
    const response = await getSnapshotTasks();
    tasks.value = [...(response.data || [])]
      .map(toRow)
      .sort((left, right) =>
        String(left.snapname || '').localeCompare(String(right.snapname || '')),
      );
    selectedTasks.value = [];
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    id: '',
    snapname: '',
    starttime: '',
    keepnumber: 1,
    enabled: false,
    dow: [],
    vmid: '',
    description: '',
    vmstate: '1',
  });
}

async function openForm(action: 'add' | 'edit') {
  formAction.value = action;
  resetForm();
  formVisible.value = true;
  formLoading.value = true;
  try {
    const [vms, detail] = await Promise.all([
      getClusterResources({ type: 'vm' }),
      action === 'edit' && selectedTask.value
        ? getSnapshotTask(selectedTask.value.id)
        : Promise.resolve(undefined),
    ]);
    vmOptions.value = (vms.data || []).filter((item) => !item.template);
    if (detail?.data) {
      const task = detail.data;
      Object.assign(form, {
        id: task.id,
        snapname: String(task.snapname || ''),
        starttime: String(task.starttime || ''),
        keepnumber: Number(task.keepnumber || 1),
        enabled: Number(task.enabled) === 1 || task.enabled === true,
        dow: String(task.dow || '')
          .split(',')
          .filter(Boolean),
        vmid: String(task.vmid || ''),
        description: String(task.description || ''),
        vmstate: String(task.vmstate || '1'),
      });
    }
  } finally {
    formLoading.value = false;
  }
}

async function saveTask() {
  if (!form.snapname || !form.starttime || !form.vmid || !form.dow.length || form.keepnumber < 1)
    return;
  formSaving.value = true;
  const data = {
    autocreate: 1,
    snapname: form.snapname,
    starttime: form.starttime,
    keepnumber: form.keepnumber,
    enabled: form.enabled ? 1 : 0,
    dow: form.dow.join(','),
    vmid: form.vmid,
    description: form.description,
    vmstate: form.vmstate,
  };
  try {
    if (formAction.value === 'add') await createSnapshotTask(data);
    else await updateSnapshotTask(form.id, data);
    Notify.create({ type: 'positive', message: gettext('Snapshot task saved successfully') });
    formVisible.value = false;
    await reload();
  } finally {
    formSaving.value = false;
  }
}

function removeSelected() {
  const task = selectedTask.value;
  if (!task) return;
  Dialog.create({
    title: gettext('Delete'),
    message: gettext('Are you sure to delete [%s]?').replace(
      '%s',
      String(task.snapname || task.id),
    ),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      await removeSnapshotTask(task.id);
      Notify.create({ type: 'positive', message: gettext('Snapshot task deleted successfully') });
      await reload();
    })();
  });
}

onMounted(() => void reload());
</script>

<template>
  <div class="row column q-px-md q-py-sm">
    <q-table
      flat
      :rows="filteredTasks"
      :columns="columns"
      row-key="id"
      selection="single"
      v-model:selected="selectedTasks"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      :pagination="{ rowsPerPage: 20 }"
      table-header-class="u-table-header"
      @row-click="rowClick"
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
            @click="openForm('add')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Edit')"
            @click="openForm('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'negative' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Delete')"
            @click="removeSelected"
          />
          <q-btn flat round dense icon="refresh" :aria-label="gettext('Refresh')" @click="reload" />
        </div>
        <q-space />
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"
          ><template #append><q-icon name="search" /></template
        ></q-input>
      </template>
      <template #body-cell-enabled="props"
        ><q-td :props="props"
          ><q-badge
            :color="props.value === gettext('Enabled') ? 'green' : 'red'"
            :label="props.value" /></q-td
      ></template>
      <template #body-cell-description="props"
        ><q-td :props="props"
          ><div class="text-overflow" :title="String(props.value || '')">
            {{ props.value }}
          </div></q-td
        ></template
      >
    </q-table>
  </div>

  <q-dialog v-model="formVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="formTitle" width="580px" :loading="formLoading">
      <q-form class="snapshot-form u-dense u-border q-ma-sm q-pa-md" @submit="saveTask">
        <q-inner-loading :showing="formLoading" />
        <div class="row q-col-gutter-lg">
          <div class="col-12 col-sm-6">
            <q-input
              v-model="form.snapname"
              dense
              class="q-field--with-bottom"
              :label="`${gettext('Name')} *`"
              :rules="[(value) => !!value || gettext('This field is required')]"
            />
            <q-input
              v-model="form.starttime"
              dense
              class="q-field--with-bottom"
              :label="`${gettext('Start Time')} *`"
              :rules="[(value) => !!value || gettext('This field is required')]"
            />
            <q-input
              v-model.number="form.keepnumber"
              dense
              type="number"
              min="1"
              max="16"
              class="q-field--with-bottom"
              :label="gettext('Keep Max Number')"
              :rules="[(value) => Number(value) > 0 || gettext('This field is required')]"
            />
            <q-checkbox
              v-model="form.enabled"
              dense
              right-label
              color="primary"
              :label="gettext('Enable')"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-select
              v-model="form.dow"
              dense
              options-dense
              multiple
              emit-value
              map-options
              class="q-field--with-bottom"
              :label="`${gettext('Dow')} *`"
              :options="dayOptions"
              :rules="[(value) => value.length > 0 || gettext('This field is required')]"
            />
            <q-select
              v-model="form.vmid"
              dense
              options-dense
              emit-value
              map-options
              option-value="vmid"
              :option-label="(item) => `${item.vmid} (${item.name || item.node || ''})`"
              class="q-field--with-bottom"
              :label="`${gettext('VMID')} *`"
              :options="vmOptions"
              :rules="[(value) => !!value || gettext('This field is required')]"
            />
            <q-input v-model="form.description" dense :label="gettext('Description')" />
          </div>
        </div>
      </q-form>
      <template #foot>
        <q-btn v-close-popup no-caps flat size="12px" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="
            formSaving ||
            !form.snapname ||
            !form.starttime ||
            !form.vmid ||
            !form.dow.length ||
            form.keepnumber < 1
          "
          :loading="formSaving"
          :label="gettext(formAction === 'add' ? 'Add' : 'Save')"
          @click="saveTask"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.snapshot-form :deep(.q-field__native),
.snapshot-form :deep(.q-field__input),
.snapshot-form :deep(.q-field__label) {
  font-size: 12px;
}
.snapshot-form :deep(.q-field--with-bottom) {
  padding-bottom: 15px;
}
.snapshot-form :deep(.q-field__bottom) {
  display: none;
}
.text-overflow {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
