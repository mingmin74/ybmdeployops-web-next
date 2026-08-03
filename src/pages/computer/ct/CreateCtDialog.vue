<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { getNodes, type PveNode } from '@/api/resources';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { createCt, getCtNextId } from '@/api/vm';
import type { PveRecord } from '@/api/resources';

const model = defineModel<boolean>({ required: true });
const emit = defineEmits<{
  completed: [];
  task: [payload: { node: string; upid: string; title: string }];
}>();

const loading = ref(false);
const nodes = ref<PveNode[]>([]);
const selectedNode = ref('');
const vmid = ref('');
const hostname = ref('');
const templateStorage = ref('');
const templateOptions = ref<string[]>([]);
const selectedTemplate = ref('');
const memory = ref(512);
const cores = ref(1);
const password = ref('');
const storageOptions = ref<string[]>([]);
const validationError = ref('');

const hasTemplateStorage = computed(() => templateStorage.value !== '');
const canSubmit = computed(
  () =>
    !loading.value &&
    selectedNode.value !== '' &&
    vmid.value.trim() !== '' &&
    hostname.value.trim() !== '' &&
    selectedTemplate.value !== '' &&
    Number.isFinite(Number(memory.value)) &&
    Number(memory.value) >= 128 &&
    Number.isFinite(Number(cores.value)) &&
    Number(cores.value) >= 1,
);

async function loadNodes() {
  try {
    const response = await getNodes();
    nodes.value = response.data || [];
    if (!selectedNode.value && nodes.value.length) {
      selectedNode.value = nodes.value[0].node;
    }
  } catch {
    nodes.value = [];
  }
}

async function loadNextId() {
  if (!selectedNode.value) return;
  try {
    const response = await getCtNextId();
    if (response.data !== undefined && response.data !== null) {
      vmid.value = String(response.data);
    }
  } catch {
    // ignore
  }
}

async function loadStorageOptions() {
  if (!selectedNode.value) {
    storageOptions.value = [];
    templateStorage.value = '';
    return;
  }

  try {
    const response = await getNodeStorage(selectedNode.value, 'vztmpl');
    storageOptions.value = (response.data || [])
      .map((item: PveRecord) => String(item.storage || ''))
      .filter((value) => value);
    templateStorage.value = storageOptions.value[0] || '';
  } catch {
    storageOptions.value = [];
    templateStorage.value = '';
  }
}

async function loadTemplates() {
  if (!selectedNode.value || !templateStorage.value) {
    templateOptions.value = [];
    selectedTemplate.value = '';
    return;
  }

  try {
    const response = await getStorageContent(selectedNode.value, templateStorage.value, 'vztmpl');
    templateOptions.value = (response.data || [])
      .map((item: PveRecord) => String(item.volid || item.filename || ''))
      .filter((value) => value);
    selectedTemplate.value = templateOptions.value[0] || '';
  } catch {
    templateOptions.value = [];
    selectedTemplate.value = '';
  }
}

function resetForm() {
  selectedNode.value = nodes.value[0]?.node || '';
  vmid.value = '';
  hostname.value = '';
  templateStorage.value = '';
  templateOptions.value = [];
  selectedTemplate.value = '';
  memory.value = 512;
  cores.value = 1;
  password.value = '';
  validationError.value = '';
}

watch(selectedNode, async () => {
  await loadStorageOptions();
  await loadNextId();
});

watch(templateStorage, async () => {
  await loadTemplates();
});

watch(
  () => model.value,
  async (value) => {
    if (value) {
      await loadNodes();
      await loadNextId();
      await loadStorageOptions();
      await loadTemplates();
    } else {
      resetForm();
    }
  },
);

async function submit() {
  validationError.value = '';
  if (!canSubmit.value) {
    validationError.value = gettext('Please complete all required fields.');
    return;
  }

  loading.value = true;
  try {
    const payload: Record<string, unknown> = {
      vmid: vmid.value.trim(),
      hostname: hostname.value.trim(),
      ostemplate: selectedTemplate.value,
      memory: memory.value,
      cores: cores.value,
      net0: 'name=eth0,bridge=vmbr0',
    };

    if (password.value.trim()) {
      payload.password = password.value.trim();
    }

    const response = await createCt(selectedNode.value, payload);
    model.value = false;
    emit('completed');
    if (response.data) {
      emit('task', {
        node: selectedNode.value,
        upid: String(response.data),
        title: `${hostname.value.trim() || vmid.value}: ${gettext('Create')}`,
      });
    }
  } catch (error) {
    validationError.value = String(error instanceof Error ? error.message : gettext('Create failed.'));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="model" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Create CT Container')" width="720px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-form class="q-gutter-md">
          <q-select
            v-model="selectedNode"
            :options="nodes.map((node) => ({ label: node.node, value: node.node }))"
            dense
            outlined
            :label="gettext('Node')"
            hide-dropdown-icon
            emit-value
            map-options
          />
          <div class="row q-gutter-sm">
            <q-input v-model="vmid" dense outlined :label="gettext('VMID')" class="col" />
            <q-input v-model="hostname" dense outlined :label="gettext('Hostname')" class="col" />
          </div>
          <div class="row q-gutter-sm">
            <q-select
              v-model="templateStorage"
              :options="storageOptions.map((storage) => ({ label: storage, value: storage }))"
              dense
              outlined
              :label="gettext('Template Storage')"
              emit-value
              map-options
              class="col"
              :disable="storageOptions.length === 0"
            />
            <q-select
              v-model="selectedTemplate"
              :options="templateOptions.map((value) => ({ label: value, value }))"
              dense
              outlined
              :label="gettext('Template')"
              emit-value
              map-options
              class="col"
              :disable="templateOptions.length === 0"
            />
          </div>
          <div class="row q-gutter-sm">
            <q-input
              v-model.number="memory"
              dense
              outlined
              type="number"
              :label="gettext('Memory (MB)')"
              class="col"
              min="128"
            />
            <q-input
              v-model.number="cores"
              dense
              outlined
              type="number"
              :label="gettext('CPU Cores')"
              class="col"
              min="1"
            />
          </div>
          <q-input
            v-model="password"
            dense
            outlined
            type="password"
            :label="gettext('Root Password')"
            :hint="gettext('Optional, set only if needed')"
          />
          <div v-if="validationError" class="text-negative text-caption q-mt-sm">
            {{ validationError }}
          </div>
        </q-form>
      </div>
      <template #foot>
        <q-btn no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" v-close-popup :disable="loading" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button q-ml-sm"
          :disable="!canSubmit"
          :loading="loading"
          :label="gettext('Create')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.q-form {
  min-width: 100%;
}
</style>
