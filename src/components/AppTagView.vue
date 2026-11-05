<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';

type TagViewItem = {
  path: string;
  title: string;
};

const permissionTabTitles: Record<string, string> = {
  permissions: 'Permissions',
  users: 'Users',
  apitokens: 'API Tokens',
  tfa: 'Two Factor',
  groups: 'Groups',
  pools: 'Pools',
  roles: 'Roles',
  realms: 'Realms',
};

const defaultTab = 'permissions';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const ui = useUiStore();
const storageKey = `page-tabs:${session.userid}`;

function restoreTags(): TagViewItem[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(stored)) return [];

    const seen = new Set<string>();
    return stored
      .filter((item): item is TagViewItem => {
        if (
          !item ||
          typeof item.path !== 'string' ||
          !item.path.startsWith('/') ||
          typeof item.title !== 'string' ||
          seen.has(item.path)
        ) {
          return false;
        }
        const resolved = router.resolve(item.path);
        if (!resolved.meta.auth || resolved.meta.public) return false;
        seen.add(item.path);
        return true;
      })
      .slice(-ui.maxOpenTabs);
  } catch {
    return [];
  }
}

const tagView = shallowRef<TagViewItem[]>(restoreTags());

const isPermissionsRoute = (name: unknown) => name === 'system-permissions';

function resolveTab(nextRoute: RouteLocationNormalizedLoaded) {
  const tab = nextRoute.query.tab;
  return typeof tab === 'string' && permissionTabTitles[tab] ? tab : defaultTab;
}

function tagKey(nextRoute: RouteLocationNormalizedLoaded) {
  if (isPermissionsRoute(nextRoute.name)) {
    const tab = resolveTab(nextRoute);
    return `${nextRoute.path}?tab=${tab}`;
  }
  return nextRoute.fullPath || nextRoute.path;
}

const activePath = computed(() => tagKey(route));

function permissionTabTitle(nextRoute: RouteLocationNormalizedLoaded) {
  const tab = resolveTab(nextRoute);
  return gettext(permissionTabTitles[tab] ?? tab);
}

function routeTitle(nextRoute: RouteLocationNormalizedLoaded) {
  if (isPermissionsRoute(nextRoute.name)) return permissionTabTitle(nextRoute);
  if (nextRoute.name === 'computer-vm-detail') {
    const vmid = String(nextRoute.params.vmid || '');
    return vmid
      ? `${gettext('Virtual Machine Details')} · ${vmid}`
      : gettext('Virtual Machine Details');
  }
  if (nextRoute.name === 'computer-ct-container-detail') {
    const vmid = String(nextRoute.params.vmid || '');
    return vmid ? `${gettext('Container Details')} · ${vmid}` : gettext('Container Details');
  }
  if (nextRoute.name === 'host-node-detail') {
    const nodeName = String(nextRoute.params.node || '');
    return nodeName ? `${gettext('Node Details')} · ${nodeName}` : gettext('Node Details');
  }
  return String(nextRoute.meta.title || nextRoute.name || nextRoute.path);
}

function addTag(nextRoute: RouteLocationNormalizedLoaded) {
  if (nextRoute.name === 'dashboard' || nextRoute.meta.public || !nextRoute.meta.auth) return;

  const key = tagKey(nextRoute);
  const title = routeTitle(nextRoute);

  if (tagView.value.some((item) => item.path === key)) return;

  tagView.value = [...tagView.value, { path: key, title }].slice(-ui.maxOpenTabs);
}

function removeTag(index: number, tag: TagViewItem) {
  const nextTags = tagView.value.filter((_, itemIndex) => itemIndex !== index);
  tagView.value = nextTags;

  if (tag.path !== tagKey(route)) return;

  const nextRoute = nextTags[index - 1] || nextTags[index] || nextTags[0];
  void router.push(nextRoute?.path || '/dashboard');
}

watch(tagView, (tags) => {
  localStorage.setItem(storageKey, JSON.stringify(tags));
});

watch(
  () => ui.maxOpenTabs,
  (limit) => {
    if (tagView.value.length <= limit) return;
    tagView.value = tagView.value.slice(-limit);
    if (!tagView.value.some((tag) => tag.path === tagKey(route))) {
      void router.push(tagView.value[tagView.value.length - 1]?.path || '/dashboard');
    }
  }
);

watch(
  () => route.fullPath,
  () => {
    addTag(route);
  },
  { immediate: true }
);
</script>

<template>
  <div class="app-tag-view">
    <q-tabs
      v-if="tagView.length"
      :model-value="activePath"
      dense
      inline-label
      outside-arrows
      mobile-arrows
      indicator-color="transparent"
      :breakpoint="0"
      align="left"
      class="tag-tabs"
    >
      <q-tab
        v-for="(tag, index) in tagView"
        :key="tag.path"
        :name="tag.path"
        :class="['tag-item', tag.path === activePath ? 'tag-item--active' : '']"
        no-caps
        @click="router.push(tag.path)"
      >
        <q-icon
          name="widgets"
          size="16px"
        />
        <div class="tag-label">{{ gettext(tag.title) }}</div>
        <q-icon
          v-if="index !== 0"
          name="close"
          size="16px"
          class="tag-close"
          @click.prevent.stop="removeTag(index, tag)"
        />
      </q-tab>
    </q-tabs>
  </div>
</template>

<style scoped>
.app-tag-view {
  height: 40px;
  padding: 6px 10px 0;
  overflow: hidden;
  background: #ffffff;
}

.tag-tabs {
  min-height: 32px;
  color: #333333;
}

.tag-item {
  min-height: 30px;
  margin-right: 8px;
  padding: 0 8px;
  border-radius: 5px;
  background: linear-gradient(#eeeeee, #cccccc);
  color: #333333;
}

.tag-item.tag-item--active {
  background: linear-gradient(#2f8ae5, #1976d2);
  color: #ffffff;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.18);
}

.tag-label {
  margin: 0 3px;
}

.tag-close {
  display: inline-flex;
}
</style>
