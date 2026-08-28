<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnPrefixLists, getSdnRouteMapEntry, saveSdnRouteMapEntry } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type ActionItem = { key: string; value: string };

const MAX_U32 = 4294967295;
const RE_IPV4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const RE_IPV6 =
  /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const RE_SET_LOCAL_PREF = /^[+-]?\d+$/;
const RE_SET_TAG = /^(\d+|untagged)$/;
const RE_SET_METRIC = /^([+-]?\d+|[+-]?rtt|igp|aigp)$/;

const ipv4Rule = (v: string) => !v || RE_IPV4.test(v) || gettext('Invalid IPv4 address');
const ipv6Rule = (v: string) => !v || RE_IPV6.test(v) || gettext('Invalid IPv6 address');
const ipRule = (v: string) =>
  !v || RE_IPV4.test(v) || RE_IPV6.test(v) || gettext('Invalid IP address');
const regexRule = (re: RegExp, msg: string) => (v: string) => !v || re.test(v) || msg;

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{
  routeMapId?: string | undefined;
  order?: string | number | undefined;
  routeMapIds: string[];
}>();
const emit = defineEmits<{ saved: [] }>();
const loading = ref(false);
const prefixListsLoading = ref(false);
const prefixListOptions = ref<{ label: string; value: string }[]>([]);

const isCreate = computed(() => props.routeMapId === undefined || props.order === undefined);

const matchOptions = [
  ['route-type', gettext('Route Type')],
  ['vni', gettext('VNI')],
  ['ip-address-prefix-list', gettext('IPv4 (prefix-list)')],
  ['ip6-address-prefix-list', gettext('IPv6 (prefix-list)')],
  ['ip-next-hop-prefix-list', gettext('IPv4 next-hop (prefix-list)')],
  ['ip6-next-hop-prefix-list', gettext('IPv6 next-hop (prefix-list)')],
  ['ip-next-hop-address', gettext('IPv4 next-hop')],
  ['ip6-next-hop-address', gettext('IPv6 next-hop')],
  ['metric', gettext('Metric')],
  ['local-preference', gettext('Local Preference')],
  ['peer', gettext('Peer')],
  ['tag', gettext('Tag')],
].map(([value, label]) => ({ value, label }));

const setOptions = [
  ['ip-next-hop', gettext('IPv4 next-hop')],
  ['ip-next-hop-peer-address', gettext('IPv4 next-hop to peer address')],
  ['ip-next-hop-unchanged', gettext('IPv4 next-hop unchanged')],
  ['ip6-next-hop', gettext('IPv6 next-hop')],
  ['ip6-next-hop-peer-address', gettext('IPv6 next-hop to peer address')],
  ['ip6-next-hop-prefer-global', gettext('IPv6 next-hop to global address')],
  ['local-preference', gettext('Local Preference')],
  ['tag', gettext('Tag')],
  ['weight', gettext('Weight')],
  ['metric', gettext('Metric')],
  ['src', gettext('Source')],
].map(([value, label]) => ({ value, label }));

const form = reactive({
  routeMapId: '',
  order: '',
  action: 'permit',
  match: [] as ActionItem[],
  set: [] as ActionItem[],
  call: '',
  exitAction: '__default__',
  exitOrder: '',
});

const routeMapOptions = computed(() =>
  [...new Set([...props.routeMapIds, form.routeMapId])].filter(Boolean),
);
const needsExitOrder = computed(
  () => form.exitAction === 'on-match-goto' || form.exitAction === 'continue',
);

type MatchValueConfig =
  | {
      kind: 'select';
      options: { label: string; value: string }[];
      optionsSource?: 'prefixLists' | 'static';
    }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'text'; rules?: ((v: string) => string | true)[] };

type SetValueConfig =
  | { kind: 'none' }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'text'; rules?: ((v: string) => string | true)[] };

