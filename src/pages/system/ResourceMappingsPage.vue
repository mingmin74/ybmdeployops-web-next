<script setup lang="ts">
import { shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import MappingTable from './mappings/MappingTable.vue';

const pciRows = shallowRef<PveRecord[]>([]);
const usbRows = shallowRef<PveRecord[]>([]);
</script>

<template>
  <div class="q-ma-md bg-white row q-col-gutter-md resource-mappings-page">
    <section class="col-12 col-lg-6">
      <div class="">
        <div class="mapping-title">{{ gettext('PCI Devices') }}</div>
        <MappingTable
          v-model:rows="pciRows"
          kind="pci"
          title="PCI mapping"
        />
      </div>
    </section>
    <section class="col-12 col-lg-6">
      <div class="">
        <div class="mapping-title">{{ gettext('USB Devices') }}</div>
        <MappingTable
          v-model:rows="usbRows"
          kind="usb"
          title="USB mapping"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.mapping-title {
  padding: 4px 8px 8px;
  color: #334155;
  font-size: 14px;
  font-weight: 600;
}
</style>
