<script setup lang="ts">
import { Notify } from 'quasar';
import { shallowRef, watch } from 'vue';
import { gettext } from '@/locale';

const visible = defineModel<boolean>({ default: false });
const { userid } = defineProps<{ userid: string }>();
const newPassword = shallowRef('');

watch(visible, (isVisible) => {
  if (!isVisible) newPassword.value = '';
});

function savePassword() {
  if (newPassword.value.length < 8) return;
  visible.value = false;
  Notify.create({ type: 'info', message: '密码操作仅作样式演示，未修改真实用户', position: 'top' });
}
</script>

<template>
  <q-dialog v-model="visible">
    <q-card
      class="standard-style-dialog"
      role="dialog"
      :aria-label="gettext('Password')"
    >
      <q-card-section class="row items-center">
        <div class="text-h6">{{ gettext('Password') }}: {{ userid }}</div>
        <q-space />
        <q-btn
          v-close-popup
          icon="close"
          flat
          round
          dense
          aria-label="关闭"
        />
      </q-card-section>
      <q-separator />
      <q-card-section>
        <q-input
          v-model="newPassword"
          type="password"
          :label="gettext('New Password')"
        />
      </q-card-section>
      <q-separator />
      <q-card-actions align="right">
        <q-btn
          v-close-popup
          flat
          :label="gettext('Cancel')"
        />
        <q-btn
          color="primary"
          :label="gettext('Save')"
          :disable="newPassword.length < 8"
          @click="savePassword"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.standard-style-dialog {
  width: 500px;
  max-width: 92vw;
  border-radius: 4px !important;
}
</style>