function matchValueConfig(key: string): MatchValueConfig & { needsValue: boolean } {
  switch (key) {
    case 'route-type':
      return {
        kind: 'select',
        needsValue: true,
        optionsSource: 'static',
        options: [
          { label: gettext('Ethernet Auto-Discovery (Type 1)'), value: 'ead' },
          { label: gettext('MAC/IP Advertisement (Type 2)'), value: 'macip' },
          { label: gettext('Inclusive Multicast (Type 3)'), value: 'multicast' },
          { label: gettext('Ethernet Segment (Type 4)'), value: 'es' },
          { label: gettext('IP Prefix (Type 5)'), value: 'prefix' },
        ],
      };
    case 'vni':
      return { kind: 'number', needsValue: true, min: 1, max: 16777215 };
    case 'ip-address-prefix-list':
    case 'ip6-address-prefix-list':
    case 'ip-next-hop-prefix-list':
    case 'ip6-next-hop-prefix-list':
      return {
        kind: 'select',
        needsValue: true,
        optionsSource: 'prefixLists',
        options: prefixListOptions.value,
      };
    case 'ip-next-hop-address':
      return { kind: 'text', needsValue: true, rules: [ipv4Rule] };
    case 'ip6-next-hop-address':
      return { kind: 'text', needsValue: true, rules: [ipv6Rule] };
    case 'tag':
      return { kind: 'number', needsValue: true, min: 0, max: MAX_U32 };
    case 'metric':
    case 'local-preference':
      return { kind: 'number', needsValue: true, min: 1, max: MAX_U32 };
    case 'peer':
      return { kind: 'text', needsValue: true };
    default:
      return { kind: 'text', needsValue: key !== '' };
  }
}

function setValueConfig(key: string): SetValueConfig & { needsValue: boolean } {
  switch (key) {
    case 'ip-next-hop-peer-address':
    case 'ip-next-hop-unchanged':
    case 'ip6-next-hop-peer-address':
    case 'ip6-next-hop-prefer-global':
      return { kind: 'none', needsValue: false };
    case 'ip-next-hop':
      return { kind: 'text', needsValue: true, rules: [ipv4Rule] };
    case 'ip6-next-hop':
      return { kind: 'text', needsValue: true, rules: [ipv6Rule] };
    case 'src':
      return { kind: 'text', needsValue: true, rules: [ipRule] };
    case 'local-preference':
      return {
        kind: 'text',
        needsValue: true,
        rules: [
          regexRule(
            RE_SET_LOCAL_PREF,
            gettext('A number; prefix with + or - to add or subtract from the current value.'),
          ),
        ],
      };
    case 'tag':
      return {
        kind: 'text',
        needsValue: true,
        rules: [regexRule(RE_SET_TAG, gettext('A number, or the literal "untagged".'))],
      };
    case 'metric':
      return {
        kind: 'text',
        needsValue: true,
        rules: [
          regexRule(
            RE_SET_METRIC,
            gettext(
              'A number, "rtt", "igp" or "aigp"; numbers and rtt may be prefixed with + or -.',
            ),
          ),
        ],
      };
    case 'weight':
      return { kind: 'number', needsValue: true, min: 1, max: MAX_U32 };
    default:
      return { kind: 'text', needsValue: key !== '' };
  }
}

function parseAction(value: unknown): ActionItem {
  const source = textValue(value);
  const key = source.match(/(?:^|,)key=([^,]*)/)?.[1] || '';
  const actionValue = source.match(/(?:^|,)value=([^,]*)/)?.[1] || '';
  return { key, value: actionValue };
}
function printAction(item: ActionItem) {
  return item.value ? `key=${item.key},value=${item.value}` : `key=${item.key}`;
}
function reset(data: PveRecord = {}) {
  const pending = (data.pending as PveRecord) || {};
  const value = { ...data, ...pending };
  const exit = parseAction(value['exit-action']);
  Object.assign(form, {
    routeMapId: textValue(value['route-map-id']),
    order: textValue(value.order),
    action: textValue(value.action) || 'permit',
    match: Array.isArray(value.match) ? value.match.map(parseAction) : [],
    set: Array.isArray(value.set) ? value.set.map(parseAction) : [],
    call: textValue(value.call),
    exitAction: exit.key || '__default__',
    exitOrder: exit.value,
  });
}

async function loadPrefixLists() {
  prefixListsLoading.value = true;
  try {
    const res = await getSdnPrefixLists();
    const data = res.data || [];
    prefixListOptions.value = data
      .map((item) => {
        const pending = (item.pending as PveRecord) || {};
        const name = textValue(pending.id ?? item.id);
        return { label: name, value: name };
      })
      .filter((o) => o.value);
  } finally {
    prefixListsLoading.value = false;
  }
}

onMounted(() => void loadPrefixLists());

watch(visible, async (open) => {
  if (!open) return;
  reset();
  void loadPrefixLists();
  if (!isCreate.value && props.routeMapId !== undefined && props.order !== undefined) {
    loading.value = true;
    try {
      reset((await getSdnRouteMapEntry(props.routeMapId, props.order)).data || {});
    } finally {
      loading.value = false;
    }
  }
});

function add(kind: 'match' | 'set') {
  form[kind].push({ key: '', value: '' });
}
function remove(kind: 'match' | 'set', index: number) {
  form[kind].splice(index, 1);
}

