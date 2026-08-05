import type { App } from 'vue';
import { __proxmox_i18n_msgcat__, __proxmox_i18n_plurals_msgcat__ } from './pve-lang-zh_CN';
import enUS from './en-US';
import zhCN from './zh-CN';

export type LocaleName = 'en-US' | 'zh-CN';

type MessageMap = Record<string, string>;
type PveCatalog = Record<string, string[]>;
type PvePluralCatalog = Record<string, string[]>;

const localeStorageKey = 'locale';
const localMessages: Record<LocaleName, MessageMap> = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

let activeLocale = normalizeLocale(localStorage.getItem(localeStorageKey));
const pveZhCNCatalog = __proxmox_i18n_msgcat__ as PveCatalog;
const pveZhCNPluralCatalog = __proxmox_i18n_plurals_msgcat__ as PvePluralCatalog;

function normalizeLocale(locale: string | null): LocaleName {
  if (!locale) {
    return 'zh-CN';
  }

  if (locale === 'zh-CN' || locale === 'zh_CN' || locale === 'zh') {
    return 'zh-CN';
  }

  return 'en-US';
}

function hasOwnMessage(messages: MessageMap, message: string) {
  return Object.prototype.hasOwnProperty.call(messages, message);
}

function fnv31a(text: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return hash & 0x7fffffff;
}

export function getLocale() {
  return activeLocale;
}

export function setLocale(locale: string) {
  activeLocale = normalizeLocale(locale);
  localStorage.setItem(localeStorageKey, activeLocale);
}

export function gettext(message: string): string {
  const local = localMessages[activeLocale];

  if (hasOwnMessage(local, message)) {
    return local[message] ?? message;
  }

  if (activeLocale === 'zh-CN') {
    const translated = pveZhCNCatalog[String(fnv31a(message))]?.[0];
    if (translated) return translated;
  }

  return message;
}

export function ngettext(singular: string, plural: string, count: number) {
  if (activeLocale === 'zh-CN') {
    const translated = pveZhCNPluralCatalog[String(fnv31a(singular))]?.[0];
    if (translated) return translated;
  }

  return count === 1 ? singular : plural;
}

export function installLocale(app: App) {
  app.config.globalProperties.gettext = gettext;
  app.config.globalProperties.ngettext = ngettext;
  app.config.globalProperties.$gettext = gettext;
  app.config.globalProperties.$ngettext = ngettext;
  app.config.globalProperties.$t = gettext;
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    gettext: typeof gettext;
    ngettext: typeof ngettext;
    $gettext: typeof gettext;
    $ngettext: typeof ngettext;
    $t: typeof gettext;
  }
}
