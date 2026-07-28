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

  Router.beforeEach(async (to) => {
    LoadingBar.start();
    const session = useSessionStore();

    if (to.meta.public) {
      return true;
    }

    if (to.matched.some((record) => record.meta.auth) && !session.isAuthenticated) {
      return { name: 'user-login', query: { redirect: to.fullPath } };
    }

    // The ticket response is the source of GuiCap in Proxmox. Restore it before
    // rendering protected pages after a browser refresh, because Pinia state is
    // in-memory and capabilities are not retained across reloads.
    if (to.matched.some((record) => record.meta.auth) && !Object.keys(session.caps).length) {
      await session.refreshTicket();
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
