import { Cookies } from 'quasar';
import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import { appConfig } from '@/config/app';
import { keepLoginAlive, loginPve, type LoginPayload } from '@/api/system';

const storageKeys = {
  username: 'username',
  realm: 'realm',
  remember: 'remember',
  csrfToken: 'csrfToken',
};

export const useSessionStore = defineStore('session', () => {
  const username = shallowRef(localStorage.getItem(storageKeys.username) || '');
  const realm = shallowRef(localStorage.getItem(storageKeys.realm) || appConfig.defaultRealm);
  const csrfToken = shallowRef(localStorage.getItem(storageKeys.csrfToken) || '');
  const caps = shallowRef<Record<string, unknown>>({});

  const ticket = computed(() => Cookies.get(appConfig.cookieName) || '');
  const isAuthenticated = computed(() => Boolean(username.value && realm.value && ticket.value));
  const userid = computed(() => (username.value && realm.value ? `${username.value}@${realm.value}` : ''));

  function persistSession(data: { username: string; csrfToken: string; cap?: Record<string, unknown>; ticket: string }) {
    username.value = data.username.split('@')[0] || data.username;
    realm.value = data.username.split('@')[1] || realm.value;
    csrfToken.value = data.csrfToken;
    caps.value = data.cap || {};

    localStorage.setItem(storageKeys.username, username.value);
    localStorage.setItem(storageKeys.realm, realm.value);
    localStorage.setItem(storageKeys.csrfToken, data.csrfToken);
    Cookies.set(appConfig.cookieName, data.ticket, { secure: false, sameSite: 'Lax' });
  }

  async function login(payload: LoginPayload & { remember?: boolean }) {
    const response = await loginPve(payload);
    const data = response.data;

    if (response.success && data) {
      localStorage.setItem(storageKeys.remember, String(Boolean(payload.remember)));
      persistSession({
        username: data.username,
        csrfToken: data.CSRFPreventionToken,
        cap: data.cap,
        ticket: data.ticket,
      });
    }

    return response;
  }

  async function refreshTicket() {
    if (!userid.value || !ticket.value) return;

    const response = await keepLoginAlive(userid.value, ticket.value);
    const data = response.data;

    if (data) {
      persistSession({
        username: data.username,
        csrfToken: data.CSRFPreventionToken,
        cap: data.cap,
        ticket: data.ticket,
      });
    }
  }

  function clearSession() {
    username.value = '';
    csrfToken.value = '';
    caps.value = {};
    Cookies.remove(appConfig.cookieName);
    localStorage.removeItem(storageKeys.username);
    localStorage.removeItem(storageKeys.realm);
    localStorage.removeItem(storageKeys.csrfToken);
  }

  return {
    username,
    realm,
    csrfToken,
    caps,
    ticket,
    userid,
    isAuthenticated,
    login,
    refreshTicket,
    clearSession,
  };
});

