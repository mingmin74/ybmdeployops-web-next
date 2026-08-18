<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, shallowRef, watch } from 'vue';
import { getVmConfig, getVmPendingConfig, revertVmConfig, updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import { isIp64AddressWithSuffixList } from '@/utils/ipValidation';

type DnsKey = 'hostname' | 'searchdomain' | 'nameserver';

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const selectedKey = shallowRef<DnsKey>('hostname');
const loading = shallowRef(false);
const pendingRows = shallowRef<PveRecord[]>([]);
const pendingTimer = shallowRef<number>();
const form = reactive({ hostname: '', searchdomain: '', nameserver: '' });
/**
 * Config snapshot (with digest) locked while editing. The parent page refreshes
 * `props.config` every 10s; that must never overwrite an in-progress form, so
 * the form and the save request both use this snapshot.
 */
const configSnapshot = shallowRef<PveRecord>({ ...props.config });

const canEdit = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Network'])
);
const pendingByKey = computed<Record<string, PveRecord>>(() =>
  Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row]))
);

function hasPendingChange(key: string) {
  const pending = pendingByKey.value[key];
  if (!pending) return false;
  if (pending.delete) return true;
  const value = textValue(pending.pending);
  return value !== '' && value !== textValue(props.config[key]);
}

function pendingValue(key: string) {
  const pending = pendingByKey.value[key];
  if (!pending || !hasPendingChange(key)) return '';
  return pending.delete ? gettext('Deleted') : textValue(pending.pending);
}

const rows = computed(() => [
  {
    key: 'hostname' as const,
    label: gettext('Hostname'),
    value: textValue(props.config.hostname) || `CT${props.vmid}`,
    pending: pendingValue('hostname'),
  },
  {
    key: 'searchdomain' as const,
    label: gettext('DNS domain'),
    value: textValue(props.config.searchdomain) || gettext('use host settings'),
    pending: pendingValue('searchdomain'),
  },
  {
    key: 'nameserver' as const,
    label: gettext('DNS servers'),
    value: textValue(props.config.nameserver) || gettext('use host settings'),
    pending: pendingValue('nameserver'),
  },
]);
const isDnsForm = computed(() => selectedKey.value !== 'hostname');
const canRevert = computed(() => Boolean(selectedKey.value && hasPendingChange(selectedKey.value)));

// PVE DnsName VType (allowBlank -> empty hostname is valid, becomes CT{vmid})
const DNS_NAME_RE =
  /^(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\.)*(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?))$/;
const hostnameValid = computed(
  () => !form.hostname.trim() || DNS_NAME_RE.test(form.hostname.trim())
);
// PVE IP64AddressWithSuffixList (empty -> use host settings)
const nameserverValid = computed(() => isIp64AddressWithSuffixList(form.nameserver.trim()));
const formValid = computed(() => (isDnsForm.value ? nameserverValid.value : hostnameValid.value));

function loadForm() {
  form.hostname = textValue(configSnapshot.value.hostname);
  form.searchdomain = textValue(configSnapshot.value.searchdomain);
  form.nameserver = textValue(configSnapshot.value.nameserver).replace(/[,;]/g, ' ').trim();
}

/** Re-lock the snapshot to the current config and re-sync the form. */
async function refreshForm() {
  try {
    const response = await getVmConfig(props.node, props.vmid, 'lxc');
    configSnapshot.value = response.data || { ...props.config };
  } catch {
    configSnapshot.value = { ...props.config };
  }
  loadForm();
}

async function loadPending() {
  try {
    const response = await getVmPendingConfig(props.node, props.vmid, 'lxc');
    pendingRows.value = response.data || [];
  } catch {
    // the global Notify already surfaced the error; keep the previous pending state
  }
}

function normalizedNameservers() {
  return form.nameserver
    .trim()
    .split(/[ ,;]+/)
    .filter(Boolean)
    .join(' ');
}

async function save() {
  if (!canEdit.value || !formValid.value) return;
  const data: PveRecord = { digest: textValue(configSnapshot.value.digest) };
  if (isDnsForm.value) {
    data.searchdomain = form.searchdomain.trim() || undefined;
    data.nameserver = normalizedNameservers() || undefined;
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
    await refreshForm();
    await loadPending();
    emit('updated');
  } catch {
    // the global Notify already surfaced the error; consume the rejection here
  } finally {
    loading.value = false;
  }
}

async function revertSelected() {
  if (!canRevert.value) return;
  loading.value = true;
  try {
    await revertVmConfig(props.node, props.vmid, [selectedKey.value], 'lxc');
    await refreshForm();
    await loadPending();
    emit('updated');
  } catch {
    // the global Notify already surfaced the error; consume the rejection here
  } finally {
    loading.value = false;
  }
}

// Opening a row is an explicit "edit" action: lock a fresh config snapshot and
// re-sync the form. The parent's periodic config refresh must not do that.
watch(selectedKey, () => void refreshForm());

loadForm();
void refreshForm();
void loadPending();

onMounted(() => {
  pendingTimer.value = window.setInterval(() => void loadPending(), 5_000);
});
onUnmounted(() => {
  if (pendingTimer.value) window.clearInterval(pendingTimer.value);
});
</script>

<template>
  <div class="ct-dns-tab vm-config-legacy">
    <div class="row">
      <div class="col-7 dns-list-column">
        <div class="u-border q-pa-sm dns-list-panel">
          <div
            v-for="row in rows"
            :key="row.key"
            class="cursor-pointer q-px-sm row dns-list-row"
            :class="{ 'bg-blue-2': selectedKey === row.key }"
            @click="selectedKey = row.key"
          >
            <div class="col-4 text-grey-10 dns-list-label">{{ row.label }}:</div>
            <div class="col-8 text-grey-8 dns-list-value">
              <div>{{ `${gettext('Current')}: ${row.value}` }}</div>
              <div
                v-if="row.pending"
                class="dns-list-pending"
              >
                {{ `${gettext('Pending')}: ${row.pending}` }}
              </div>
            </div>
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
            <div
              v-if="isDnsForm"
              class="q-gutter-sm"
            >
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
                :error="!nameserverValid"
                :error-message="`${gettext('Example')}: 192.168.1.1,192.168.1.2`"
              />
            </div>
            <q-input
              v-else
              v-model="form.hostname"
              dense
              :disable="!canEdit"
              :label="gettext('Hostname')"
              :placeholder="`CT${vmid}`"
              :error="!hostnameValid"
              :error-message="gettext('This is not a valid hostname')"
            />
          </div>
          <div class="dns-editor__footer row items-center justify-between">
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :disable="!canRevert"
              :loading="loading"
              :label="gettext('Revert')"
              @click="revertSelected"
            />
            <q-btn
              no-caps
              size="12px"
              class="bg-primary text-grey-1 u-button"
              :disable="!canEdit || !formValid"
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
.dns-list-label {
  align-self: flex-start;
  padding-top: 6px;
}
.dns-list-pending {
  color: #a06200;
}
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
