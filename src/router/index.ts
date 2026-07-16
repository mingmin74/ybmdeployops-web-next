import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
  type RouteLocationNormalized,
} from 'vue-router';
import { LoadingBar } from 'quasar';
import { useSessionStore } from '@/stores/session';
import routes from './routes';

declare module 'vue-router' {
  interface RouteMeta {
    auth?: boolean;
    public?: boolean;
    title?: string;
  }
}

function getDocumentTitle(to: RouteLocationNormalized) {
  return to.meta.title ? `${to.meta.title} - YBM DeployOps` : 'YBM DeployOps';
}

export default defineRouter(() => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
  });

  Router.beforeEach((to) => {
    LoadingBar.start();
    const session = useSessionStore();

    if (to.meta.public) {
      return true;
    }

    if (to.matched.some((record) => record.meta.auth) && !session.isAuthenticated) {
      return { name: 'user-login', query: { redirect: to.fullPath } };
    }

    return true;
  });

  Router.afterEach((to) => {
    document.title = getDocumentTitle(to);
    LoadingBar.stop();
  });

  Router.onError(() => {
    LoadingBar.stop();
  });

  return Router;
});
