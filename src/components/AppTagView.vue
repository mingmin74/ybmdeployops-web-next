<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { gettext } from '@/locale';

type TagViewItem = {
  path: string;
  title: string;
};

const route = useRoute();
const router = useRouter();
const tagView = shallowRef<TagViewItem[]>([]);

const activePath = computed(() => route.fullPath || route.path);

function routeTitle(nextRoute: RouteLocationNormalizedLoaded) {
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
  if (nextRoute.meta.public || !nextRoute.meta.auth) return;

  const path = nextRoute.fullPath || nextRoute.path;
  if (tagView.value.some((item) => item.path === path)) return;

  tagView.value = [
    ...tagView.value,
    {
      path,
      title: routeTitle(nextRoute),
    },
  ];
}

function removeTag(index: number, tag: TagViewItem) {
  const nextTags = tagView.value.filter((_, itemIndex) => itemIndex !== index);
  tagView.value = nextTags;

  if (tag.path !== route.fullPath && tag.path !== route.path) return;

  const nextRoute = nextTags[index - 1] || nextTags[index] || nextTags[0];
  void router.push(nextRoute?.path || '/dashboard');
}

watch(
  () => route.fullPath,
  () => {
    addTag(route);
  },
  { immediate: true },
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
      <q-route-tab
        v-for="(tag, index) in tagView"
        :key="`${tag.path}-${index}`"
        class="tag-item"
        active-class="tag-item--active"
        :to="tag.path"
        :name="tag.path"
        no-caps
      >
        <q-icon name="widgets" size="16px" />
        <div class="tag-label">{{ gettext(tag.title) }}</div>
        <q-icon
          v-if="index !== 0"
          name="close"
          size="16px"
          class="tag-close"
          @click.prevent.stop="removeTag(index, tag)"
        />
      </q-route-tab>
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

.tag-item.tag-item--active,
.tag-item.q-tab--active,
.tag-item.q-router-link--exact-active {
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
