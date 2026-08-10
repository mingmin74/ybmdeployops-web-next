<script setup lang="ts">
import { gettext } from '@/locale';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

defineOptions({ name: 'CtLimitsStep' });

const { form, state, errors } = useCreateCtWizardContext();
const { networkAdvanced } = state;
const { validationErrors } = errors;
const ipv4ModeOptions = [
  { label: gettext('Static'), value: 'static' },
  { label: 'DHCP', value: 'dhcp' },
];
const ipv6ModeOptions = [
  { label: gettext('Static'), value: 'static' },
  { label: 'DHCP', value: 'dhcp' },
  { label: 'SLAAC', value: 'auto' },
];
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <div class="col">
          <q-input
            v-model="form.netName"
            dense
            class="q-field--with-bottom"
            :error="Boolean(validationErrors.netName)"
            :error-message="validationErrors.netName"
            :label="gettext('Name')"
            placeholder="eth0"
          />
          <q-input
            v-model="form.netHwaddr"
            dense
            class="q-field--with-bottom"
            :error="Boolean(validationErrors.netHwaddr)"
            :error-message="validationErrors.netHwaddr"
            :label="gettext('MAC address')"
            :placeholder="gettext('auto')"
          />
          <q-input
            v-model="form.netBridge"
            dense
            class="q-field--with-bottom"
            :error="Boolean(validationErrors.netBridge)"
            :error-message="validationErrors.netBridge"
            :label="gettext('Bridge')"
          />
          <q-input
            v-model.number="form.netVlanTag"
            dense
            type="number"
            min="1"
            max="4094"
            class="q-field--with-bottom"
            :error="Boolean(validationErrors.netVlanTag)"
            :error-message="validationErrors.netVlanTag"
            :label="gettext('VLAN Tag')"
          />
          <q-checkbox
            v-model="form.netFirewall"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Firewall')"
          />
        </div>
        <div class="col">
          <q-option-group
            v-model="form.netIpv4Mode"
            inline
            dense
            type="radio"
            :options="ipv4ModeOptions"
            label="IPv4"
            class="q-field--with-bottom"
          />
          <q-input
            v-model="form.netIp"
            dense
            class="q-field--with-bottom"
            :disable="form.netIpv4Mode !== 'static'"
            :label="'IPv4/CIDR'"
            :placeholder="gettext('None')"
          />
          <q-input
            v-model="form.netGateway"
            dense
            class="q-field--with-bottom"
            :disable="form.netIpv4Mode !== 'static'"
            :label="`${gettext('Gateway')} (IPv4)`"
          />
          <q-separator class="q-my-sm" />
          <q-option-group
            v-model="form.netIpv6Mode"
            inline
            dense
            type="radio"
            :options="ipv6ModeOptions"
            label="IPv6"
            class="q-field--with-bottom"
          />
          <q-input
            v-model="form.netIp6"
            dense
            class="q-field--with-bottom"
            :disable="form.netIpv6Mode !== 'static'"
            :label="'IPv6/CIDR'"
            :placeholder="gettext('None')"
          />
          <q-input
            v-model="form.netGateway6"
            dense
            :disable="form.netIpv6Mode !== 'static'"
            :label="`${gettext('Gateway')} (IPv6)`"
          />
        </div>
      </div>
    </div>

    <div v-if="networkAdvanced" class="q-mt-sm u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <div class="col">
          <q-checkbox
            v-model="form.netDisconnect"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Disconnect')"
          />
          <q-input
            v-model.number="form.netMtu"
            dense
            type="number"
            min="576"
            max="65535"
            class="q-field--with-bottom"
            :error="Boolean(validationErrors.netMtu)"
            :error-message="validationErrors.netMtu"
            label="MTU"
            :placeholder="gettext('Same as bridge')"
          />
        </div>
        <div class="col">
          <q-input
            v-model.number="form.netRate"
            dense
            type="number"
            min="0"
            max="10240"
            class="q-field--with-bottom"
            :error="Boolean(validationErrors.netRate)"
            :error-message="validationErrors.netRate"
            :label="`${gettext('Rate limit')} (MB/s)`"
            :placeholder="gettext('unlimited')"
          />
          <q-checkbox
            v-model="form.netHostManaged"
            dense
            right-label
            color="primary"
            class="q-field--with-bottom"
            :label="gettext('Host-Managed')"
          />
        </div>
      </div>
    </div>
  </q-scroll-area>
</template>
