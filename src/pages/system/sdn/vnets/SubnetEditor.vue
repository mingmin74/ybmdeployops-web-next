<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { QTableColumn } from 'quasar';
import UWindow from '@/components/UWindow.vue';
import { getSdnVnetSubnet, saveSdnVnetSubnet } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

defineOptions({ name: 'CtSubnetEditor' });

interface DhcpRange {
  _key: number;
  'start-address': string;
  'end-address': string;
}

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });
const props = defineProps<{
  vnet: string;
  subnetId?: string | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();

const isCreate = computed(() => !props.subnetId);

const form = reactive<{
  cidr: string;
  gateway: string;
  snat: boolean;
  dnszoneprefix: string;
  digest: string;
}>({
  cidr: '',
  gateway: '',
  snat: false,
  dnszoneprefix: '',
  digest: '',
});

const dhcpRanges = ref<DhcpRange[]>([]);
const tabPanel = ref<string>('general');
let nextDhcpKey = 1;

const dhcpColumns: QTableColumn<DhcpRange>[] = [
  {
    name: 'start-address',
    required: true,
    label: gettext('Start Address'),
    align: 'left',
    field: (row) => row['start-address'],
    sortable: false,
  },
  {
    name: 'end-address',
    required: true,
    label: gettext('End Address'),
    align: 'left',
    field: (row) => row['end-address'],
    sortable: false,
  },
  {
    name: 'actions',
    label: '',
    align: 'center',
    field: () => '',
    sortable: false,
  },
];

const RE_IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const RE_IPV6 =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

function isValidIp(value: string): boolean {
  if (!value) return true;
  return RE_IPV4.test(value) || RE_IPV6.test(value);
}

const gatewayValid = computed(() => isValidIp(form.gateway));

const cidrValid = computed(() => {
  const value = textValue(form.cidr);
  if (!value) return false;
  const parts = value.split('/');
  if (parts.length !== 2) return false;
  const [ip, maskText] = parts as [string, string];
  const mask = Number(maskText);
  if (!Number.isInteger(mask)) return false;
  if (RE_IPV4.test(ip)) {
    return mask >= 0 && mask <= 32;
  }
  if (RE_IPV6.test(ip)) {
    return mask >= 0 && mask <= 128;
  }
  return false;
});

const dhcpRangesValid = computed(() => {
  for (const r of dhcpRanges.value) {
    const s = textValue(r['start-address']);
    const e = textValue(r['end-address']);
    if (!s || !e) return false;
    if (!isValidIp(s) || !isValidIp(e)) return false;
  }
  return true;
});

const formValid = computed(() => {
  if (!cidrValid.value) return false;
  if (!gatewayValid.value) return false;
  if (!dhcpRangesValid.value) return false;
  return true;
});

function parseDhcpRange(item: unknown): DhcpRange | null {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as PveRecord;
    return {
      _key: nextDhcpKey++,
      'start-address': textValue(record['start-address']),
      'end-address': textValue(record['end-address']),
    };
  }

  const source = textValue(item);
  if (!source) return null;

  const properties = source.split(',').reduce<Record<string, string>>((result, pair) => {
    const [key, ...rest] = pair.split('=');
    if (key) {
      result[key.trim()] = rest.join('=').trim();
    }
    return result;
  }, {});

  return {
    _key: nextDhcpKey++,
    'start-address': properties['start-address'] || '',
    'end-address': properties['end-address'] || '',
  };
}

function reset(data: PveRecord = {}) {
  form.cidr = textValue(data.cidr) || textValue(data.subnet);
  form.gateway = textValue(data.gateway);
  form.snat = textValue(data.snat) === '1';
  form.dnszoneprefix = textValue(data.dnszoneprefix);
  form.digest = textValue(data.digest);

  const rawRanges = data['dhcp-range'];
  dhcpRanges.value = Array.isArray(rawRanges)
    ? rawRanges.map(parseDhcpRange).filter((item): item is DhcpRange => item !== null)
    : [];
}

function addDhcpRange() {
  dhcpRanges.value = [
    ...dhcpRanges.value,
    {
      _key: nextDhcpKey++,
      'start-address': '',
      'end-address': '',
    },
  ];
}

function removeDhcpRange(key: number) {
  dhcpRanges.value = dhcpRanges.value.filter((range) => range._key !== key);
}

