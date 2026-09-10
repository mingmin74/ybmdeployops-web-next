<script setup lang="ts">
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/format';
import { textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  disk: PveRecord;
  loading?: boolean;
}>();
const emit = defineEmits<{ submit: [] }>();

function diskUsage(value: unknown) {
  return (
    (
      {
        bios: gettext('BIOS boot'),
        zfsreserved: gettext('ZFS reserved'),
        efi: 'EFI',
        lvm: 'LVM',
        zfs: 'ZFS',
      } as Record<string, string>
    )[String(value)] || textValue(value, '-')
  );
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
      :title="gettext('Wipe Disk')"
      width="520px"
      :loading="loading"
    >
      <div class="q-pa-md">
        <div class="wipe-warning row no-wrap items-start q-pa-sm q-mb-md">
          <q-icon
            name="warning"
            color="negative"
            size="22px"
            class="q-mr-sm"
          />
          <div>
            <div class="text-weight-medium">
              {{ gettext('All data on the device will be lost!') }}
            </div>
            <div class="text-grey-7 q-mt-xs">{{ gettext('This action cannot be undone.') }}</div>
          </div>
        </div>

        <div class="wipe-details">
          <div class="wipe-detail-row">
            <span>{{ gettext('Device') }}</span>
            <strong>{{ textValue(props.disk.devpath || props.disk.name, '-') }}</strong>
          </div>
          <div class="wipe-detail-row">
            <span>{{ gettext('Usage') }}</span>
            <span>{{ diskUsage(props.disk.used) }}</span>
          </div>
          <div class="wipe-detail-row">
            <span>{{ gettext('Size') }}</span>
            <span>{{ formatBytes(props.disk.size) }}</span>
          </div>
          <div class="wipe-detail-row">
            <span>{{ gettext('Serial') }}</span>
            <span>{{ textValue(props.disk.serial, '-') }}</span>
          </div>
        </div>
      </div>

      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button u-border-button"
          :disable="loading"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-negative text-grey-1 u-button"
          :disable="loading"
          :label="gettext('Wipe Disk')"
          @click="emit('submit')"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.wipe-warning {
  color: #333;
  background: #fff4f2;
  border-left: 3px solid #ff6c59;
}

.wipe-details {
  border: 1px solid #dfe1e6;
}

.wipe-detail-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  min-height: 36px;
  align-items: center;
  padding: 0 12px;
  color: #333;
}

.wipe-detail-row + .wipe-detail-row {
  border-top: 1px solid #e8e9ec;
}

.wipe-detail-row > :first-child {
  color: #666;
}

.wipe-detail-row > :last-child {
  overflow-wrap: anywhere;
}
</style>
