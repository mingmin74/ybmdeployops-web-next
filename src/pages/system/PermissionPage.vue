<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import PermissionGroupsPage from './permission/PermissionGroupsPage.vue';
import PermissionUsersPage from './permission/PermissionUsersPage.vue';
import APITokensPage from './permission/APITokensPage.vue';
import RealmPage from './permission/RealmPage.vue';
import RolesPage from './permission/RolesPage.vue';

const activeTab = shallowRef('rule');
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
          <q-tab no-caps name="rule" :label="gettext('Rules')" />
          <q-tab no-caps name="user" :label="gettext('Users')" />
          <q-tab no-caps name="group" :label="gettext('Groups')" />
          <q-tab no-caps name="role" :label="gettext('Roles')" />
          <q-tab no-caps name="realm" :label="gettext('Realm')" />
          <q-tab no-caps name="apitokens" :label="gettext('APITokens')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="activeTab" animated>
          <q-tab-panel name="rule">
            <div class="q-pa-md text-grey-7">{{ gettext('Framework placeholder') }}</div>
          </q-tab-panel>
          <q-tab-panel name="user">
            <PermissionUsersPage />
          </q-tab-panel>
          <q-tab-panel name="group">
            <PermissionGroupsPage />
          </q-tab-panel>
          <q-tab-panel name="role">
            <RolesPage embedded />
          </q-tab-panel>
          <q-tab-panel name="realm">
            <RealmPage embedded />
          </q-tab-panel>
          <q-tab-panel name="apitokens">
            <APITokensPage embedded />
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </q-card>
  </div>
</template>