function cleanPayload() {
  const data: PveRecord = {
    'route-map-id': form.routeMapId.trim(),
    order: Number(form.order),
    action: form.action,
  };
  const deleted: string[] = [];
  (['match', 'set'] as const).forEach((field) => {
    const actions = form[field].filter((item) => item.key);
    if (actions.length) data[field] = actions.map(printAction);
    else if (!isCreate.value) deleted.push(field);
  });
  if (form.call.trim()) data.call = form.call.trim();
  else if (!isCreate.value) deleted.push('call');
  if (form.exitAction !== '__default__')
    data['exit-action'] = printAction({
      key: form.exitAction,
      value: needsExitOrder.value ? form.exitOrder : '',
    });
  else if (!isCreate.value) deleted.push('exit-action');
  if (deleted.length) data.delete = deleted;
  return data;
}

function validateActions(kind: 'match' | 'set'): boolean {
  return form[kind].every((item) => {
    if (!item.key) return true;
    const cfg = kind === 'match' ? matchValueConfig(item.key) : setValueConfig(item.key);
    if (!cfg.needsValue) return true;
    if (!item.value) return false;
    if (cfg.kind === 'text' && cfg.rules) {
      return cfg.rules.every((r) => r(item.value) === true);
    }
    if (cfg.kind === 'number') {
      const n = Number(item.value);
      return !Number.isNaN(n) && n >= cfg.min && n <= cfg.max;
    }
    return true;
  });
}

