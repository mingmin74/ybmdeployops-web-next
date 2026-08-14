<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import PermissionGroupsPage from './permission/PermissionGroupsPage.vue';
import APITokensPage from './permission/APITokensPage.vue';
import RealmPage from './permission/RealmPage.vue';
import RolesPage from './permission/RolesPage.vue';
import RulesPage from './permission/RulesPage.vue';
import TwoFactorPage from './permission/TwoFactorPage.vue';
import UsersPage from './UsersPage.vue';
import PoolsPage from './PoolsPage.vue';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const rulesPage = useTemplateRef<{ reload: () => Promise<void> }>('rulesPage');
const usersPage = useTemplateRef<{ reload: () => Promise<void> }>('usersPage');
const apiTokensPage = useTemplateRef<{ reload: () => Promise<void> }>('apiTokensPage');
const groupsPage = useTemplateRef<{ reload: () => Promise<void> }>('groupsPage');
const poolsPage = useTemplateRef<{ reload: () => Promise<void> }>('poolsPage');
const rolesPage = useTemplateRef<{ reload: () => Promise<void> }>('rolesPage');
const realmsPage = useTemplateRef<{ reload: () => Promise<void> }>('realmsPage');
const dcCaps = computed(
  () => (session.caps as unknown as { dc?: Record<string, unknown> }).dc || {}
);
const hasSysAudit = computed(() => Boolean(dcCaps.value['Sys.Audit']));
const validTabs = new Set([
  'permissions',
  'users',
  'apitokens',
  'tfa',
  'groups',
  'pools',
  'roles',
  'realms',
]);
const sysAuditTabs = new Set(['permissions', 'groups', 'pools', 'roles', 'realms']);
function isAllowedTab(tab: unknown): tab is string {
  return (
    typeof tab === 'string' && validTabs.has(tab) && (!sysAuditTabs.has(tab) || hasSysAudit.value)
  );
}
function resolveTab(tab: unknown) {
  return isAllowedTab(tab) ? tab : hasSysAudit.value ? 'permissions' : 'users';
}
const activeTab = shallowRef(resolveTab(route.query.tab));

watch(activeTab, (tab) => {
  if (route.query.tab === tab) return;
  void router.replace({ query: { ...route.query, tab } });
});

watch(hasSysAudit, (allowed) => {
  activeTab.value = allowed || !sysAuditTabs.has(activeTab.value) ? activeTab.value : 'users';
});

watch(activeTab, (tab) => {
  if (tab === 'permissions' && hasSysAudit.value) void rulesPage.value?.reload();
  if (tab === 'users') void usersPage.value?.reload();
  if (tab === 'apitokens') void apiTokensPage.value?.reload();
  if (tab === 'groups' && hasSysAudit.value) void groupsPage.value?.reload();
  if (tab === 'pools' && hasSysAudit.value) void poolsPage.value?.reload();
  if (tab === 'roles' && hasSysAudit.value) void rolesPage.value?.reload();
  if (tab === 'realms' && hasSysAudit.value) void realmsPage.value?.reload();
});

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = resolveTab(tab);
  }
);
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-card>
        <q-tabs
          v-model="activeTab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="left"
          narrow-indicator
        >
          <q-tab
            v-if="hasSysAudit"
            no-caps
            name="permissions"
            :label="gettext('Permissions')"
          />
          <q-tab
            no-caps
            name="users"
            :label="gettext('Users')"
          />
          <q-tab
            no-caps
            name="apitokens"
            :label="gettext('API Tokens')"
          />
          <q-tab
            no-caps
            name="tfa"
            :label="gettext('Two Factor')"
          />
          <q-tab
            v-if="hasSysAudit"
            no-caps
            name="groups"
            :label="gettext('Groups')"
          />
          <q-tab
            v-if="hasSysAudit"
            no-caps
            name="pools"
            :label="gettext('Pools')"
          />
          <q-tab
            v-if="hasSysAudit"
            no-caps
            name="roles"
            :label="gettext('Roles')"
          />
          <q-tab
            v-if="hasSysAudit"
            no-caps
            name="realms"
            :label="gettext('Realms')"
          />
        </q-tabs>
        <q-separator />
        <q-tab-panels
          v-model="activeTab"
          animated
        >
          <q-tab-panel
            v-if="hasSysAudit"
            name="permissions"
          >
            <RulesPage ref="rulesPage" />
          </q-tab-panel>
          <q-tab-panel name="users">
            <UsersPage
              ref="usersPage"
              embedded
            />
          </q-tab-panel>
          <q-tab-panel name="apitokens">
            <APITokensPage
              ref="apiTokensPage"
              embedded
            />
          </q-tab-panel>
          <q-tab-panel name="tfa"><TwoFactorPage /></q-tab-panel>
          <q-tab-panel
            v-if="hasSysAudit"
            name="groups"
          >
            <PermissionGroupsPage ref="groupsPage" />
          </q-tab-panel>
          <q-tab-panel
            v-if="hasSysAudit"
            name="pools"
          >
            <PoolsPage
              ref="poolsPage"
              embedded
            />
          </q-tab-panel>
          <q-tab-panel
            v-if="hasSysAudit"
            name="roles"
          >
            <RolesPage
              ref="rolesPage"
              embedded
            />
          </q-tab-panel>
          <q-tab-panel
            v-if="hasSysAudit"
            name="realms"
          >
            <RealmPage
              ref="realmsPage"
              embedded
            />
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </q-card>
  </div>
</template>
