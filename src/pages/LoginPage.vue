<template>
  <div class="login-page row items-center justify-center">
    <section class="login-panel">
      <div class="login-brand">
        <div class="login-logo">YBM</div>
        <div>
          <h1>{{ appConfig.productName }}</h1>
          <p>{{ $t('Enter fields to sign in') }}</p>
        </div>
      </div>

      <q-form class="login-form" @submit="submitLogin">
        <q-input
          v-model="form.username"
          dense
          outlined
          autofocus
          :label="$t('Username')"
          :rules="[(value) => Boolean(value) || $t('Username is required')]"
        />
        <q-input
          v-model="form.password"
          dense
          outlined
          :type="showPassword ? 'text' : 'password'"
          :label="$t('Password')"
          :rules="[(value) => Boolean(value) || $t('Password is required')]"
        >
          <template #append>
            <q-btn
              flat
              round
              dense
              :icon="showPassword ? 'visibility_off' : 'visibility'"
              :aria-label="$t('Toggle password visibility')"
              @click="showPassword = !showPassword"
            />
          </template>
        </q-input>
        <q-select
          v-model="form.realm"
          dense
          outlined
          emit-value
          map-options
          :label="$t('Realm')"
          :options="realmOptions"
        />
        <q-checkbox v-model="form.remember" dense :label="$t('Remember me')" />
        <q-btn
          unelevated
          color="primary"
          class="full-width login-button"
          type="submit"
          :loading="loading"
          :label="$t('Login')"
        />
      </q-form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Notify } from 'quasar';
import { useI18n } from 'vue-i18n';
import { appConfig } from '@/config/app';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { t } = useI18n();

const loading = shallowRef(false);
const showPassword = shallowRef(false);
const form = reactive({
  username: localStorage.getItem('username') || '',
  password: '',
  realm: localStorage.getItem('realm') || appConfig.defaultRealm,
  remember: localStorage.getItem('remember') === 'true',
});

const realmOptions = [
  { label: 'Linux PAM', value: 'pam' },
  { label: 'Proxmox VE', value: 'pve' },
];

async function submitLogin() {
  loading.value = true;
  try {
    const response = await session.login({
      username: form.username,
      password: form.password,
      realm: form.realm,
      // remember: form.remember,
    });
    if (!response.success) {
      Notify.create({ type: 'negative', message: response.message || t('Login failed') });
      return;
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.push(redirect === '/login' ? '/dashboard' : redirect);
  } finally {
    loading.value = false;
  }
}
</script>

