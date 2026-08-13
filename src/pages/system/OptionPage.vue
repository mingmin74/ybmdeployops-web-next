<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import type { QForm } from 'quasar';
import { getClusterOptions, getLocalNetworks, updateClusterOptions } from '@/api/clusterOptions';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import CrsOptionEditor from './options/CrsOptionEditor.vue';
import U2fOptionEditor from './options/U2fOptionEditor.vue';
import WebAuthnOptionEditor from './options/WebAuthnOptionEditor.vue';
import TagStyleOptionEditor from './options/TagStyleOptionEditor.vue';
import UserTagAccessEditor from './options/UserTagAccessEditor.vue';
import RegisteredTagsEditor from './options/RegisteredTagsEditor.vue';
import LocationOptionEditor from './options/LocationOptionEditor.vue';
import { objectToText, textValue } from '@/utils/pveFormat';
import { parsePropertyString, printPropertyString } from '@/utils/pvePropertyString';

type OptionType =
  | 'keyboard'
  | 'http_proxy'
  | 'console'
  | 'email_from'
  | 'mac_prefix'
  | 'migration'
  | 'replication'
  | 'ha'
  | 'crs'
  | 'u2f'
  | 'webauthn'
  | 'bwlimit'
  | 'max_workers'
  | 'next-id'
  | 'consent-text'
  | 'tag-style'
  | 'user-tag-access'
  | 'registered-tags'
  | 'location';

const loading = ref(false);
const dialogLoading = ref(false);
const dirty = ref(false);
const activeType = ref<OptionType>('keyboard');
const showData = shallowRef<PveRecord>({});
const networks = shallowRef<PveRecord[]>([]);
const crsForm = ref<PveRecord>({});
const u2fForm = ref<PveRecord>({});
const webauthnForm = ref<PveRecord>({});
const tagStyleForm = ref<PveRecord>({});
const userTagAccessForm = ref<PveRecord>({});
const registeredTags = shallowRef<string[]>([]);
const locationForm = ref<PveRecord>({});
const editorFormRef = ref<QForm>();
let pollingTimer: ReturnType<typeof setInterval> | undefined;
let syncingForm = false;
const form = reactive({
  keyboard: '__default__',
  http_proxy: '',
  console: '__default__',
  email_from: '',
  mac_prefix: '',
  migration: '',
  replication: '',
  ha: '__default__',
  max_workers: '',
  nextIdLower: '',
  nextIdUpper: '',
  consentText: '',
  bwlimit: {
    default: '',
    restore: '',
    migration: '',
    clone: '',
    move: '',
  },
});

