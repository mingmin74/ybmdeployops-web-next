/* eslint-disable @typescript-eslint/no-unused-vars */
// Project-wide shims for Vue and compiler macros
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>
  >;
  export default component;
}

declare function defineModel<T = Record<string, unknown>>(props?: T, defaults?: Partial<T>): T;
declare function defineModel<T = Record<string, unknown>>(
  name?: string | T,
  defaults?: Partial<T>,
): T;

declare function defineEmits<T = Record<string, (...args: unknown[]) => unknown>>(): T;
declare function defineEmits(
  definition?: Record<string, (...args: unknown[]) => unknown>,
): Record<string, (...args: unknown[]) => unknown>;

declare function gettext(input: string): string;

export {};
