import { inject, type InjectionKey } from 'vue';
import type { CreateCtWizardContext } from '../types/createCtWizard';

export const createCtWizardKey: InjectionKey<CreateCtWizardContext> = Symbol('createCtWizard');

export function useCreateCtWizardContext(): CreateCtWizardContext {
  const wizard = inject(createCtWizardKey);
  if (!wizard) {
    throw new Error('CreateCtWizardContext was not provided.');
  }
  return wizard;
}
