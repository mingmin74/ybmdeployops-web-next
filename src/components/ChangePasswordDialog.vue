<script setup lang="ts">
import { reactive, shallowRef, useTemplateRef, watch } from 'vue';
import { updateUserPassword } from '@/api/users';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

type Validatable = {
  validate?: () => boolean | Promise<boolean>;
};

const { userid, realmType } = defineProps<{
  userid: string;
  realmType: string | undefined;
}>();

const visible = defineModel<boolean>({ required: true });
const session = useSessionStore();
const loading = shallowRef(false);
const form = reactive({
  currentPassword: '',
  password: '',
  confirmPassword: '',
});
const currentPasswordInput = useTemplateRef<Validatable>('currentPasswordInput');
const passwordInput = useTemplateRef<Validatable>('passwordInput');
const confirmPasswordInput = useTemplateRef<Validatable>('confirmPasswordInput');

function resetForm() {
  form.currentPassword = '';
  form.password = '';
  form.confirmPassword = '';
}

function passwordRules(value: string) {
  if (!value) return gettext('This field is required');
  return value.length >= 8 && value.length <= 64
    ? true
    : `${gettext('The length for this field is')}: [8-64]`;
}

function confirmPasswordRules(value: string) {
  if (!value) return gettext('This field is required');
  return value === form.password ? true : gettext('Passwords do not match');
}

function validateForm() {
  const inputs = [passwordInput.value, confirmPasswordInput.value];
  if (session.userid !== 'root@pam') inputs.unshift(currentPasswordInput.value);
  return inputs.every((input) => input?.validate?.() !== false);
}

async function submit() {
  if (!userid || !validateForm()) return;

  loading.value = true;
  try {
    await updateUserPassword(
      userid,
      form.password,
      session.userid === 'root@pam' ? undefined : form.currentPassword
    );
    visible.value = false;
  } finally {
    loading.value = false;
  }
}

watch(visible, (isVisible) => {
  if (!isVisible) resetForm();
});
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card class="u-window-card password-dialog">
      <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
        <q-spinner-bars
          size="14px"
          color="white"
        />
        <div class="text-weight-bold q-mx-sm text-overflow">
          {{ gettext('Setting') }}: {{ gettext('Password') }}
        </div>
        <q-space />
        <q-btn
          v-close-popup
          class="bg-negative"
          icon="close"
          size="sm"
          flat
          dense
        />
      </q-card-section>
      <q-card-section class="q-pa-none u-hidden-error">
        <div class="u-border q-ma-sm q-pa-md">
          <q-input
            v-if="session.userid !== 'root@pam'"
            ref="currentPasswordInput"
            v-model="form.currentPassword"
            dense
            type="password"
            :label="`${gettext('Your Current Password')} *`"
            :rules="[(value: string) => (value ? true : gettext('This field is required'))]"
          />
          <div
            v-if="realmType === 'pam'"
            class="text-caption text-grey-7 q-mb-sm"
          >
            {{ gettext('For the PAM realm, this applies only to the connected node.') }}
          </div>
          <q-input
            ref="passwordInput"
            v-model="form.password"
            dense
            autofocus
            type="password"
            maxlength="64"
            :label="`${gettext('Password')} *`"
            :rules="[passwordRules]"
          />
          <q-input
            ref="confirmPasswordInput"
            v-model="form.confirmPassword"
            dense
            type="password"
            maxlength="64"
            :label="`${gettext('Confirm Password')} *`"
            :rules="[confirmPasswordRules]"
          />
          <q-inner-loading :showing="loading" />
        </div>
      </q-card-section>
      <q-card-actions
        align="right"
        class="bg-grey-2 overflow-hidden"
      >
        <q-btn
          no-caps
          flat
          size="12px"
          :disable="loading"
          :label="gettext('OK')"
          :class="loading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.u-window-card {
  border-radius: 0;
}

.password-dialog {
  width: 400px;
  max-width: 400px;
}
</style>
