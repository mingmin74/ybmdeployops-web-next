import { defineBoot } from '#q-app';
import { createI18n } from 'vue-i18n';
import messages from '@/i18n';

export type MessageLanguages = keyof typeof messages;
export type MessageSchema = typeof messages['en-US'];

/* eslint-disable @typescript-eslint/no-empty-object-type */
declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends MessageSchema {}
  export interface DefineDateTimeFormat {}
  export interface DefineNumberFormat {}
}

export default defineBoot(({ app }) => {
  const i18n = createI18n<{ message: MessageSchema }, MessageLanguages>({
    locale: (localStorage.getItem('locale') as MessageLanguages) || 'zh-CN',
    fallbackLocale: 'en-US',
    legacy: false,
    messages,
  });

  app.use(i18n);
});

