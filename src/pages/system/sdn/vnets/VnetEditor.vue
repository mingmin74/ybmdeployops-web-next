<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnVnet, getSdnZones, saveSdnVnet } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

defineOptions({ name: 'CtVnetEditor' });

type SdnZoneType = 'simple' | 'vlan' | 'qinq' | 'vxlan' | 'evpn' | 'faucet';

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });
const props = defineProps<{
  vnetId?: string | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();

const isCreate = computed(() => !props.vnetId);

const zoneOptions = shallowRef<{ label: string; value: string; type: SdnZoneType }[]>([]);

const form = reactive<{
  vnet: string;
  alias: string;
  zone: string;
  tag: string;
  'isolate-ports': boolean;
  vlanaware: boolean;
  digest: string;
}>({
  vnet: '',
  alias: '',
  zone: '',
  tag: '',
  'isolate-ports': false,
  vlanaware: false,
  digest: '',
});

const selectedZoneType = computed<SdnZoneType | undefined>(() => {
  const z = textValue(form.zone);
  if (!z) return undefined;
  const found = zoneOptions.value.find((o) => o.value === z);
  return found?.type;
});

const tagDisabled = computed(() => {
  const t = selectedZoneType.value;
  return !t || t === 'simple';
});

const tagRequired = computed(() => {
  const t = selectedZoneType.value;
  if (!t) return false;
  return t === 'vlan' || t === 'vxlan' || t === 'evpn';
});

const tagAllowBlank = computed(() => {
  const t = selectedZoneType.value;
  if (!t) return true;
  return t === 'qinq' || t === 'faucet' || t === 'simple';
});

const vlanAwareDisabled = computed(() => {
  const t = selectedZoneType.value;
  return !t || t === 'evpn';
});

const tagValid = computed(() => {
  if (tagDisabled.value) return true;
  const val = textValue(form.tag);
  if (!val) {
    if (tagAllowBlank.value || !tagRequired.value) return true;
    return false;
  }
  const v = Number(val);
  return Number.isInteger(v) && v >= 1 && v <= 16777216;
});

const formValid = computed(() => {
  if (isCreate.value && (!textValue(form.vnet).trim() || form.vnet.length > 8)) return false;
  if (!textValue(form.zone)) return false;
  if (!tagValid.value) return false;
  if (tagRequired.value && !textValue(form.tag)) return false;
  return true;
});

watch(
  () => selectedZoneType.value,
  (newType) => {
    if (newType === 'simple') {
      form.tag = '';
    }
    if (newType === 'evpn') {
      form.vlanaware = false;
    }
  },
);

function reset(data: PveRecord = {}) {
  form.vnet = textValue(data.vnet);
  form.alias = textValue(data.alias);
  form.zone = textValue(data.zone);
  form.tag = textValue(data.tag);
  form['isolate-ports'] = textValue(data['isolate-ports']) === '1';
  form.vlanaware = textValue(data.vlanaware) === '1';
  form.digest = textValue(data.digest);
}

async function loadOptions() {
  const zonesResp = await getSdnZones(false).catch(() => ({ data: [] as PveRecord[] }));
  zoneOptions.value = (zonesResp.data || [])
    .map((z) => ({
      label: textValue(z.zone),
      value: textValue(z.zone),
      type: textValue(z.type) as SdnZoneType,
    }))
    .filter((o) => o.value)
    .sort((a, b) => a.value.localeCompare(b.value));
}

function cleanPayload(): PveRecord {
  const payload: PveRecord = {};
  if (!isCreate.value && form.digest) {
    payload.digest = form.digest;
  }
  const deleted: string[] = [];

  if (isCreate.value) {
    payload.vnet = textValue(form.vnet).trim();
    payload.type = 'vnet';
  }

  if (form.alias) {
    payload.alias = form.alias;
  } else if (!isCreate.value) {
    deleted.push('alias');
  }

  if (form.zone) {
    payload.zone = form.zone;
  }

  if (!tagDisabled.value) {
    if (form.tag) {
      payload.tag = form.tag;
    } else if (!isCreate.value && !tagAllowBlank.value) {
      deleted.push('tag');
    } else if (!isCreate.value) {
      deleted.push('tag');
    }
  } else if (!isCreate.value) {
    deleted.push('tag');
  }

  if (form['isolate-ports']) {
    payload['isolate-ports'] = 1;
  } else if (!isCreate.value) {
    deleted.push('isolate-ports');
  }

  if (!vlanAwareDisabled.value) {
    if (form.vlanaware) {
      payload.vlanaware = 1;
    } else if (!isCreate.value) {
      deleted.push('vlanaware');
    }
  } else if (!isCreate.value) {
    deleted.push('vlanaware');
  }

  if (deleted.length) payload.delete = deleted;
  return payload;
}

async function load() {
  loading.value = true;
  try {
    reset();
    await loadOptions();
    if (props.vnetId) {
      reset((await getSdnVnet(props.vnetId)).data || {});
    }
  } finally {
    loading.value = false;
  }
}

watch(visible, (open) => {
  if (open) void load();
});

async function save() {
  if (!formValid.value) return;
  loading.value = true;
  try {
    await saveSdnVnet(props.vnetId, cleanPayload());
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
      :title="`${isCreate ? gettext('Create') : gettext('Edit')}: VNet`"
      width="480px"
      :loading="loading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col-6">
              <q-input
                v-model="form.vnet"
                dense
                class="q-field--with-bottom"
                :disable="!isCreate"
                :label="gettext('Name')"
                maxlength="8"
                :error="isCreate && (!textValue(form.vnet).trim() || form.vnet.length > 8)"
                :error-message="gettext('This field is required (max 8 characters)')"
              />
              <q-input
                v-model="form.alias"
                dense
                class="q-field--with-bottom"
                :label="gettext('Alias')"
                clearable
              />
              <q-select
                v-model="form.zone"
                dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('Zone')"
                :options="zoneOptions"
                :error="!textValue(form.zone)"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-model="form.tag"
                dense
                type="number"
                min="1"
                max="16777216"
                class="q-field--with-bottom"
                :label="gettext('Tag')"
                :disable="tagDisabled"
                :error="!tagValid || (tagRequired && !textValue(form.tag))"
                :error-message="
                  tagRequired && !textValue(form.tag)
                    ? gettext('This field is required')
                    : gettext('Value must be 1-16777216')
                "
              />
            </div>
          </div>
          <q-expansion-item dense :label="gettext('Advanced')">
            <div class="row q-col-gutter-lg">
              <div class="col-6">
                <q-checkbox
                  v-model="form['isolate-ports']"
                  dense
                  :label="gettext('Isolate Ports')"
                />
              </div>
              <div class="col-6">
                <q-checkbox
                  v-model="form.vlanaware"
                  dense
                  :disable="vlanAwareDisabled"
                  :label="gettext('VLAN Aware')"
                />
              </div>
            </div>
          </q-expansion-item>
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
          :disable="!formValid"
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
