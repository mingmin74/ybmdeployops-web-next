<template>
  <div class="login-page row items-center justify-center">
    <section class="login-panel">
      <div class="login-brand">
        <div class="login-logo">YBM</div>
        <div>
          <h1>{{ appConfig.productName }}</h1>
          <p>{{ gettext('Enter fields to sign in') }}</p>
        </div>
      </div>

      <q-form class="login-form" @submit="submitLogin">
        <q-input
          v-model="form.username"
          dense
          outlined
          autofocus
          :label="gettext('Username')"
          :rules="[(value) => Boolean(value) || gettext('Username is required')]"
        />
        <q-input
          v-model="form.password"
          dense
          outlined
          :type="showPassword ? 'text' : 'password'"
          :label="gettext('Password')"
          :rules="[(value) => Boolean(value) || gettext('Password is required')]"
        >
          <template #append>
            <q-btn
              flat
              round
              dense
              :icon="showPassword ? 'visibility_off' : 'visibility'"
              :aria-label="gettext('Toggle password visibility')"
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
          :label="gettext('Realm')"
          :options="realmOptions"
        />
        <q-checkbox v-model="form.remember" dense :label="gettext('Remember me')" />
        <q-btn
          unelevated
          color="primary"
          class="full-width login-button"
          type="submit"
          :loading="loading"
          :label="gettext('Login')"
        />
      </q-form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Notify } from 'quasar';
import { appConfig } from '@/config/app';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

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
      Notify.create({ type: 'negative', message: response.message || gettext('Login failed') });
      return;
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.push(redirect === '/login' ? '/dashboard' : redirect);
  } finally {
    loading.value = false;
  }
}
</script>
