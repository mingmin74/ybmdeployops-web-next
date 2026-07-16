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
