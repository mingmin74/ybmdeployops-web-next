/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_NAME?: string;
  readonly VITE_COOKIE_NAME?: string;
  readonly VITE_DEFAULT_REALM?: string;
  readonly VITE_PVE_BASE_URL?: string;
  readonly VITE_PVE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
