<template>
  <q-layout view="hHh Lpr lFf" class="app-shell">
    <q-header elevated class="app-header">
      <q-toolbar class="app-toolbar">
        <q-btn
          flat
          round
          dense
          icon="menu"
          :aria-label="gettext('Menu')"
          @click="ui.toggleMenuMini"
        />
        <div class="brand-mark">YBM</div>
        <q-toolbar-title class="brand-title">{{ appConfig.productName }}</q-toolbar-title>
        <div class="header-resource-search">
          <q-input
            ref="resourceSearchInput"
            v-model="resourceSearch"
            dense
            borderless
            input-class="header-resource-search__input"
            :placeholder="gettext('Search nodes, virtual machines, containers, and more')"
            :loading="resourcesLoading"
            @focus="showResourceSearch"
            @keydown.enter.prevent="openSelectedResource"
            @keydown.up.prevent="moveResourceSelection(-1)"
            @keydown.down.prevent="moveResourceSelection(1)"
            @keydown.esc.prevent="resourceSearchOpen = false"
          >
            <template #prepend><q-icon name="search" size="18px" /></template>
          </q-input>
          <q-menu
            v-model="resourceSearchOpen"
            class="resource-search-menu"
            no-focus
            no-refocus
            fit
            anchor="bottom left"
            self="top left"
            :offset="[0, 8]"
          >
            <q-table
              flat
              dense
              row-key="id"
              table-header-class="u-table-header"
              :rows="filteredResources"
              :columns="resourceColumns"
              :pagination="{ rowsPerPage: 0 }"
              :loading="resourcesLoading"
              hide-bottom
              style="width: 680px; height: 400px"
              @row-click="(_, row) => openResource(row)"
            >
              <template #body-cell-type="scope">
                <q-td :props="scope">
                  <q-icon
                    :name="resourceTypeIcon(scope.row)"
                    :color="resourceTypeIconColor(scope.row)"
                    size="18px"
                    class="q-mr-sm"
                  />
                  {{ scope.value }}
                </q-td>
              </template>
              <template #no-data="{ message }">
                <div class="full-width row flex-center text-accent q-gutter-sm">
                  <span class="text-grey-6">{{ message }}</span>
                </div>
              </template>
            </q-table>
          </q-menu>
        </div>
        <q-btn-dropdown
          flat
          dense
          no-caps
          icon="account_circle"
          :label="session.userid || session.username"
        >
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
      <AppTagView v-if="route.name !== 'dashboard'" />
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppTagView from '@/components/AppTagView.vue';
import { getClusterResources, type PveRecord } from '@/api/resources';
import { appConfig } from '@/config/app';
import { menuItems, type MenuItem } from '@/config/menu';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { textValue } from '@/utils/pveFormat';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const ui = useUiStore();
const resources = shallowRef<PveRecord[]>([]);
const resourcesLoading = shallowRef(false);
const resourceSearch = shallowRef('');
const resourceSearchOpen = shallowRef(false);
const selectedResourceRows = shallowRef<PveRecord[]>([]);
const resourceSearchInput = useTemplateRef<{ focus: () => void; blur: () => void }>(
  'resourceSearchInput',
);
let refreshHandler: ReturnType<typeof setInterval> | undefined;

const resourceColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'type',
    label: gettext('Type'),
    field: (row) => textValue(row.type, '-'),
    align: 'left',
    sortable: true,
  },
  {
    name: 'text',
    label: gettext('Description'),
    field: (row) => textValue(row.text) || resourceName(row),
    align: 'left',
    sortable: true,
  },
  {
    name: 'node',
    label: gettext('Node'),
    field: (row) => textValue(row.node, '-'),
    align: 'left',
    sortable: true,
  },
  {
    name: 'pool',
    label: gettext('Pool'),
    field: (row) => textValue(row.pool, '-'),
    align: 'left',
    sortable: true,
  },
];

