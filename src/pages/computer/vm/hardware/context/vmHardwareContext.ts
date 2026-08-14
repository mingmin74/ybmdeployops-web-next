import { inject, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { PveRecord } from '@/api/resources';
import type { DevicePrefix, HardwareRow } from '../types';

export interface VmHardwareContext {
  node: ComputedRef<string>;
  vmid: ComputedRef<string>;
  config: ComputedRef<PveRecord>;
  digest: Readonly<Ref<string>>;
  loading: Ref<boolean>;
  selectedDevice: Readonly<Ref<HardwareRow | undefined>>;
  pendingByKey: ComputedRef<Record<string, PveRecord>>;
  hasVmCapability: (capability: string) => boolean;
  canEditRow: (row: HardwareRow) => boolean;
  hasPendingChange: (key: string) => boolean;
  isPendingDelete: (key: string) => boolean;
  pendingValue: (key: string) => string;
  updateConfig: (
    data: PveRecord,
    method?: 'PUT' | 'POST',
    taskTitle?: string,
    includeDigest?: boolean,
  ) => Promise<unknown>;
  notifyUpdated: () => void;
  notifyTask: (upid: string, title: string) => void;
  nextDeviceKey: (prefix: DevicePrefix, limit?: number, emptyWhenFull?: boolean) => string | undefined;
}

export const vmHardwareKey: InjectionKey<VmHardwareContext> = Symbol('vmHardware');

export function useVmHardwareContext(): VmHardwareContext {
  const context = inject(vmHardwareKey);
  if (!context) throw new Error('Vm hardware context was not provided');
  return context;
}
