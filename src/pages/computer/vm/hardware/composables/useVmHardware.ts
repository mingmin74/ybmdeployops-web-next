import { type ComputedRef, type Ref } from 'vue';
import { updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { textValue } from '@/utils/pveFormat';
import type { VmHardwareContext } from '../context/vmHardwareContext';
import type { DevicePrefix, HardwareRow } from '../types';

interface UseVmHardwareOptions {
  node: ComputedRef<string>;
  vmid: ComputedRef<string>;
  guestType: ComputedRef<'qemu' | 'lxc'>;
  config: ComputedRef<PveRecord>;
  editDigest: Readonly<Ref<string>>;
  loading: Ref<boolean>;
  selectedDevice: Readonly<Ref<HardwareRow | undefined>>;
  pendingByKey: ComputedRef<Record<string, PveRecord>>;
  hasVmCapability: (capability: string) => boolean;
  canEditRow: (row: HardwareRow) => boolean;
  hasPendingChange: (key: string) => boolean;
  isPendingDelete: (key: string) => boolean;
  pendingValue: (key: string) => string;
  canResizeDisk: Readonly<Ref<boolean>>;
  canMoveDisk: Readonly<Ref<boolean>>;
  notifyUpdated: () => void;
  notifyTask: (upid: string, title: string) => void;
  nextDeviceKey: (prefix: DevicePrefix, limit?: number, emptyWhenFull?: boolean) => string | undefined;
}

export function useVmHardware(options: UseVmHardwareOptions): VmHardwareContext {
  const digest = options.editDigest;

  async function updateConfig(
    data: PveRecord,
    method: 'PUT' | 'POST' = 'PUT',
    taskTitle = '',
    includeDigest = true,
  ) {
    options.loading.value = true;
    try {
      const result = await updateVmConfig(
        options.node.value,
        options.vmid.value,
        { ...(includeDigest ? { digest: digest.value } : {}), ...data },
        options.guestType.value,
        method,
      );
      options.notifyUpdated();
      const upid = textValue((result as { data?: unknown }).data);
      if (method === 'POST' && upid.startsWith('UPID:')) options.notifyTask(upid, taskTitle);
      return result;
    } finally {
      options.loading.value = false;
    }
  }

  return { ...options, digest, updateConfig };
}
