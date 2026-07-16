<template>
  <div class="error-page row items-center justify-center">
    <div class="text-center">
      <div class="error-code">404</div>
      <div class="text-h6 q-mb-md">{{ gettext('Page not found') }}</div>
      <q-btn color="primary" unelevated to="/dashboard" :label="gettext('Back to dashboard')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { gettext } from '@/locale';
</script>
