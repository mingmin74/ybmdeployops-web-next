// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';

export default defineConfig((ctx) => {
  return {
    boot: ['i18n', 'app-error'],

    css: ['app.scss'],

    extras: ['roboto-font', 'material-icons'],

    build: {
      target: {},
      typescript: {
        strict: true,
        vueShim: true,
      },
      vueRouterMode: 'hash',
      vitePlugins: [
        [
          '@intlify/unplugin-vue-i18n/vite',
          {
            ssr: ctx.modeName === 'ssr',
            include: [ctx.appPaths.resolve.app('src/i18n')],
          },
        ],
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
          target: process.env.VITE_PVE_PROXY_TARGET || 'https://192.168.2.111:8006',
          ws: true,
          secure: false,
          changeOrigin: true,
        },
        '/shell': {
          target: process.env.VITE_PVE_PROXY_TARGET || 'https://192.168.2.111:8006',
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
      plugins: ['Notify', 'Dialog', 'Loading', 'LoadingBar', 'Cookies', 'LocalStorage', 'SessionStorage'],
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


