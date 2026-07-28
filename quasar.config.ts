// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';

export default defineConfig(() => {
  const pveProxyTarget: string = process.env.VITE_PVE_PROXY_TARGET || 'https://192.168.1.228:8006';

  return {
    boot: ['locale', 'app-error'],

    css: ['app.scss'],

    extras: ['roboto-font', 'material-icons', 'fontawesome-v7'],

    build: {
      target: {},
      typescript: {
        strict: true,
        vueShim: true,
      },
      vueRouterMode: 'hash',
      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    devServer: {
      https: true,
      port: 88,
      open: false,
      proxy: {
        '/api2': {
          target: pveProxyTarget,
          ws: true,
          secure: false,
          changeOrigin: true,
        },
        '/shell': {
          target: pveProxyTarget,
          secure: false,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/shell/, ''),
        },
      },
    },

    framework: {
      iconSet: 'material-icons',
      lang: 'zh-CN',
      config: {
        loadingBar: { skipHijack: true },
        notify: { position: 'top', timeout: 2500 },
      },
      plugins: [
        'Notify',
        'Dialog',
        'Loading',
        'LoadingBar',
        'Cookies',
        'LocalStorage',
        'SessionStorage',
      ],
    },

    animations: [],

    ssr: {
      prodPort: 3000,
      middlewares: ['render'],
      pwa: false,
    },

    pwa: {
      workboxMode: 'GenerateSW',
    },

    capacitor: {
      hideSplashscreen: true,
    },

    electron: {
      preloadScripts: ['electron-preload'],
      inspectPort: 5858,
      bundler: 'packager',
      packager: {},
      builder: {
        appId: 'ybmdeployops-web-next',
      },
    },

    bex: {
      extraScripts: [],
    },
  };
});
