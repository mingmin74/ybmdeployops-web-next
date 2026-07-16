<template>
  <q-page class="placeholder-page">
    <div class="page-title-row">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ $t('This module route is ready for phased migration.') }}</p>
      </div>
    </div>

    <q-card flat bordered class="placeholder-card">
      <q-card-section>
        <q-icon name="schema" size="32px" color="primary" />
        <div>
          <div class="placeholder-title">{{ $t('Framework placeholder') }}</div>
          <div class="placeholder-desc">{{ $t('Business pages will be migrated after login, layout, request and permission contracts are stable.') }}</div>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { menuItems } from '@/config/menu';

const route = useRoute();
const { t } = useI18n();

const title = computed(() => {
  const currentPath = route.path;
  for (const item of menuItems) {
    const match = item.children?.find((child) => child.path === currentPath);
    if (match) return t(match.titleKey);
    if (item.path === currentPath) return t(item.titleKey);
  }

  return t('Module');
});
</script>