async function save() {
  if (!form.routeMapId.trim()) return;
  if (!form.order || Number(form.order) < 1 || Number(form.order) > 65535) return;
  if (
    needsExitOrder.value &&
    (!form.exitOrder || Number(form.exitOrder) < 1 || Number(form.exitOrder) > 65535)
  )
    return;
  if (!validateActions('match') || !validateActions('set')) return;
  loading.value = true;
  try {
    await saveSdnRouteMapEntry(props.routeMapId, props.order, cleanPayload());
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <q-dialog v-model="visible" persistent
    ><UWindow
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${gettext('Route Map Entry')}`"
      width="820px"
      :loading="loading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <div class="row q-col-gutter-lg">
            <div class="col">
              <q-select
                v-model="form.routeMapId"
                dense
                use-input
                new-value-mode="add-unique"
                :options="routeMapOptions"
                :disable="!isCreate"
                options-dense
                class="q-field--with-bottom"
                :label="isCreate ? `${gettext('Route Map ID')} *` : gettext('Route Map ID')"
                :error="!form.routeMapId"
                :error-message="gettext('This field is required')"
              />
              <q-input
                v-model="form.order"
                dense
                type="number"
                min="1"
                max="65535"
                :disable="!isCreate"
                class="q-field--with-bottom"
                :label="isCreate ? `${gettext('Order')} *` : gettext('Order')"
                :error="!form.order || Number(form.order) < 1 || Number(form.order) > 65535"
                :error-message="gettext('Value must be 1-65535')"
              />
              <q-select
                v-model="form.action"
                dense
                emit-value
                map-options
                options-dense
                class="q-field--with-bottom"
                :options="[
                  { label: gettext('Permit'), value: 'permit' },
                  { label: gettext('Deny'), value: 'deny' },
                ]"
                :label="gettext('Action')"
              />
            </div>
            <div class="col">
              <q-select
                v-model="form.call"
                dense
                clearable
                emit-value
                map-options
                options-dense
                class="q-field--with-bottom"
                :options="routeMapOptions"
                :label="gettext('Call')"
              />
              <q-select
                v-model="form.exitAction"
                dense
                emit-value
                map-options
                options-dense
                class="q-field--with-bottom"
                :options="[
                  { label: `${gettext('Default')} (exit)`, value: '__default__' },
                  { label: gettext('On match next'), value: 'on-match-next' },
                  { label: gettext('On match goto'), value: 'on-match-goto' },
                  { label: gettext('Continue'), value: 'continue' },
                ]"
                :label="gettext('Exit Policy')"
              />
              <q-input
                v-if="needsExitOrder"
                v-model="form.exitOrder"
                dense
                type="number"
                min="1"
                max="65535"
                class="q-field--with-bottom"
                :label="`${gettext('Target order')} *`"
                :error="!form.exitOrder || Number(form.exitOrder) < 1 || Number(form.exitOrder) > 65535"
                :error-message="gettext('Value must be 1-65535')"
              />
            </div>
          </div>
          <div v-for="kind in ['match', 'set'] as const" :key="kind" class="q-mt-md">
            <div class="text-subtitle2 q-mb-sm">
              {{ gettext(kind === 'match' ? 'Match' : 'Set') }}
            </div>
            <q-markup-table flat bordered dense>
              <thead>
                <tr>
                  <th class="text-left" style="width: 40%">{{ gettext('Property') }}</th>
                  <th class="text-left">{{ gettext('Value') }}</th>
                  <th class="route-map-actions" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in form[kind]" :key="`${kind}-${index}`">
                  <td>
                    <q-select
                      v-model="item.key"
                      dense
                      options-dense
                      emit-value
                      map-options
                      :options="kind === 'match' ? matchOptions : setOptions"
                      @update:model-value="item.value = ''"
                    />
                  </td>
                  <td>
                    <template v-if="kind === 'match'">
                      <template
                        v-if="
                          matchValueConfig(item.key).kind === 'select' &&
                          matchValueConfig(item.key).needsValue
                        "
                      >
                        <q-select
                          v-model="item.value"
                          dense
                          options-dense
                          emit-value
                          map-options
                          clearable
                          :loading="
                            (matchValueConfig(item.key) as Extract<MatchValueConfig, { kind: 'select' }>).optionsSource === 'prefixLists' &&
                            prefixListsLoading
                          "
                          :options="
                            (matchValueConfig(item.key) as Extract<MatchValueConfig, { kind: 'select' }>).optionsSource === 'prefixLists'
                              ? prefixListOptions
                              : (
                                  matchValueConfig(item.key) as Extract<
                                    ReturnType<typeof matchValueConfig>,
                                    { kind: 'select' }
                                  >
                                ).options
                          "
                        />
                      </template>
                      <q-input
                        v-else-if="
                          matchValueConfig(item.key).kind === 'number' &&
                          matchValueConfig(item.key).needsValue
                        "
                        v-model="item.value"
                        dense
                        type="number"
                        :min="
                          (
                            matchValueConfig(item.key) as Extract<
                              ReturnType<typeof matchValueConfig>,
                              { kind: 'number' }
                            >
                          ).min
                        "
                        :max="
                          (
                            matchValueConfig(item.key) as Extract<
                              ReturnType<typeof matchValueConfig>,
                              { kind: 'number' }
                            >
                          ).max
                        "
                      />
                      <q-input
                        v-else-if="
                          matchValueConfig(item.key).kind === 'text' &&
                          matchValueConfig(item.key).needsValue
                        "
                        v-model="item.value"
                        dense
                        type="text"
                        :rules="
                          (
                            matchValueConfig(item.key) as Extract<
                              ReturnType<typeof matchValueConfig>,
                              { kind: 'text' }
                            >
                          ).rules
                        "
                        lazy-rules
                      />
                    </template>
                    <template v-else>
                      <q-input
                        v-if="
                          setValueConfig(item.key).kind === 'number' &&
                          setValueConfig(item.key).needsValue
                        "
                        v-model="item.value"
                        dense
                        type="number"
                        :min="
                          (
                            setValueConfig(item.key) as Extract<
                              ReturnType<typeof setValueConfig>,
                              { kind: 'number' }
                            >
                          ).min
                        "
                        :max="
                          (
                            setValueConfig(item.key) as Extract<
                              ReturnType<typeof setValueConfig>,
                              { kind: 'number' }
                            >
                          ).max
                        "
                      />
                      <q-input
                        v-else-if="
                          setValueConfig(item.key).kind === 'text' &&
                          setValueConfig(item.key).needsValue
                        "
                        v-model="item.value"
                        dense
                        type="text"
                        :rules="
                          (
                            setValueConfig(item.key) as Extract<
                              ReturnType<typeof setValueConfig>,
                              { kind: 'text' }
                            >
                          ).rules
                        "
                        lazy-rules
                      />
                    </template>
                  </td>
                  <td>
                    <q-btn
                      flat
                      dense
                      color="negative"
                      icon="delete"
                      :aria-label="gettext('Delete')"
                      @click="remove(kind, index)"
                    />
                  </td>
                </tr>
                <tr v-if="!form[kind].length">
                  <td colspan="3" class="text-grey-7">
                    {{
                      gettext(
                        kind === 'match'
                          ? 'No match actions configured.'
                          : 'No set actions configured.',
                      )
                    }}
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button q-mt-sm"
              :label="gettext('Add')"
              @click="add(kind)"
            />
          </div>
        </div>
      </div>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
      /></template> </UWindow
  ></q-dialog>
</template>
<style scoped>
.route-map-actions {
  width: 42px;
}
</style>
