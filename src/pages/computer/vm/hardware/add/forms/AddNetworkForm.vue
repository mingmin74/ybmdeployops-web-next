<script setup lang="ts">
import { gettext } from '@/locale';

export interface AddNetworkFormModel { model: string; bridge: string; vlanTag: string; firewall: boolean; macaddr: string; rate: string; queues: string; mtu: string; linkDown: boolean }
const form = defineModel<AddNetworkFormModel>('form', { required: true });
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-6"><q-select v-model="form.model" dense square outlined :label="gettext('Model')" :options="['virtio', 'e1000', 'e1000e', 'rtl8139', 'vmxnet3']" /></div>
    <div class="col-6"><q-input v-model="form.bridge" dense square outlined :label="gettext('Bridge')" /></div>
    <div class="col-6"><q-input v-model="form.vlanTag" dense square outlined :label="gettext('VLAN Tag')" /></div>
    <div class="col-6"><q-input v-model="form.rate" dense square outlined :label="gettext('Rate limit (MB/s)')" /></div>
    <div class="col-6"><q-input v-model="form.queues" dense square outlined :label="gettext('Multiqueue')" /></div>
    <div class="col-6"><q-input v-model="form.macaddr" dense square outlined :label="gettext('MAC address')" /></div>
    <div class="col-12"><q-input v-model="form.mtu" dense square outlined :label="gettext('MTU')" /></div>
    <div class="col-12 q-gutter-sm"><q-checkbox v-model="form.firewall" :label="gettext('Firewall')" /><q-checkbox v-model="form.linkDown" :label="gettext('Disconnect')" /></div>
  </div>
</template>
