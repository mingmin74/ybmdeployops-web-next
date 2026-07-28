<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getNodeFirewallOptions, updateNodeFirewallOptions } from '@/api/firewall';
import { gettext } from '@/locale';
const { node } = defineProps<{ node: string }>();
const loading = shallowRef(false);
const options = ref<PveRecord>({});
const toggleOptions = [
  ['enable', 'Firewall'],
  ['nosmurfs', 'SMURFS filter'],
  ['tcpflags', 'TCP flags filter'],
  ['ndp', 'NDP'],
] as const;
const valueOptions = [
  ['nf_conntrack_max', 'nf_conntrack_max'],
  ['nf_conntrack_tcp_timeout_established', 'nf_conntrack_tcp_timeout_established'],
  ['log_level_in', 'Log Level In'],
  ['log_level_out', 'Log Level Out'],
  ['tcp_flags_log_level', 'tcp_flags_log_level'],
  ['smurf_log_level', 'smurf_log_level'],
] as const;
const logLevels = ['nolog', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
async function refreshData() {
  loading.value = true;
  try {
    options.value = (await getNodeFirewallOptions(node)).data || {};
  } finally {
    loading.value = false;
  }
}
async function save(key: string, value: unknown) {
  loading.value = true;
  try {
    await updateNodeFirewallOptions(node, { [key]: value, digest: options.value.digest });
    await refreshData();
  } finally {
    loading.value = false;
  }
}
onMounted(refreshData);
</script>
<template>
  <div class="q-ma-sm node-firewall-options">
    <q-markup-table flat separator="none" class="no-border-radius q-mt-sm"
      ><tbody>
        <tr v-for="[key, label] in toggleOptions" :key="key">
          <td>{{ gettext(label) }}</td>
          <td class="text-right">
            <q-toggle
              :model-value="Number(options[key])"
              :true-value="1"
              :false-value="0"
              color="primary"
              @update:model-value="save(key, $event)"
            />
          </td>
        </tr>
        <tr v-for="[key, label] in valueOptions" :key="key">
          <td>{{ gettext(label) }}</td>
          <td class="text-right text-primary cursor-pointer">
            <q-popup-edit
              :model-value="String(options[key] ?? '')"
              buttons
              :label-set="gettext('Save')"
              :label-cancel="gettext('Cancel')"
              @save="save(key, $event)"
              v-slot="scope"
              ><q-select
                v-if="key.includes('level')"
                v-model="scope.value"
                square
                outlined
                dense
                :options="logLevels" /><q-input
                v-else
                v-model="scope.value"
                square
                outlined
                dense
                type="number" /></q-popup-edit
            ><span>{{ options[key] || gettext('Default') }}</span>
          </td>
        </tr>
      </tbody></q-markup-table
    ><q-inner-loading :showing="loading" />
  </div>
</template>
