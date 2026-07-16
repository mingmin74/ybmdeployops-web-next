<template>
  <div class="error-page row items-center justify-center">
    <div class="text-center">
      <div class="error-code">404</div>
      <div class="text-h6 q-mb-md">{{ $t('Page not found') }}</div>
      <q-btn color="primary" unelevated to="/dashboard" :label="$t('Back to dashboard')" />
    </div>
  </div>
</template>
