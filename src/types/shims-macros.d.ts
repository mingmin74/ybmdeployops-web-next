/* eslint-disable @typescript-eslint/no-unused-vars */
// Global shims for compiler macros used across the project.
// Minimal declarations to satisfy TS; prefer safer types than `any`.

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
