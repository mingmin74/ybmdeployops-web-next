import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'user-login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true, title: 'Login' },
  },
  {
    path: '/',
    redirect: '/dashboard',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { auth: true },
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/pages/dashboard/DashboardPage.vue'),
        meta: { auth: true, title: 'Dashboard' },
      },
      {
        path: 'system/service',
        name: 'system-service',
        component: () => import('@/pages/system/ServicePage.vue'),
        meta: { auth: true, title: 'Service' },
      },
      {
        path: 'system/users',
        name: 'system-users',
        component: () => import('@/pages/system/UsersPage.vue'),
        meta: { auth: true, title: 'Users' },
      },
      {
        path: 'system/groups',
        name: 'system-groups',
        component: () => import('@/pages/system/GroupsPage.vue'),
        meta: { auth: true, title: 'Groups' },
      },
      {
        path: 'system/permissions',
        name: 'system-permissions',
        component: () => import('@/pages/system/PermissionPage.vue'),
        meta: { auth: true, title: 'Permissions' },
      },
      {
        path: 'system/pools',
        name: 'system-pools',
        component: () => import('@/pages/system/PoolsPage.vue'),
        meta: { auth: true, title: 'Pools' },
      },
      {
        path: 'system/permission/users',
        name: 'system-permission-users',
        component: () => import('@/pages/system/permission/PermissionUsersPage.vue'),
        meta: { auth: true, title: 'Users' },
      },
      {
        path: 'system/permission/groups',
        name: 'system-permission-groups',
        component: () => import('@/pages/system/permission/PermissionGroupsPage.vue'),
        meta: { auth: true, title: 'Groups' },
      },
      {
        path: 'system/permission/roles',
        name: 'system-permission-roles',
        component: () => import('@/pages/system/permission/RolesPage.vue'),
        meta: { auth: true, title: 'Roles' },
      },
      {
        path: 'system/permission/realm',
        name: 'system-permission-realm',
        component: () => import('@/pages/system/permission/RealmPage.vue'),
        meta: { auth: true, title: 'Realm' },
      },
      {
        path: 'system/permission/api-tokens',
        name: 'system-permission-api-tokens',
        component: () => import('@/pages/system/permission/APITokensPage.vue'),
        meta: { auth: true, title: 'APITokens' },
      },
      {
        path: 'storage/disks',
        name: 'storage-disks',
        component: () => import('@/pages/storage/DisksPage.vue'),
        meta: { auth: true, title: 'Disks Management' },
      },
      {
        path: 'storage/disks/disk',
        name: 'storage-disks-disk',
        component: () => import('@/pages/storage/disks/DiskPage.vue'),
        meta: { auth: true, title: 'Disk' },
      },
      {
        path: 'storage/disks/directory',
        name: 'storage-disks-directory',
        component: () => import('@/pages/storage/disks/DirectoryPage.vue'),
        meta: { auth: true, title: 'Directory' },
      },
      {
        path: 'storage/disks/lvm',
        name: 'storage-disks-lvm',
        component: () => import('@/pages/storage/disks/LVMPage.vue'),
        meta: { auth: true, title: 'LVM' },
      },
      {
        path: 'storage/disks/lvmthin',
        name: 'storage-disks-lvmthin',
        component: () => import('@/pages/storage/disks/LVMThinPage.vue'),
        meta: { auth: true, title: 'LVMThin' },
      },
      {
        path: 'storage/disks/zfs',
        name: 'storage-disks-zfs',
        component: () => import('@/pages/storage/disks/ZFSPage.vue'),
        meta: { auth: true, title: 'ZFS' },
      },
      {
        path: 'host/cluster',
        name: 'host-cluster',
        component: () => import('@/pages/host/ClusterPage.vue'),
        meta: { auth: true, title: 'Cluster' },
      },
      {
        path: ':section/:page',
        name: 'shell-placeholder',
        component: () => import('@/pages/shell/PlaceholderPage.vue'),
        meta: { auth: true },
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