function cleanPayload(): PveRecord {
  const payload: PveRecord = {};
  if (!isCreate.value && form.digest) {
    payload.digest = form.digest;
  }
  const deleted: string[] = [];

  if (isCreate.value) {
    payload.type = 'subnet';
    payload.subnet = textValue(form.cidr).trim();
  }

  if (form.gateway) {
    payload.gateway = form.gateway;
  } else if (!isCreate.value) {
    deleted.push('gateway');
  }

  if (form.snat) {
    payload.snat = 1;
  } else if (!isCreate.value) {
    deleted.push('snat');
  }

  if (form.dnszoneprefix) {
    payload.dnszoneprefix = form.dnszoneprefix;
  } else if (!isCreate.value) {
    deleted.push('dnszoneprefix');
  }

  if (dhcpRanges.value.length > 0) {
    payload['dhcp-range'] = dhcpRanges.value.map(
      (r) => `start-address=${r['start-address']},end-address=${r['end-address']}`
    );
  } else if (!isCreate.value) {
    deleted.push('dhcp-range');
  }

  if (deleted.length) payload.delete = deleted;
  return payload;
}

async function load() {
  loading.value = true;
  try {
    tabPanel.value = 'general';
    reset();
    if (props.subnetId) {
      reset((await getSdnVnetSubnet(props.vnet, props.subnetId)).data || {});
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
    await saveSdnVnetSubnet(props.vnet, props.subnetId, cleanPayload());
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
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="`${isCreate ? gettext('Create') : gettext('Edit')}: Subnet`"
      width="640px"
      :loading="loading"
    >
      <div class="u-dense">
        <q-tabs
          v-model="tabPanel"
          dense
          align="left"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab
            name="general"
            :label="gettext('General')"
          />
          <q-tab
            name="dhcp"
            :label="gettext('DHCP Ranges')"
          />
        </q-tabs>
        <q-tab-panels
          v-model="tabPanel"
          animated
          transition-prev="jump-up"
          transition-next="jump-up"
        >
          <q-tab-panel
            name="general"
            class="q-pa-md"
          >
            <div class="u-border q-pa-sm">
              <div class="row q-col-gutter-lg">
                <div class="col-12">
                  <q-input
                    v-model="form.cidr"
                    dense
                    class="q-field--with-bottom"
                    :disable="!isCreate"
                    :label="isCreate ? `${gettext('Subnet (CIDR)')} *` : gettext('Subnet (CIDR)')"
                    placeholder="192.168.10.0/24"
                    :error="!cidrValid"
                    :error-message="gettext('Invalid CIDR notation (IPv4 /0-32 or IPv6 /0-128)')"
                  />
                  <q-input
                    v-model="form.gateway"
                    dense
                    class="q-field--with-bottom"
                    :label="gettext('Gateway')"
                    clearable
                    :error="!gatewayValid"
                    :error-message="gettext('Invalid IPv4 or IPv6 address')"
                  />
                  <q-checkbox
                    v-model="form.snat"
                    dense
                    right-label
                    color="primary"
                    :label="gettext('SNAT')"
                  />
                  <q-input
                    v-model="form.dnszoneprefix"
                    dense
                    class="q-field--with-bottom"
                    :label="gettext('DNS Zone Prefix')"
                    clearable
                  />
                </div>
              </div>
            </div>
          </q-tab-panel>
          <q-tab-panel
            name="dhcp"
            class="q-pa-md"
          >
            <div class="u-border q-pa-md">
              <q-table
                flat
                dense
                :rows="dhcpRanges"
                :columns="dhcpColumns"
                :pagination="{ page: 1, rowsPerPage: 0 }"
                hide-bottom
                row-key="_key"
                :no-data-label="gettext('No DHCP ranges configured.')"
              >
                <template #body-cell-start-address="scope">
                  <q-td :props="scope">
                    <q-input
                      v-model="scope.row['start-address']"
                      dense
                      placeholder="192.168.1.100"
                      :error="
                        !dhcpRangesValid &&
                        (!scope.row['start-address'] || !isValidIp(scope.row['start-address']))
                      "
                    />
                  </q-td>
                </template>
                <template #body-cell-end-address="scope">
                  <q-td :props="scope">
                    <q-input
                      v-model="scope.row['end-address']"
                      dense
                      placeholder="192.168.1.150"
                      :error="
                        !dhcpRangesValid &&
                        (!scope.row['end-address'] || !isValidIp(scope.row['end-address']))
                      "
                    />
                  </q-td>
                </template>
                <template #body-cell-actions="scope">
                  <q-td :props="scope">
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      color="negative"
                      icon="delete"
                      @click="removeDhcpRange(scope.row._key)"
                    />
                  </q-td>
                </template>
              </q-table>
              <div class="row q-mt-sm">
                <q-btn
                  no-caps
                  outline
                  size="12px"
                  color="primary"
                  class="u-button"
                  :label="gettext('Add DHCP Range')"
                  @click="addDhcpRange"
                />
              </div>
            </div>
          </q-tab-panel>
        </q-tab-panels>
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
