export const appConfig = {
  productName: import.meta.env.VITE_PRODUCT_NAME || '云备姆超融合一体化系统',
  cookieName: import.meta.env.VITE_COOKIE_NAME || 'PVEAuthCookie',
  defaultRealm: import.meta.env.VITE_DEFAULT_REALM || 'pam',
  keepAliveInterval: 15 * 60 * 1000,
};
