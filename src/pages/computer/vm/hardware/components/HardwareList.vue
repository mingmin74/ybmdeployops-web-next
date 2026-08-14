<script setup lang="ts">
import { useVmHardwareContext } from '../context/vmHardwareContext';
import { hardwareIcon, hardwareMeta } from '../hardwareRegistry';
import type { HardwareRow } from '../types';

defineProps<{ rows: HardwareRow[] }>();
const emit = defineEmits<{ select: [row: HardwareRow] }>();
const { selectedDevice, hasPendingChange, pendingValue } = useVmHardwareContext();

function pendingKeysFor(row: HardwareRow) {
  return hardwareMeta[row.type]?.pendingKeys || [row.key];
}

function hasRowPendingChange(row: HardwareRow) {
  return pendingKeysFor(row).some(hasPendingChange);
}

function rowPendingValue(row: HardwareRow) {
  const key = pendingKeysFor(row).find(hasPendingChange);
  return key ? pendingValue(key) : '';
}
</script>

<template>
  <div class="u-border q-pa-sm hardware-scroll hardware-list-panel">
    <div
      v-for="row in rows"
      :key="row.key"
      class="cursor-pointer q-px-sm row hardware-list-row"
      :class="{ 'bg-blue-2': selectedDevice?.key === row.key }"
      @click="emit('select', row)"
    >
      <div class="col-4 text-grey-10 hardware-list-label">
        <q-icon
          :name="hardwareIcon(row.key, row.value)"
          size="16px"
          class="q-mr-xs hardware-list-icon"
        />
        {{ row.name }}:
      </div>
      <div class="col-8 text-grey-8 hardware-list-value">
        {{ row.value }}
        <div v-if="hasRowPendingChange(row)" class="text-red">{{ rowPendingValue(row) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hardware-scroll {
  flex: 1 1 auto;
  height: 100%;
  font-size: 13px;
  background: #fff;
}
.hardware-list-panel {
  border-right: 0;
}
.hardware-list-row {
  min-height: 30px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}
.hardware-list-label {
  align-self: flex-start;
  padding-top: 6px;
}
.hardware-list-icon {
  vertical-align: text-bottom;
}
.hardware-list-value {
  min-width: 0;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 18px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.hardware-list-row:last-child {
  border-bottom: 0;
}
.hardware-list-row:hover {
  background: #f4f8fc;
}
.hardware-list-row.bg-blue-2 {
  background: #e6f1fb !important;
}
.hardware-list-row.bg-blue-2 :deep(.text-grey-10),
.hardware-list-row.bg-blue-2 :deep(.text-grey-8) {
  color: #1f4f78 !important;
}
@media (prefers-reduced-motion: reduce) {
  .hardware-list-row {
    transition: none;
  }
}
</style>
