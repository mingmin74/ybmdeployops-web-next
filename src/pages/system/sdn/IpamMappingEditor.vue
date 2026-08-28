<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { createSdnIpamMapping, updateSdnIpamMapping } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

defineOptions({ name: 'CtIpamMappingEditor' });

type EditorMode = 'create' | 'edit';

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });

const props = defineProps<{
  mode: EditorMode;
  zone: string;
  vnet: string;
  mapping?: PveRecord;
}>();

const emit = defineEmits<{ saved: [] }>();

const isCreate = computed(() => props.mode === 'create');

const form = reactive<{
  zone: string;
  vnet: string;
  vmid: string;
  mac: string;
  ip: string;
}>({
  zone: '',
  vnet: '',
  vmid: '',
  mac: '',
  ip: '',
});

const macValid = computed(() => !!textValue(form.mac).trim());

const ipValid = computed(() => !!textValue(form.ip).trim());

const formValid = computed(() => {
  if (!textValue(form.zone) || !textValue(form.vnet)) return false;
  if (isCreate.value) {
    if (!macValid.value || !ipValid.value) return false;
  } else {
    if (!textValue(form.mac) || !ipValid.value) return false;
  }
  return true;
});

function reset(data: PveRecord = {}) {
  form.zone = textValue(data.zone || props.zone);
  form.vnet = textValue(data.vnet || props.vnet);
  form.vmid = textValue(data.vmid);
  form.mac = textValue(data.mac);
  form.ip = textValue(data.ip);
}

function cleanPayload(): PveRecord {
  const payload: PveRecord = {
    zone: form.zone,
    vnet: form.vnet,
    mac: textValue(form.mac).trim(),
    ip: textValue(form.ip).trim(),
  };
  if (!isCreate.value) {
    if (textValue(form.vmid)) payload.vmid = textValue(form.vmid).trim();
  }
  return payload;
}

watch(
  () => [visible.value, props.mode, props.zone, props.vnet, props.mapping],
  () => {
    if (visible.value) reset(props.mapping || {});
  },
);

async function save() {
  if (!formValid.value) return;
  loading.value = true;
  try {
    const payload = cleanPayload();
    const vnet = textValue(form.vnet);
    if (isCreate.value) {
      await createSdnIpamMapping(vnet, payload);
    } else {
      await updateSdnIpamMapping(vnet, payload);
    }
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow
      :title="`${isCreate ? gettext('Create') : gettext('Edit')}: ${gettext('DHCP Mapping')}`"
      width="420px"
      :loading="loading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-12">
              <q-input
                v-if="!isCreate"
                v-model="form.vmid"
                dense
                disable
                class="q-field--with-bottom"
                label="VMID"
              />
              <q-input
                v-model="form.mac"
                dense
                class="q-field--with-bottom"
                :disable="!isCreate"
                :label="`${gettext('MAC')} *`"
                :error="isCreate ? !macValid : !textValue(form.mac)"
                :error-message="
                  isCreate ? (!textValue(form.mac) ? gettext('This field is required') : '') : ''
                "
              />
              <q-input
                v-model="form.ip"
                dense
                class="q-field--with-bottom"
                :label="`${gettext('IP Address')} *`"
                :error="!ipValid"
                :error-message="!textValue(form.ip) ? gettext('This field is required') : ''"
              />
            </div>
          </div>
        </div>
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
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
