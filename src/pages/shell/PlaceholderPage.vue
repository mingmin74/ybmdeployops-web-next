<template>
  <q-page class="placeholder-page">
    <div class="page-title-row">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ gettext('This module route is ready for phased migration.') }}</p>
      </div>
    </div>

    <q-card flat bordered class="placeholder-card">
      <q-card-section>
        <q-icon name="schema" size="32px" color="primary" />
        <div>
          <div class="placeholder-title">{{ gettext('Framework placeholder') }}</div>
          <div class="placeholder-desc">{{ gettext('Business pages will be migrated after login, layout, request and permission contracts are stable.') }}</div>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { menuItems } from '@/config/menu';
import { gettext } from '@/locale';

const route = useRoute();

const title = computed(() => {
  const currentPath = route.path;
  for (const item of menuItems) {
    const match = item.children?.find((child) => child.path === currentPath);
    if (match) return gettext(match.titleKey);
    if (item.path === currentPath) return gettext(item.titleKey);
  }

  return gettext('Module');
});
</script>
