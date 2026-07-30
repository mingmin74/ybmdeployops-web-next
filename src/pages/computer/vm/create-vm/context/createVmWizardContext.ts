import { inject, type InjectionKey } from 'vue';
import type { CreateVmWizardContext } from '../types/createVmWizard';

export const createVmWizardKey: InjectionKey<CreateVmWizardContext> = Symbol('createVmWizard');

export function useCreateVmWizardContext(): CreateVmWizardContext {
  const wizard = inject(createVmWizardKey);
  if (!wizard) {
    throw new Error('CreateVmWizardContext was not provided.');
  }
  return wizard;
}
