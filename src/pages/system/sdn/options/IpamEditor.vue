<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnIpam, saveSdnIpam } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

export type IpamType = 'netbox' | 'phpipam' | 'pve';
const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ type: IpamType; ipamId?: string | undefined }>();
const emit = defineEmits<{ saved: [] }>();
const loading = shallowRef(false);
const showAdvanced = shallowRef(false);
const submitted = shallowRef(false);
const isCreate = computed(() => !props.ipamId);
const typeLabel = computed(
  () => ({ netbox: 'Netbox', phpipam: 'PhpIpam', pve: 'PVE' }[props.type])
);
const form = reactive({ ipam: '', token: '', url: '', section: '', fingerprint: '' });
function reset(data: PveRecord = {}) {
  Object.assign(form, {
    ipam: textValue(data.ipam),
    token: textValue(data.token),
    url: textValue(data.url),
    section: textValue(data.section),
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
    if (props.ipamId) reset((await getSdnIpam(props.ipamId)).data || {});
  } finally {
    loading.value = false;
  }
});
const formValid = computed(
  () =>
    props.type === 'pve' ||
    Boolean(
      (!isCreate.value || form.ipam.trim()) &&
        form.token.trim() &&
        form.url.trim() &&
        (props.type !== 'phpipam' || form.section.trim())
    )
);
function payload() {
  const data: PveRecord = {};
  if (props.type === 'pve') return data;
  data.token = form.token.trim();
  data.url = form.url.trim();
  const deleted: string[] = [];
  if (isCreate.value) {
    data.ipam = form.ipam.trim();
    data.type = props.type;
  }
  if (props.type === 'phpipam') data.section = form.section.trim();
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
    await saveSdnIpam(props.ipamId, payload());
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
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${typeLabel}`"
      width="600px"
      :loading="loading"
    >
      <div class="q-pa-sm u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-6">
              <q-input
                v-model="form.ipam"
                dense
                class="q-field--with-bottom"
                :disable="!isCreate"
                maxlength="10"
                :label="isCreate ? 'ID *' : 'ID'"
                :error="submitted && isCreate && !form.ipam.trim()"
                :error-message="gettext('This field is required')"
              />
              <template v-if="type !== 'pve'">
                <q-input
                  v-model="form.token"
                  dense
                  class="q-field--with-bottom"
                  :label="`${gettext('Token')} *`"
                  :error="submitted && !form.token.trim()"
                  :error-message="gettext('This field is required')"
                />
              </template>
            </div>
            <div
              v-if="type !== 'pve'"
              class="col-6"
            >
              <q-input
                v-model="form.url"
                dense
                class="q-field--with-bottom"
                :label="`${gettext('URL')} *`"
                :error="submitted && !form.url.trim()"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-if="type === 'phpipam'"
                v-model="form.section"
                dense
                class="q-field--with-bottom"
                :label="`${gettext('Section')} *`"
                :error="submitted && !form.section.trim()"
                :error-message="gettext('This field is required')"
              />
            </div>
          </div>
          <div
            v-if="type !== 'pve' && showAdvanced"
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
          </div>
        </div>
      </div>
      <template #foot>
        <q-checkbox
          v-if="type !== 'pve'"
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