const keyboardOptions = [
  { label: gettext('Default'), value: '__default__' },
  { label: 'Danish', value: 'da' },
  { label: 'English (US)', value: 'en-us' },
  { label: 'English (UK)', value: 'en-gb' },
  { label: 'German', value: 'de' },
  { label: 'German (Swiss)', value: 'de-ch' },
  { label: 'French', value: 'fr' },
  { label: 'French (Belgium)', value: 'fr-be' },
  { label: 'French (Canada)', value: 'fr-ca' },
  { label: 'French (Swiss)', value: 'fr-ch' },
  { label: 'Finnish', value: 'fi' },
  { label: 'Hungarian', value: 'hu' },
  { label: 'Icelandic', value: 'is' },
  { label: 'Italian', value: 'it' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Lithuanian', value: 'lt' },
  { label: 'Macedonian', value: 'mk' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Norwegian', value: 'no' },
  { label: 'Polish', value: 'pl' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Portuguese (Brazil)', value: 'pt-br' },
  { label: 'Slovenian', value: 'sl' },
  { label: 'Spanish', value: 'es' },
  { label: 'Swedish', value: 'sv' },
  { label: 'Turkish', value: 'tr' },
];

const consoleOptions = [
  { label: `${gettext('Default')} (xterm.js)`, value: '__default__' },
  { label: 'SPICE (remote-viewer)', value: 'vv' },
  { label: 'HTML5 (noVNC)', value: 'html5' },
  { label: 'xterm.js', value: 'xtermjs' },
];

const haOptions = [
  { label: `${gettext('Default')} (conditional)`, value: '__default__' },
  { label: 'freeze', value: 'freeze' },
  { label: 'failover', value: 'failover' },
  { label: 'migrate', value: 'migrate' },
  { label: 'conditional', value: 'conditional' },
];

const networkOptions = computed(() =>
  networks.value
    .filter((item) => item.cidr)
    .map((item) => ({
      label: `${textValue(item.cidr)}${item.iface ? ` (${textValue(item.iface)})` : ''}`,
      value: textValue(item.cidr),
    })),
);

const networkModel = computed({
  get: () => (activeType.value === 'replication' ? form.replication : form.migration),
  set: (value: string | null) => {
    if (activeType.value === 'replication') form.replication = value || '';
    else form.migration = value || '';
  },
});

const bandwidthValid = computed(() =>
  Object.values(form.bwlimit).every((value) => !value || (Number.isFinite(Number(value)) && Number(value) > 0)),
);

const saveDisabled = computed(() => activeType.value === 'bwlimit' && !bandwidthValid.value);

const bandwidthLabels: Record<keyof typeof form.bwlimit, string> = {
  default: 'Default',
  restore: 'Backup Restore',
  migration: 'Migration',
  clone: 'Clone',
  move: 'Disk Move',
};

const rows = computed(
  () =>
    [
      { label: 'Keyboard Layout', type: 'keyboard', value: keyboardDisplay() },
      { label: 'HTTP proxy', type: 'http_proxy', value: showData.value.http_proxy || gettext('None') },
      { label: 'Console Viewer', type: 'console', value: consoleDisplay() },
      {
        label: 'Email from address',
        type: 'email_from',
        value: showData.value.email_from || 'root@$hostname',
      },
      {
        label: 'MAC address prefix',
        type: 'mac_prefix',
        value: showData.value.mac_prefix || 'BC:24:11',
      },
      {
        label: 'Migration Settings',
        type: 'migration',
        value: objectToText(showData.value.migration) || gettext('Default'),
      },
      {
        label: 'Replication Settings',
        type: 'replication',
        value: objectToText(showData.value.replication) || gettext('Default'),
      },
      {
        label: 'HA Settings',
        type: 'ha',
        value: objectToText(showData.value.ha) || gettext('Default'),
      },
      {
        label: 'Cluster Resource Scheduling',
        type: 'crs',
        value: objectToText(showData.value.crs) || gettext('Default'),
      },
      { label: 'U2F Settings', type: 'u2f', value: objectToText(showData.value.u2f) || gettext('None') },
      { label: 'WebAuthn Settings', type: 'webauthn', value: objectToText(showData.value.webauthn) || gettext('None') },
      { label: 'Tag Style Override', type: 'tag-style', value: objectToText(showData.value['tag-style']) || gettext('No Overrides') },
      { label: 'User Tag Access', type: 'user-tag-access', value: objectToText(showData.value['user-tag-access']) || `${gettext('Mode')}: free` },
      { label: 'Registered Tags', type: 'registered-tags', value: Array.isArray(showData.value['registered-tags']) ? showData.value['registered-tags'].join(', ') : gettext('No Registered Tags') },
      { label: 'Location', type: 'location', value: objectToText(showData.value.location) || gettext('None') },
      {
        label: 'Bandwidth Limits',
        type: 'bwlimit',
        value: formatBwlimit(showData.value.bwlimit) || gettext('None'),
      },
      {
        label: 'Maximal Workers/bulk-action',
        type: 'max_workers',
        value: showData.value.max_workers || 4,
      },
      { label: 'Next Free VMID Range', type: 'next-id', value: objectToText(showData.value['next-id']) || gettext('Default') },
      { label: 'Consent Text', type: 'consent-text', value: showData.value['consent-text'] || gettext('None') },
    ] as { label: string; type: OptionType; value: unknown }[],
);

function keyboardDisplay() {
  const keyboard = textValue(showData.value.keyboard, '__default__');
  const option = keyboardOptions.find((item) => item.value === keyboard);
  return option?.label || keyboard;
}

function consoleDisplay() {
  const consoleValue = textValue(showData.value.console, '__default__');
  return consoleOptions.find((item) => item.value === consoleValue)?.label || consoleValue;
}

function originalWebAuthnId() {
  return textValue((showData.value.webauthn as PveRecord | undefined)?.id);
}

function isValidHttpProxy(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidMacPrefix(value: string) {
  return /^[a-f0-9][02468ace](?::[a-f0-9]{2}){0,2}(?::[a-f0-9]?)?$/i.test(value);
}

function isValidIpCidr(value: string) {
  const [address, prefix] = value.split('/');
  if (!address || prefix === undefined || !/^\d+$/.test(prefix)) return false;
  const isV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) && address.split('.').every((part) => Number(part) <= 255);
  const v6Parts = address.split('::');
  const v6Segments = address.replace('::', ':').split(':').filter(Boolean);
  const isV6 =
    v6Parts.length <= 2 &&
    v6Segments.every((part) => /^[0-9a-f]{1,4}$/i.test(part)) &&
    (v6Parts.length === 2 ? v6Segments.length < 8 : v6Segments.length === 8);
  const limit = isV4 ? 32 : isV6 ? 128 : -1;
  return limit >= 0 && Number(prefix) >= 0 && Number(prefix) <= limit;
}

function addNetworkValue(value: string, done: (value?: string, mode?: 'add' | 'add-unique' | 'toggle') => void) {
  const cidr = value.trim();
  if (isValidIpCidr(cidr)) done(cidr, 'add-unique');
}

function formatBwlimit(value: unknown) {
  return textValue(value)
    .split(',')
    .filter(Boolean)
    .map((item) => {
      const [key, raw] = item.split('=');
      const mib = Number(raw) / 1024;
      return `${bandwidthLabels[key as keyof typeof form.bwlimit] || key}=${Number.isFinite(mib) ? mib.toFixed(2) : raw}MiB/s`;
    })
    .join(',');
}

function buildCrsValue() {
  const source = crsForm.value;
  const canAuto = source.ha === 'static' || source.ha === 'dynamic';
  const data: PveRecord = {
    ha: source.ha || '__default__',
    'ha-rebalance-on-start': Number(source['ha-rebalance-on-start']) ? 1 : 0,
  };
  if (canAuto) {
    const auto = Number(source['ha-auto-rebalance']) ? 1 : 0;
    data['ha-auto-rebalance'] = auto;
    if (auto) {
      data['ha-auto-rebalance-threshold'] = source['ha-auto-rebalance-threshold'];
      data['ha-auto-rebalance-method'] = source['ha-auto-rebalance-method'] || '__default__';
      data['ha-auto-rebalance-hold-duration'] = source['ha-auto-rebalance-hold-duration'];
      data['ha-auto-rebalance-margin'] = source['ha-auto-rebalance-margin'];
    }
  }
  return printPropertyString(data);
}

function optionIcon(type: OptionType) {
  return {
    keyboard: 'keyboard',
    http_proxy: 'language',
    console: 'terminal',
    email_from: 'email',
    mac_prefix: 'memory',
    migration: 'compare_arrows',
    replication: 'sync',
    ha: 'account_tree',
    crs: 'schema',
    u2f: 'security',
    webauthn: 'fingerprint',
    'tag-style': 'label',
    'user-tag-access': 'sell',
    'registered-tags': 'local_offer',
    location: 'location_on',
    bwlimit: 'speed',
    max_workers: 'groups',
    'next-id': 'pin',
    'consent-text': 'article',
  }[type];
}

async function loadOptions(syncEditor = !dirty.value) {
  loading.value = true;
  try {
    const response = await getClusterOptions();
    showData.value = {
      ...(response.data || {}),
    };
    if (syncEditor) void openEdit(activeType.value);
  } finally {
    loading.value = false;
  }
}

async function openEdit(type: OptionType) {
  syncingForm = true;
  activeType.value = type;
  const data = showData.value;
  form.keyboard = textValue(data.keyboard, '__default__');
  form.http_proxy = textValue(data.http_proxy);
  form.console = textValue(data.console, '__default__');
  form.email_from = textValue(data.email_from);
  form.mac_prefix = textValue(data.mac_prefix);
  form.migration = textValue((data.migration as PveRecord | undefined)?.network);
  form.replication = textValue((data.replication as PveRecord | undefined)?.network);
  form.ha = textValue((data.ha as PveRecord | undefined)?.shutdown_policy, '__default__');
  crsForm.value = { ...((data.crs as PveRecord | undefined) || {}) };
  u2fForm.value = { ...((data.u2f as PveRecord | undefined) || {}) };
  webauthnForm.value = { ...((data.webauthn as PveRecord | undefined) || {}) };
  tagStyleForm.value = { ...((data['tag-style'] as PveRecord | undefined) || {}) };
  userTagAccessForm.value = { ...((data['user-tag-access'] as PveRecord | undefined) || {}) };
  registeredTags.value = Array.isArray(data['registered-tags']) ? data['registered-tags'].map((value) => textValue(value)) : [];
  locationForm.value = { ...((data.location as PveRecord | undefined) || {}) };
  form.max_workers = textValue(data.max_workers);
  const nextId = parsePropertyString(data['next-id']);
  form.nextIdLower = nextId.lower || '';
  form.nextIdUpper = nextId.upper || '';
  form.consentText = textValue(data['consent-text']);
  Object.keys(form.bwlimit).forEach((key) => {
    form.bwlimit[key as keyof typeof form.bwlimit] = '';
  });
  textValue(data.bwlimit)
    .split(',')
    .filter(Boolean)
    .forEach((item) => {
      const [key, raw] = item.split('=');
      if (key && key in form.bwlimit)
        form.bwlimit[key as keyof typeof form.bwlimit] = String(Number(raw) / 1024 || '');
    });
  if (type === 'migration' || type === 'replication') {
    dialogLoading.value = true;
    try {
      const response = await getLocalNetworks();
      networks.value = response.data || [];
    } finally {
      dialogLoading.value = false;
    }
  }
  await nextTick();
  syncingForm = false;
}

function buildSubmitData() {
  const data: Record<string, unknown> = {};
  const type = activeType.value;
  if (type === 'ha') {
    data.ha = `shutdown_policy=${form.ha}`;
  } else if (type === 'crs') {
    const value = buildCrsValue();
    data[value ? 'crs' : 'delete'] = value || 'crs';
  } else if (type === 'u2f') {
    const value = printPropertyString(u2fForm.value);
    data[value ? 'u2f' : 'delete'] = value || 'u2f';
  } else if (type === 'webauthn') {
    const value = printPropertyString(webauthnForm.value);
    data[value ? 'webauthn' : 'delete'] = value || 'webauthn';
  } else if (type === 'tag-style') {
    const value = printPropertyString({
      'color-map': tagStyleForm.value['color-map'],
      shape: tagStyleForm.value.shape === '__default__' ? '' : tagStyleForm.value.shape,
      ordering: tagStyleForm.value.ordering === '__default__' ? '' : tagStyleForm.value.ordering,
      'case-sensitive': Number(tagStyleForm.value['case-sensitive']) ? 1 : '',
    });
    data[value ? 'tag-style' : 'delete'] = value || 'tag-style';
  } else if (type === 'user-tag-access') {
    const value = printPropertyString({
      'user-allow': userTagAccessForm.value['user-allow'] === '__default__' ? '' : userTagAccessForm.value['user-allow'],
      'user-allow-list': userTagAccessForm.value['user-allow-list'],
    });
    data[value ? 'user-tag-access' : 'delete'] = value || 'user-tag-access';
  } else if (type === 'registered-tags') {
    data[registeredTags.value.length ? 'registered-tags' : 'delete'] = registeredTags.value.length ? registeredTags.value : 'registered-tags';
  } else if (type === 'location') {
    const value = printPropertyString(locationForm.value);
    data[value ? 'location' : 'delete'] = value || 'location';
  } else if (type === 'migration' || type === 'replication') {
    const network = type === 'migration' ? form.migration : form.replication;
    data[type] = printPropertyString({ network, type: 'secure' });
  } else if (type === 'bwlimit') {
    const values = Object.entries(form.bwlimit)
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `${key}=${Number(value) * 1024}`);
    data[values.length ? 'bwlimit' : 'delete'] = values.length ? values.join(',') : 'bwlimit';
  } else if (type === 'next-id') {
    const value = printPropertyString({ lower: form.nextIdLower, upper: form.nextIdUpper });
    data[value ? 'next-id' : 'delete'] = value || 'next-id';
  } else if (type === 'consent-text') {
    const value = form.consentText;
    data[value ? 'consent-text' : 'delete'] = value || 'consent-text';
  } else {
    const value = textValue(form[type as keyof typeof form]);
    const deleteEmpty = ['keyboard', 'http_proxy', 'console', 'email_from', 'mac_prefix', 'max_workers'].includes(type);
    data[deleteEmpty && (!value || value === '__default__') ? 'delete' : type] =
      deleteEmpty && (!value || value === '__default__') ? type : value;
  }
  return data;
}

async function saveOption() {
  if (saveDisabled.value) return;
  const valid = await editorFormRef.value?.validate();
  if (valid === false) return;
  dialogLoading.value = true;
  try {
    await updateClusterOptions(buildSubmitData());
    dirty.value = false;
    await loadOptions(true);
  } finally {
    dialogLoading.value = false;
  }
}

function selectOption(type: OptionType) {
  if (type === activeType.value) return;
  dirty.value = false;
  void openEdit(type);
}

watch([form, crsForm, u2fForm, webauthnForm, tagStyleForm, userTagAccessForm, registeredTags, locationForm], () => {
  if (!syncingForm) dirty.value = true;
}, { deep: true });

function startPolling() {
  if (!pollingTimer) pollingTimer = setInterval(() => void loadOptions(), 5000);
}

function stopPolling() {
  if (!pollingTimer) return;
  clearInterval(pollingTimer);
  pollingTimer = undefined;
}

onMounted(() => {
  void loadOptions(true);
  startPolling();
});
onActivated(startPolling);
onDeactivated(stopPolling);
onUnmounted(stopPolling);
</script>

<template>
  <div class="q-ma-md vm-config-legacy vm-options-tab option-page">
    <div class="row">
      <div class="col-7 options-list-column">
        <div class="u-border q-pa-sm options-scroll options-list-panel">
          <div
            v-for="row in rows"
            :key="row.type"
            class="cursor-pointer q-px-sm row options-list-row"
            :class="{ 'bg-blue-2 text-grey-1': activeType === row.type }"
            @click="selectOption(row.type)"
          >
            <div class="col-4 text-grey-10 options-list-label">
              <q-icon :name="optionIcon(row.type)" size="16px" class="q-mr-xs options-list-icon" />
              {{ gettext(row.label) }}:
            </div>
            <div class="col-8 text-grey-8 options-list-value">{{ row.value }}</div>
          </div>
        </div>
      </div>
      <div class="col-5 options-editor-column">
        <div class="u-border u-hidden-error options-scroll options-editor">
          <q-form ref="editorFormRef" class="q-pa-sm" @submit.prevent="saveOption">
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">
                {{ gettext(rows.find((row) => row.type === activeType)?.label || '') }}
              </div>
              <q-space />
              <q-btn
                no-caps
                flat
                size="12px"
                class="bg-primary text-grey-1 u-button"
                :label="gettext('Save')"
                :loading="dialogLoading"
                :disable="saveDisabled"
                type="submit"
              />
            </div>
            <div class="row q-col-gutter-lg">
              <div class="col-12">
          <q-select
            v-if="activeType === 'keyboard'"
            v-model="form.keyboard"
            dense
            emit-value
            map-options
            options-dense
            :options="keyboardOptions"
            :label="gettext('Keyboard Layout')"
          />
          <q-input
            v-else-if="activeType === 'http_proxy'"
            v-model="form.http_proxy"
            dense
            type="url"
            :label="gettext('HTTP proxy')"
            :rules="[(value) => isValidHttpProxy(value) || gettext('Invalid HTTP proxy')]"
          />
          <q-select
            v-else-if="activeType === 'console'"
            v-model="form.console"
            dense
            emit-value
            map-options
            options-dense
            :options="consoleOptions"
            :label="gettext('Console Viewer')"
          />
          <q-input
            v-else-if="activeType === 'email_from'"
            v-model="form.email_from"
            dense
            :label="gettext('Email from address')"
            :rules="[(value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || gettext('Invalid email address')]"
          />
          <q-input
            v-else-if="activeType === 'mac_prefix'"
            v-model="form.mac_prefix"
            dense
            :label="gettext('MAC address prefix')"
            :rules="[(value) => !value || isValidMacPrefix(value) || gettext('Invalid MAC address prefix')]"
          />
          <q-select
            v-else-if="activeType === 'migration' || activeType === 'replication'"
            v-model="networkModel"
            dense
            emit-value
            map-options
            options-dense
            clearable
            use-input
            fill-input
            hide-selected
            @new-value="addNetworkValue"
            :options="networkOptions"
            :label="gettext('Network')"
            :rules="[(value) => !value || isValidIpCidr(value) || gettext('Invalid CIDR address')]"
          />
          <q-select
            v-else-if="activeType === 'ha'"
            v-model="form.ha"
            dense
            emit-value
            map-options
            options-dense
            :options="haOptions"
            :label="gettext('Shutdown Policy')"
          />
          <CrsOptionEditor
            v-else-if="activeType === 'crs'"
            v-model="crsForm"
          />
          <U2fOptionEditor
            v-else-if="activeType === 'u2f'"
            v-model="u2fForm"
          />
          <WebAuthnOptionEditor
            v-else-if="activeType === 'webauthn'"
            v-model="webauthnForm"
            :original-id="originalWebAuthnId()"
          />
          <TagStyleOptionEditor
            v-else-if="activeType === 'tag-style'"
            v-model="tagStyleForm"
          />
          <UserTagAccessEditor
            v-else-if="activeType === 'user-tag-access'"
            v-model="userTagAccessForm"
            :registered-tags="showData['registered-tags']"
          />
          <RegisteredTagsEditor
            v-else-if="activeType === 'registered-tags'"
            v-model="registeredTags"
            :user-tag-access="showData['user-tag-access']"
          />
          <LocationOptionEditor
            v-else-if="activeType === 'location'"
            v-model="locationForm"
          />
          <div v-else-if="activeType === 'bwlimit'" class="column q-gutter-sm">
            <q-input
              v-for="(_, key) in form.bwlimit"
              :key="key"
              v-model="form.bwlimit[key]"
              dense
              type="number"
              suffix="MiB/s"
              :label="gettext(bandwidthLabels[key])"
              :rules="[(value) => !value || (Number.isFinite(Number(value)) && Number(value) > 0) || gettext('Invalid bandwidth limit')]"
            />
          </div>
          <div v-else-if="activeType === 'next-id'" class="column q-gutter-sm">
            <q-input
              v-model="form.nextIdLower"
              dense
              type="number"
              min="100"
              max="999999999"
              :label="gettext('Lower')"
              :rules="[(value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 999999999) || gettext('Invalid VMID range')]"
            />
            <q-input
              v-model="form.nextIdUpper"
              dense
              type="number"
              min="100"
              max="999999999"
              :label="gettext('Upper')"
              :rules="[(value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 999999999) || gettext('Invalid VMID range')]"
            />
          </div>
          <q-input
            v-else-if="activeType === 'consent-text'"
            v-model="form.consentText"
            dense
            type="textarea"
            maxlength="65536"
            :label="gettext('Consent Text')"
          />
          <q-input
            v-else
            v-model="form.max_workers"
            dense
            type="number"
            min="1"
            max="64"
            :label="gettext('Maximal Workers/bulk-action')"
            :rules="[(value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 64) || gettext('Value must be between 1 and 64')]"
          />
              </div>
            </div>
          </q-form>
        </div>
      </div>
    </div>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped lang="scss">
.options-scroll {
  font-size: 13px;
  background: #fff;
}

.vm-config-legacy {
  padding: 8px;
  font-size: 13px;
}

.options-list-column {
  display: flex;
  overflow: hidden;
  align-self: stretch;
}

.options-editor-column {
  display: flex;
  overflow: hidden;
  background: #fff;
}

.options-list-panel {
  flex: 1 1 auto;
  height: 100%;
  border-right: 0;
}

.options-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 100%;
  border-left: 1px solid #d7dce2;
}

.options-list-row {
  min-height: 30px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}

.options-list-label {
  align-self: flex-start;
  padding-top: 6px;
}

.options-list-icon {
  vertical-align: text-bottom;
}

.options-list-value {
  min-width: 0;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 18px;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}

.options-list-row:last-child {
  border-bottom: 0;
}

.options-list-row:hover {
  background: #f4f8fc;
}

.options-list-row.bg-blue-2 {
  background: #e6f1fb !important;
}

.options-list-row.bg-blue-2 :deep(.text-grey-10),
.options-list-row.bg-blue-2 :deep(.text-grey-8) {
  color: #1f4f78 !important;
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
  .options-list-row {
    transition: none;
  }
}
</style>
