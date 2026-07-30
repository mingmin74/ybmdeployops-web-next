import { inject, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { PveRecord } from '@/api/resources';
import type { DevicePrefix, HardwareRow } from '../types';

export interface VmHardwareContext {
  node: ComputedRef<string>;
  vmid: ComputedRef<string>;
  config: ComputedRef<PveRecord>;
  digest: ComputedRef<string>;
  loading: Ref<boolean>;
  selectedDevice: Readonly<Ref<HardwareRow | undefined>>;
  pendingByKey: ComputedRef<Record<string, PveRecord>>;
  hasVmCapability: (capability: string) => boolean;
  canEditRow: (row: HardwareRow) => boolean;
  hasPendingChange: (key: string) => boolean;
  pendingValue: (key: string) => string;
  updateConfig: (data: PveRecord) => Promise<void>;
  notifyUpdated: () => void;
  nextDeviceKey: (prefix: DevicePrefix, limit?: number) => string;
}

export const vmHardwareKey: InjectionKey<VmHardwareContext> = Symbol('vmHardware');

export function useVmHardwareContext(): VmHardwareContext {
  const context = inject(vmHardwareKey);
  if (!context) throw new Error('Vm hardware context was not provided');
  return context;
}
