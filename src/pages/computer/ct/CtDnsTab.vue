<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

type DnsKey = 'hostname' | 'dns';

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const selectedKey = shallowRef<DnsKey>('hostname');
const loading = shallowRef(false);
const form = reactive({ hostname: '', searchdomain: '', nameserver: '' });
const canEdit = computed(() =>
  Boolean(
    (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Network'],
  ),
);
const rows = computed(() => [
  {
    key: 'hostname' as const,
    label: gettext('Hostname'),
    value: textValue(props.config.hostname) || `CT${props.vmid}`,
  },
  {
    key: 'dns' as const,
    label: gettext('DNS domain'),
    value: textValue(props.config.searchdomain) || gettext('use host settings'),
  },
  {
    key: 'dns' as const,
    label: gettext('DNS servers'),
    value: textValue(props.config.nameserver) || gettext('use host settings'),
  },
]);
const isDnsForm = computed(() => selectedKey.value === 'dns');

function loadForm() {
  form.hostname = textValue(props.config.hostname);
  form.searchdomain = textValue(props.config.searchdomain);
  form.nameserver = textValue(props.config.nameserver).replace(/[,;]/g, ' ').trim();
}

async function save() {
  if (!canEdit.value) return;
  const data: PveRecord = { digest: props.config.digest };
  if (isDnsForm.value) {
    data.searchdomain = form.searchdomain.trim() || undefined;
    data.nameserver =
      form.nameserver
        .trim()
        .split(/[ ,;]+/)
        .filter(Boolean)
        .join(' ') || undefined;
    const deleted = [
      !form.searchdomain.trim() ? 'searchdomain' : '',
      !form.nameserver.trim() ? 'nameserver' : '',
    ].filter(Boolean);
    if (deleted.length) data.delete = deleted.join(',');
  } else {
    data.hostname = form.hostname.trim() || `CT${props.vmid}`;
  }
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data, 'lxc');
    emit('updated');
  } finally {
    loading.value = false;
  }
}

watch(() => [props.config.digest, props.vmid], loadForm, { immediate: true });
</script>

<template>
  <div class="ct-dns-tab vm-config-legacy">
    <div class="row">
      <div class="col-7 dns-list-column">
        <div class="u-border q-pa-sm dns-list-panel">
          <div
            v-for="row in rows"
            :key="`${row.key}-${row.label}`"
            class="cursor-pointer q-px-sm row dns-list-row"
            :class="{ 'bg-blue-2': selectedKey === row.key }"
            @click="selectedKey = row.key"
          >
            <div class="col-4 text-grey-10 dns-list-label">{{ row.label }}:</div>
            <div class="col-8 text-grey-8 dns-list-value">{{ row.value }}</div>
          </div>
        </div>
      </div>
      <div class="col-5 dns-editor-column">
        <div class="u-border dns-editor">
          <div class="q-pa-sm dns-editor__content">
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">
                {{ isDnsForm ? gettext('DNS') : gettext('Hostname') }}
              </div>
            </div>
            <div v-if="isDnsForm" class="q-gutter-sm">
              <q-input
                v-model="form.searchdomain"
                dense
                :disable="!canEdit"
                :label="gettext('DNS domain')"
                :placeholder="gettext('use host settings')"
              />
              <q-input
                v-model="form.nameserver"
                dense
                :disable="!canEdit"
                :label="gettext('DNS servers')"
                :placeholder="gettext('use host settings')"
              />
            </div>
            <q-input
              v-else
              v-model="form.hostname"
              dense
              :disable="!canEdit"
              :label="gettext('Hostname')"
              :placeholder="`CT${vmid}`"
            />
          </div>
          <div class="dns-editor__footer row items-center justify-end">
            <q-btn
              no-caps
              size="12px"
              class="bg-primary text-grey-1 u-button"
              :disable="!canEdit"
              :loading="loading"
              :label="gettext('Save')"
              @click="save"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ct-dns-tab {
  padding: 8px;
  font-size: 13px;
}
.dns-list-column {
  display: flex;
  overflow: hidden;
  align-self: stretch;
}
.dns-editor-column {
  display: flex;
  background: #fff;
}
.dns-list-panel {
  flex: 1 1 auto;
  height: 100%;
  border-right: 0;
  background: #fff;
}
.dns-list-row {
  min-height: 36px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}
.dns-list-row:last-child {
  border-bottom: 0;
}
.dns-list-row:hover {
  background: #f4f8fc;
}
.dns-list-row.bg-blue-2 {
  background: #e6f1fb !important;
}
.dns-list-row.bg-blue-2 :deep(.text-grey-10),
.dns-list-row.bg-blue-2 :deep(.text-grey-8) {
  color: #1f4f78 !important;
}
.dns-list-label,
.dns-list-value {
  min-width: 0;
  padding-bottom: 6px;
  overflow-wrap: anywhere;
}
.dns-list-label { align-self: flex-start; padding-top: 6px; }
.dns-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 100%;
  background: #fff;
}
.dns-editor__content {
  flex: 1;
}
.dns-editor__footer {
  min-height: 52px;
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
.editor-titlebar {
  min-height: 38px;
  margin: -4px -4px 10px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #d7dce2;
}
.editor-title {
  font-weight: 600;
  color: #334155;
}
@media (prefers-reduced-motion: reduce) {
  .dns-list-row {
    transition: none;
  }
}
</style>
