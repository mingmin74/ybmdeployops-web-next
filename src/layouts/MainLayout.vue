<template>
  <q-layout view="hHh Lpr lFf" class="app-shell">
    <q-header elevated class="app-header">
      <q-toolbar class="app-toolbar">
        <q-btn flat round dense icon="menu" :aria-label="gettext('Menu')" @click="ui.toggleMenuMini" />
        <div class="brand-mark">YBM</div>
        <q-toolbar-title class="brand-title">{{ appConfig.productName }}</q-toolbar-title>
        <q-btn-dropdown flat dense no-caps icon="account_circle" :label="session.userid || session.username">
          <q-list dense class="user-menu">
            <q-item>
              <q-item-section>
                <q-item-label>{{ session.userid }}</q-item-label>
                <q-item-label caption>{{ gettext('Logged in') }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-separator />
            <q-item clickable v-close-popup @click="logout">
              <q-item-section avatar><q-icon name="logout" /></q-item-section>
              <q-item-section>{{ gettext('Logout') }}</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </q-toolbar>
    </q-header>

    <q-drawer
      :model-value="true"
      show-if-above
      bordered
      :mini="ui.menuMini"
      :width="232"
      :mini-width="58"
      class="app-menu"
    >
      <q-scroll-area class="fit">
        <q-list padding>
          <template v-for="item in menuItems" :key="item.titleKey">
            <q-item
              v-if="!item.children"
              clickable
              :active="isActive(item.path)"
              active-class="menu-active"
              @click="go(item.path)"
            >
              <q-item-section avatar><q-icon :name="item.icon" /></q-item-section>
              <q-item-section>{{ gettext(item.titleKey) }}</q-item-section>
            </q-item>

            <q-expansion-item
              v-else
              :default-opened="isGroupOpen(item)"
              :icon="item.icon"
              :label="gettext(item.titleKey)"
              expand-separator
            >
              <template v-for="child in item.children" :key="child.path || child.titleKey">
                <q-item
                  v-if="!child.children"
                  clickable
                  class="menu-child"
                  :active="isActive(child.path)"
                  active-class="menu-active"
                  @click="go(child.path)"
                >
                  <q-item-section avatar><q-icon :name="child.icon" /></q-item-section>
                  <q-item-section>{{ gettext(child.titleKey) }}</q-item-section>
                </q-item>

                <q-expansion-item
                  v-else
                  header-class="menu-child"
                  :default-opened="isGroupOpen(child)"
                  :icon="child.icon"
                  :label="gettext(child.titleKey)"
                  :content-inset-level="1"
                  expand-separator
                >
                  <q-item
                    v-for="grandchild in child.children"
                    :key="grandchild.path || grandchild.titleKey"
                    clickable
                    class="menu-child"
                    :active="isActive(grandchild.path)"
                    active-class="menu-active"
                    @click="go(grandchild.path)"
                  >
                    <q-item-section avatar><q-icon :name="grandchild.icon" /></q-item-section>
                    <q-item-section>{{ gettext(grandchild.titleKey) }}</q-item-section>
                  </q-item>
                </q-expansion-item>
              </template>
            </q-expansion-item>
          </template>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <q-page-container class="page-container">
      <AppTagView />
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppTagView from '@/components/AppTagView.vue';
import { appConfig } from '@/config/app';
import { menuItems, type MenuItem } from '@/config/menu';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const ui = useUiStore();
let refreshHandler: ReturnType<typeof setInterval> | undefined;

function go(path?: string) {
  if (path) void router.push(path);
}

function isActive(path?: string) {
  return Boolean(path && route.path === path);
}

function isGroupOpen(item: MenuItem): boolean {
  return Boolean(item.children?.some((child) => child.path ? route.path === child.path : isGroupOpen(child)));
}

function logout() {
  session.clearSession();
  void router.push({ name: 'user-login' });
}

onMounted(() => {
  refreshHandler = setInterval(() => {
    void session.refreshTicket();
  }, appConfig.keepAliveInterval);
});

onBeforeUnmount(() => {
  if (refreshHandler) clearInterval(refreshHandler);
});
</script>

