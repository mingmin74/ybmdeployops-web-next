import { computed, type ComputedRef, type Ref } from 'vue';
import { updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { textValue } from '@/utils/pveFormat';
import type { VmHardwareContext } from '../context/vmHardwareContext';
import type { DevicePrefix, HardwareRow } from '../types';

interface UseVmHardwareOptions {
  node: ComputedRef<string>;
  vmid: ComputedRef<string>;
  config: ComputedRef<PveRecord>;
  loading: Ref<boolean>;
  selectedDevice: Readonly<Ref<HardwareRow | undefined>>;
  pendingByKey: ComputedRef<Record<string, PveRecord>>;
  hasVmCapability: (capability: string) => boolean;
  canEditRow: (row: HardwareRow) => boolean;
  hasPendingChange: (key: string) => boolean;
  pendingValue: (key: string) => string;
  notifyUpdated: () => void;
  nextDeviceKey: (prefix: DevicePrefix, limit?: number) => string;
}

export function useVmHardware(options: UseVmHardwareOptions): VmHardwareContext {
  const digest = computed(() => textValue(options.config.value.digest));

  async function updateConfig(data: PveRecord) {
    options.loading.value = true;
    try {
      await updateVmConfig(options.node.value, options.vmid.value, {
        digest: digest.value,
        ...data,
      });
      options.notifyUpdated();
    } finally {
      options.loading.value = false;
    }
  }

  return { ...options, digest, updateConfig };
}
