<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { gettext } from '@/locale';
import { getVmTaskHistory, type VmTask } from '@/api/vm';

const props = defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const loading = shallowRef(false);
const onlyErrors = shallowRef(false);
const filter = shallowRef('');
const selected = shallowRef<VmTask[]>([]);
const tasks = shallowRef<VmTask[]>([]);
const selectedTask = computed(() => selected.value[0]);
const filteredTasks = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return tasks.value;
  return tasks.value.filter((task) => [task.type, task.id, task.user, task.status, task.node].join(' ').toLowerCase().includes(keyword));
});
const columns = computed<QTableColumn<VmTask>[]>(() => [
  { name: 'starttime', label: gettext('Start Time'), field: (row) => formatTime(row.starttime), align: 'left', sortable: true },
  { name: 'endtime', label: gettext('End Time'), field: (row) => formatTime(row.endtime), align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'user', label: gettext('Username'), field: 'user', align: 'left', sortable: true },
  { name: 'description', label: gettext('Description'), field: taskDescription, align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
]);

function formatTime(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toLocaleString() : '-';
}

function taskDescription(row: VmTask) {
  return [row.type, row.id].filter(Boolean).join(' ') || '-';
}

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const response = await getVmTaskHistory(props.node, props.vmid, { errors: onlyErrors.value ? 1 : 0 });
    tasks.value = response.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function openTask(task = selectedTask.value) {
  if (!task?.upid) return;
  emit('task', props.node, task.upid, taskDescription(task));
}

watch(() => [props.node, props.vmid, onlyErrors.value], () => { void reload(); }, { immediate: true });
</script>

<template>
  <div class="vm-task-history-tab q-pa-md">
    <q-table v-model:selected="selected" flat bordered square dense row-key="upid" selection="single" :rows="filteredTasks" :columns="columns" :loading="loading" :pagination="{ rowsPerPage: 20 }" class="u-compact-table" @row-dblclick="(_, row) => openTask(row)">
      <template #top>
        <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('View')" :disable="!selectedTask" @click="openTask()" />
        <q-checkbox v-model="onlyErrors" dense color="negative" class="q-ml-md" :label="gettext('Only Errors')" />
        <q-space />
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input>
        <q-btn no-caps outline size="12px" color="primary" class="u-button q-ml-sm" icon="refresh" :label="gettext('Refresh')" :loading="loading" @click="reload" />
      </template>
      <template #body-cell-status="scope"><q-td :props="scope"><span :class="scope.value === 'OK' ? 'text-positive' : 'text-negative'">{{ scope.value || '-' }}</span></q-td></template>
    </q-table>
  </div>
</template>

<style scoped>
.u-compact-table :deep(tbody td) { height: 40px; font-size: 12px; }
</style>