const filteredResources = computed(() => {
  const words = resourceSearch.value.toLowerCase().trim().split(/\s+/).filter(Boolean);

  return resources.value
    .map((resource) => ({ resource, relevance: resourceRelevance(resource, words) }))
    .filter(({ relevance }) => words.length === 0 || relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .map(({ resource }) => resource);
});

watch(filteredResources, (rows) => {
  selectedResourceRows.value = rows[0] ? [rows[0]] : [];
});

function go(path?: string) {
  if (path) void router.push(path);
}

function isActive(path?: string) {
  return Boolean(path && route.path === path);
}

function isGroupOpen(item: MenuItem): boolean {
  return Boolean(
    item.children?.some((child) => (child.path ? route.path === child.path : isGroupOpen(child))),
  );
}

function resourceId(row: PveRecord) {
  const id = textValue(row.id);
  if (id) return id;
  return `${textValue(row.type)}/${textValue(row.node)}/${textValue(row.vmid) || textValue(row.storage) || textValue(row.name) || ''}`;
}

function resourceName(row: PveRecord) {
  return (
    textValue(row.name) ||
    textValue(row.storage) ||
    textValue(row.node) ||
    textValue(row.vmid) ||
    '-'
  );
}

function resourceTypeIcon(row: PveRecord) {
  const icons: Record<string, string> = {
    node: 'dns',
    qemu: 'desktop_windows',
    lxc: 'inventory_2',
    storage: 'storage',
    pool: 'folder',
  };
  return icons[textValue(row.type)] || 'widgets';
}

function resourceTypeIconColor(row: PveRecord) {
  const colors: Record<string, string> = {
    node: 'primary',
    qemu: 'indigo',
    lxc: 'teal',
    storage: 'orange',
    pool: 'blue-grey',
  };
  return colors[textValue(row.type)] || 'grey-7';
}

function resourceRelevance(row: PveRecord, words: string[]) {
  if (words.length === 0) return 0;

  const fieldsByType: Record<string, string[]> = {
    pool: ['type', 'pool', 'text'],
    node: ['type', 'node', 'text'],
    storage: ['type', 'pool', 'node', 'storage'],
  };
  const fields = fieldsByType[textValue(row.type)] || ['name', 'type', 'node', 'pool', 'vmid'];
  const values = fields.map((field) => textValue(row[field]).toLowerCase());
  const tags =
    typeof row.tags === 'string' ? row.tags.split(/[;, ]/).map((tag) => tag.toLowerCase()) : [];

  return values.concat(tags).reduce((score, value) => {
    if (!value) return score;
    return (
      score +
      words.reduce((wordScore, word) => {
        if (!value.includes(word)) return wordScore;
        return wordScore + (value === word ? 2 : 1);
      }, 0)
    );
  }, 0);
}

function canOpenResource(row: PveRecord) {
  return ['node', 'qemu', 'lxc', 'storage'].includes(textValue(row.type));
}

function openResource(row: PveRecord | undefined) {
  if (!row || !canOpenResource(row)) return;

  const node = textValue(row.node);
  const vmid = textValue(row.vmid);
  const type = textValue(row.type);

  if (type === 'qemu' && node && vmid) {
    void router.push({ name: 'computer-vm-detail', params: { node, vmid } });
  } else if (type === 'lxc' && node && vmid) {
    void router.push({ name: 'computer-ct-container-detail', params: { node, vmid } });
  } else if (type === 'node' && node) {
    void router.push({ name: 'host-node-detail', params: { node } });
  } else if (type === 'storage') {
    void router.push({ name: 'storage-list' });
  }

  resourceSearch.value = '';
  resourceSearchOpen.value = false;
}

function moveResourceSelection(direction: number) {
  const rows = filteredResources.value;
  if (rows.length === 0) return;
  const currentIndex = rows.findIndex(
    (row) => resourceId(row) === resourceId(selectedResourceRows.value[0] || {}),
  );
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), rows.length - 1);
  const nextRow = rows[nextIndex];
  if (nextRow) selectedResourceRows.value = [nextRow];
}

function openSelectedResource() {
  openResource(selectedResourceRows.value[0]);
}

function showResourceSearch() {
  resourceSearchOpen.value = true;
  void loadResources();
}

function toggleResourceSearch(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (!event.ctrlKey || !((event.shiftKey && key === 'f') || event.key === ' ')) return;

  event.preventDefault();
  if (resourceSearchOpen.value) {
    resourceSearchOpen.value = false;
    resourceSearchInput.value?.blur();
  } else {
    resourceSearchInput.value?.focus();
  }
}

async function loadResources() {
  resourcesLoading.value = true;
  try {
    const response = await getClusterResources();
    resources.value = response.data || [];
  } finally {
    resourcesLoading.value = false;
  }
}

function logout() {
  session.clearSession();
  void router.push({ name: 'user-login' });
}

onMounted(() => {
  document.addEventListener('keydown', toggleResourceSearch);
  refreshHandler = setInterval(() => {
    void session.refreshTicket();
  }, appConfig.keepAliveInterval);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', toggleResourceSearch);
  if (refreshHandler) clearInterval(refreshHandler);
});
</script>

<style scoped>
.header-resource-search {
  width: 280px;
  margin-right: 16px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.header-resource-search:focus-within {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.45);
}

.header-resource-search :deep(.q-field__control) {
  min-height: 32px;
  height: 32px;
}

.header-resource-search :deep(.q-field__prepend) {
  align-self: center;
  height: 32px;
  padding-right: 6px;
  color: rgba(255, 255, 255, 0.94);
}

.header-resource-search :deep(.header-resource-search__input) {
  align-self: center;
  line-height: 32px;
  color: rgba(255, 255, 255, 0.94);
}

.header-resource-search :deep(.header-resource-search__input::placeholder) {
  color: rgba(255, 255, 255, 0.72);
  opacity: 1;
}

.resource-search-menu {
  overflow: hidden;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
}
</style>
