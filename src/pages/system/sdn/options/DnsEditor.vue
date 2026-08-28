<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnDnsServer, saveSdnDns } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ dnsId?: string | undefined }>();
const emit = defineEmits<{ saved: [] }>();
const loading = shallowRef(false);
const showAdvanced = shallowRef(false);
const submitted = shallowRef(false);
const isCreate = computed(() => !props.dnsId);
const form = reactive({ dns: '', key: '', url: '', ttl: '', fingerprint: '' });
function reset(data: PveRecord = {}) {
  Object.assign(form, {
    dns: textValue(data.dns),
    key: textValue(data.key),
    url: textValue(data.url),
    ttl: textValue(data.ttl),
    fingerprint: textValue(data.fingerprint),
  });
}
watch(visible, async (open) => {
  if (!open) return;
  showAdvanced.value = false;
  submitted.value = false;
  loading.value = true;
  try {
    reset();
    if (props.dnsId) reset((await getSdnDnsServer(props.dnsId)).data || {});
  } finally {
    loading.value = false;
  }
});
const ttlValid = computed(
  () => !form.ttl || (Number.isInteger(Number(form.ttl)) && Number(form.ttl) >= 0)
);
const formValid = computed(() =>
  Boolean(
    (!isCreate.value || form.dns.trim()) && form.key.trim() && form.url.trim() && ttlValid.value
  )
);
function payload() {
  const data: PveRecord = { key: form.key.trim(), url: form.url.trim() };
  const deleted: string[] = [];
  if (isCreate.value) {
    data.dns = form.dns.trim();
    data.type = 'powerdns';
  }
  if (form.ttl) data.ttl = form.ttl;
  else if (!isCreate.value) deleted.push('ttl');
  if (form.fingerprint.trim()) data.fingerprint = form.fingerprint.trim();
  else if (!isCreate.value) deleted.push('fingerprint');
  if (deleted.length) data.delete = deleted;
  return data;
}
async function save() {
  submitted.value = true;
  if (!formValid.value) return;
  loading.value = true;
  try {
    await saveSdnDns(props.dnsId, payload());
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <q-dialog
    v-model="visible"
    persistent
  >
    <UWindow
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: PowerDNS`"
      width="600px"
      :loading="loading"
    >
      <div class="q-pa-sm u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-6">
              <q-input
                v-model="form.dns"
                dense
                class="q-field--with-bottom"
                :disable="!isCreate"
                maxlength="10"
                :label="isCreate ? 'ID *' : 'ID'"
                :error="submitted && isCreate && !form.dns.trim()"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-model="form.key"
                dense
                class="q-field--with-bottom"
                :label="`${gettext('API Key')} *`"
                :error="submitted && !form.key.trim()"
                :error-message="gettext('This field is required')"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.url"
                dense
                class="q-field--with-bottom"
                :label="`${gettext('URL')} *`"
                :error="submitted && !form.url.trim()"
                :error-message="gettext('This field is required')"
              />
            </div>
          </div>
          <div
            v-if="showAdvanced"
            class="row q-col-gutter-lg q-mt-md"
          >
            <div class="col-6">
              <q-input
                v-model="form.fingerprint"
                dense
                class="q-field--with-bottom"
                :label="gettext('Fingerprint')"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.ttl"
                dense
                type="number"
                min="0"
                class="q-field--with-bottom"
                label="TTL"
                :error="submitted && !ttlValid"
                :error-message="gettext('Invalid TTL')"
              />
            </div>
          </div>
        </div>
      </div>
      <template #foot>
        <q-checkbox
          v-model="showAdvanced"
          dense
          class="q-mr-auto"
          :label="gettext('Advanced')"
        />
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
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
