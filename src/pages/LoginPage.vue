<template>
  <div class="login-page">
    <!-- ==============================
         顶部导航
    =============================== -->
    <header class="login-header">
      <div class="header-brand">
        <div class="header-logo">
          <!-- YBM -->
          <img src="@/assets/logo.png" class="logo-image" alt="" srcset="" />
        </div>

        <div class="header-product-name">
          {{ appConfig.productName }}
        </div>
      </div>

      <nav class="header-actions">
        <button type="button" class="header-action">
          <q-icon name="menu_book" size="20px" />
          <span>产品文档</span>
        </button>

        <button type="button" class="header-action">
          <q-icon name="help_outline" size="20px" />
          <span>帮助中心</span>
        </button>

        <button type="button" class="header-action">
          <q-icon name="language" size="20px" />
          <span>简体中文</span>
          <q-icon name="keyboard_arrow_down" size="17px" />
        </button>
      </nav>
    </header>

    <!-- ==============================
         页面主体
    =============================== -->
    <main
      class="login-main"
      :style="{
        backgroundImage: `url(${loginBg})`,
      }"
    >
      <!--
        背景本身已经很浅，因此这里只保留极弱的左侧渐变，
        主要用于保证标题可读性。
      -->
      <div class="background-overlay" />

      <div class="main-layout">
        <!-- ==============================
             左侧产品介绍
        =============================== -->
        <section class="hero-section">
          <div class="hero-content">
            <h1 class="hero-title">
              构建统一、高效、可靠的
              <br />
              数据中心管理平台
            </h1>

            <p class="hero-description">计算、存储、网络一体化管理，助力智能运维与资源统一调度</p>

            <div class="feature-list">
              <!-- 高可用 -->
              <div class="feature-item">
                <div class="feature-icon feature-icon-ha">
                  <q-icon name="hexagon" size="37px" />

                  <q-icon class="feature-inner" name="sync_alt" size="16px" />
                </div>

                <span class="feature-name"> 高可用架构 </span>
              </div>

              <div class="feature-divider" />

              <!-- 资源调度 -->
              <div class="feature-item">
                <div class="feature-icon">
                  <q-icon name="view_in_ar" size="41px" />
                </div>

                <span class="feature-name"> 统一资源调度 </span>
              </div>

              <div class="feature-divider" />

              <!-- 智能运维 -->
              <div class="feature-item">
                <div class="feature-icon">
                  <q-icon name="monitor_heart" size="40px" />
                </div>

                <span class="feature-name"> 智能运维 </span>
              </div>

              <div class="feature-divider" />

              <!-- 数据安全 -->
              <div class="feature-item">
                <div class="feature-icon">
                  <q-icon name="verified_user" size="40px" />
                </div>

                <span class="feature-name"> 数据安全 </span>
              </div>
            </div>
          </div>
        </section>

        <!-- ==============================
             右侧登录区域
        =============================== -->
        <section class="login-section">
          <div class="login-card">
            <!-- 产品信息 -->
            <div class="login-brand">
              <div class="login-logo">
                <img src="@/assets/logo.png" class="logo-image" alt="" srcset="" />
              </div>

              <div class="login-brand-info">
                <h2>
                  {{ appConfig.productName }}
                </h2>

                <p>统一纳管虚拟化、容器、存储与网络资源</p>
              </div>
            </div>

            <!-- 登录表单 -->
            <q-form ref="loginFormRef" class="login-form" @submit="submitLogin">
              <!-- 用户名 -->
              <q-input
                v-model="form.username"
                outlined
                autofocus
                hide-bottom-space
                lazy-rules="ondemand"
                class="login-field"
                :placeholder="gettext('Username')"
                :rules="[(value) => Boolean(value) || gettext('Username is required')]"
              >
                <template #prepend>
                  <q-icon name="person_outline" class="field-icon" />
                </template>
              </q-input>

              <!-- 密码 -->
              <q-input
                v-model="form.password"
                outlined
                hide-bottom-space
                lazy-rules="ondemand"
                class="login-field"
                :type="showPassword ? 'text' : 'password'"
                :placeholder="gettext('Password')"
                :rules="[(value) => Boolean(value) || gettext('Password is required')]"
              >
                <template #prepend>
                  <q-icon name="lock_outline" class="field-icon" />
                </template>

                <template #append>
                  <q-btn
                    flat
                    round
                    dense
                    class="password-toggle"
                    :icon="showPassword ? 'visibility_off' : 'visibility'"
                    :aria-label="gettext('Toggle password visibility')"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>

              <!-- 认证域 -->
              <div class="realm-field">
                <div class="realm-label">
                  <q-icon name="domain" class="field-icon" />

                  <span>
                    {{ gettext('Realm') }}
                  </span>
                </div>

                <q-select
                  v-model="form.realm"
                  borderless
                  dense
                  emit-value
                  map-options
                  options-dense
                  class="realm-select"
                  dropdown-icon="keyboard_arrow_down"
                  :options="realmOptions"
                />
              </div>

              <!-- 记住我 -->
              <div class="remember-wrapper">
                <q-checkbox
                  v-model="form.remember"
                  dense
                  color="primary"
                  class="remember-checkbox"
                  :label="gettext('Remember me')"
                />
              </div>

              <!-- 登录按钮 -->
              <q-btn
                unelevated
                no-caps
                color="primary"
                type="submit"
                class="login-button"
                :loading="loading"
                :label="gettext('Login')"
              />
            </q-form>
          </div>
        </section>
      </div>
    </main>

    <!-- ==============================
         Footer
    =============================== -->
    <footer class="login-footer">
      <div class="footer-left">
        <span> © 2024 YBM. All Rights Reserved. </span>

        <span class="footer-line" />

        <span>
          {{ appConfig.productName }}
        </span>

        <span class="footer-line" />

        <span>V6.0.0</span>
      </div>

      <div class="footer-center">
        <div class="footer-info">
          <q-icon name="security" size="20px" />
          <span>国密合规支持</span>
        </div>

        <span class="footer-line" />

        <span>等保合规支持</span>
      </div>

      <div class="footer-right">
        <div class="footer-info">
          <q-icon name="headset_mic" size="20px" />
          <span> 技术支持：400-888-0755 </span>
        </div>

        <span class="footer-line" />

        <div class="footer-info">
          <q-icon name="mail_outline" size="19px" />

          <span> support@ybm.com </span>
        </div>

        <span class="footer-line" />

        <button type="button" class="footer-link">
          <span>官方网站</span>

          <q-icon name="open_in_new" size="17px" />
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { reactive, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Notify } from 'quasar';

import { appConfig } from '@/config/app';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

import loginBg from '@/assets/bg.png';

const route = useRoute();
const router = useRouter();

const session = useSessionStore();

const loading = shallowRef(false);
const showPassword = shallowRef(false);

const form = reactive({
  username: localStorage.getItem('username') || '',

  password: '',

  realm: localStorage.getItem('realm') || appConfig.defaultRealm,

  remember: localStorage.getItem('remember') === 'true',
});

const realmOptions = [
  {
    label: 'Linux PAM',
    value: 'pam',
  },
  {
    label: 'Proxmox VE',
    value: 'pve',
  },
];

async function submitLogin() {
  loading.value = true;

  try {
    const response = await session.login({
      username: form.username,
      password: form.password,
      realm: form.realm,
    });

    if (!response.success) {
      Notify.create({
        type: 'negative',
        message: response.message || gettext('Login failed'),
      });

      return;
    }

    if (form.remember) {
      localStorage.setItem('username', form.username);

      localStorage.setItem('realm', form.realm);

      localStorage.setItem('remember', 'true');
    } else {
      localStorage.removeItem('username');
      localStorage.removeItem('realm');
      localStorage.removeItem('remember');
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';

    await router.push(redirect === '/login' ? '/dashboard' : redirect);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* ==========================================================
   页面基础
========================================================== */

.login-page {
  --primary: #1976d2;
  --primary-light: #237fdb;

  width: 100%;
  height: 100vh;
  min-width: 1180px;
  min-height: 720px;

  display: flex;
  flex-direction: column;

  overflow: hidden;

  background: #f5f9fe;

  color: #1b2940;

  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

/* ==========================================================
   Header
========================================================== */

.login-header {
  position: relative;
  z-index: 20;

  width: 100%;
  height: 72px;
  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 34px;

  background: linear-gradient(100deg, #0863bd 0%, #0754a6 52%, #06448d 100%);

  color: #ffffff;
}

/* ---------- 品牌 ---------- */

.header-brand {
  height: 100%;

  display: flex;
  align-items: center;

  gap: 14px;
}

.header-logo {
  width: 56px;
  height: 56px;

  display: flex;
  align-items: center;
  justify-content: center;

  /* border:
    1px solid
    rgba(255, 255, 255, 0.38);

  border-radius: 9px;

  background:
    linear-gradient(
      145deg,
      #2688eb 0%,
      #0869d0 100%
    );

  box-shadow:
    inset 0 1px 5px
      rgba(255, 255, 255, 0.22),
    0 3px 10px
      rgba(3, 63, 131, 0.18);

  color: #ffffff;

  font-size: 20px;
  font-weight: 700;

  letter-spacing: 0.3px; */
}
.logo-image {
  width: 50px;
}
.header-product-name {
  color: #ffffff;

  font-size: 25px;
  line-height: 1;

  font-weight: 600;

  letter-spacing: 1px;

  white-space: nowrap;
}

/* ---------- 右侧操作 ---------- */

.header-actions {
  display: flex;
  align-items: center;

  gap: 44px;
}

.header-action {
  appearance: none;

  display: flex;
  align-items: center;

  gap: 8px;

  padding: 6px 0;

  border: none;

  background: transparent;

  color: rgba(255, 255, 255, 0.94);

  font-family: inherit;
  font-size: 15px;

  cursor: pointer;

  white-space: nowrap;

  transition: opacity 0.2s ease;
}

.header-action:hover {
  opacity: 0.78;
}

/* ==========================================================
   Main
========================================================== */

.login-main {
  position: relative;

  flex: 1;
  min-height: 0;

  overflow: hidden;

  background-repeat: no-repeat;
  background-size: cover;
  background-position: center center;
}

/*
  背景已经很浅，不再覆盖大面积白色遮罩。
  这里只给标题区域一个非常轻的渐变。
*/
.background-overlay {
  position: absolute;
  inset: 0;

  z-index: 0;

  pointer-events: none;

  background: linear-gradient(
    90deg,
    rgba(242, 249, 255, 0.18) 0%,
    rgba(242, 249, 255, 0.06) 28%,
    transparent 55%
  );
}

/* ---------- 主体布局 ---------- */

.main-layout {
  position: relative;
  z-index: 2;

  width: 100%;
  height: 100%;

  display: grid;

  grid-template-columns:
    minmax(600px, 1fr)
    500px;

  column-gap: clamp(30px, 3.5vw, 68px);

  padding: clamp(70px, 8vh, 102px) clamp(60px, 6vw, 118px) 48px clamp(90px, 7.2vw, 145px);
}

/* ==========================================================
   Hero
========================================================== */

.hero-section {
  position: relative;

  min-width: 0;
}

.hero-content {
  max-width: 700px;
}

/* ---------- 标题 ---------- */

.hero-title {
  margin: 0;

  color: #0864c6;

  font-size: clamp(39px, 2.55vw, 49px);

  line-height: 1.38;

  font-weight: 700;

  letter-spacing: 2px;

  text-shadow: 0 2px 8px rgba(25, 118, 210, 0.055);
}

/* ---------- 描述 ---------- */

.hero-description {
  margin: 20px 0 34px;

  color: #354760;

  font-size: clamp(15px, 1vw, 18px);

  line-height: 1.7;

  letter-spacing: 0.2px;
}

/* ==========================================================
   Feature
========================================================== */

.feature-list {
  display: flex;
  align-items: center;

  gap: 28px;
}

.feature-item {
  min-width: 94px;

  display: flex;
  flex-direction: column;
  align-items: center;

  gap: 7px;

  color: #273950;

  white-space: nowrap;
}

.feature-icon {
  position: relative;

  width: 52px;
  height: 52px;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #0875d8;
}

.feature-icon-ha {
  position: relative;
}

.feature-inner {
  position: absolute;

  left: 50%;
  top: 50%;

  transform: translate(-50%, -50%);

  color: #ffffff;
}

.feature-name {
  font-size: 15px;

  line-height: 1.4;
}

.feature-divider {
  width: 1px;
  height: 45px;

  margin-bottom: 21px;

  background: linear-gradient(
    to bottom,
    transparent 0%,
    #b6c8dc 18%,
    #b6c8dc 82%,
    transparent 100%
  );
}

/* ==========================================================
   登录区域
========================================================== */

.login-section {
  min-width: 0;

  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
}

/* ---------- 登录卡片 ---------- */

.login-card {
  width: 100%;
  max-width: 500px;

  margin-top: 4px;

  padding: 49px 37px 43px;

  border: 1px solid rgba(255, 255, 255, 0.82);

  border-radius: 18px;

  background: rgba(255, 255, 255, 0.955);

  box-shadow:
    0 18px 48px rgba(33, 81, 133, 0.14),
    0 5px 15px rgba(52, 86, 122, 0.055);
}

/* ==========================================================
   登录卡片品牌
========================================================== */

.login-brand {
  display: flex;
  align-items: center;

  gap: 18px;

  margin-bottom: 38px;
}

.login-logo {
  width: 72px;
  height: 72px;

  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 8px;

  /* background:
    linear-gradient(
      145deg,
      var(--primary-light),
      #0868ce
    ); */

  box-shadow: 0 7px 16px rgba(25, 118, 210, 0.17);

  color: #ffffff;

  font-size: 25px;
  font-weight: 700;

  letter-spacing: 0.4px;
}

.login-brand-info {
  min-width: 0;

  flex: 1;
}

.login-brand-info h2 {
  margin: 0 0 7px;

  overflow: hidden;

  color: #142238;

  font-size: clamp(20px, 1.35vw, 25px);

  line-height: 1.25;

  font-weight: 600;

  white-space: nowrap;
  text-overflow: ellipsis;
}

.login-brand-info p {
  margin: 0;

  overflow: hidden;

  color: #778499;

  font-size: 13px;

  line-height: 1.5;

  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ==========================================================
   Form
========================================================== */

.login-form {
  width: 100%;

  display: flex;
  flex-direction: column;

  gap: 19px;
}

/* ==========================================================
   Input
========================================================== */

.login-field {
  width: 100%;
}

.login-field :deep(.q-field__control) {
  height: 55px;

  border-radius: 7px;

  background: rgba(255, 255, 255, 0.82);

  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.login-field :deep(.q-field__control::before) {
  border: 1px solid #cad5e3;
}

.login-field:hover :deep(.q-field__control::before) {
  border-color: #98b7d9;
}

.login-field :deep(.q-field__control::after) {
  border: 1px solid var(--primary);

  transform: scale3d(1, 1, 1);
}

.login-field :deep(.q-field__native) {
  min-height: 55px;

  padding: 0 0 0 2px;

  color: #27384e;

  font-size: 15px;
}

.login-field :deep(.q-field__native::placeholder) {
  color: #728299;

  opacity: 1;
}

.login-field :deep(.q-field__prepend) {
  height: 55px;

  padding-right: 11px;
}

.login-field :deep(.q-field__append) {
  height: 55px;
}

.field-icon {
  color: #697d96;

  font-size: 22px;
}

.password-toggle {
  width: 34px;
  height: 34px;

  color: #6e8098;

  font-size: 18px;
}

/* ==========================================================
   Realm
========================================================== */

.realm-field {
  width: 100%;
  height: 55px;

  display: flex;
  align-items: center;

  padding-left: 13px;

  border: 1px solid #cad5e3;

  border-radius: 7px;

  background: rgba(255, 255, 255, 0.82);

  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.realm-field:hover {
  border-color: #98b7d9;
}

.realm-field:focus-within {
  border-color: var(--primary);

  box-shadow: 0 0 0 1px rgba(25, 118, 210, 0.03);
}

.realm-label {
  flex-shrink: 0;

  display: flex;
  align-items: center;

  gap: 11px;

  color: #69798f;

  font-size: 15px;
}

.realm-select {
  flex: 1;

  min-width: 0;
}

.realm-select :deep(.q-field__control) {
  min-height: 53px;
  height: 53px;

  padding: 0;
}

.realm-select :deep(.q-field__native) {
  min-height: 53px;

  justify-content: flex-end;

  padding: 0 8px 0 15px;

  color: #41536a;

  font-size: 15px;

  text-align: right;
}

.realm-select :deep(.q-field__append) {
  height: 53px;

  padding-left: 3px;
  padding-right: 8px;

  color: #63758d;
}

/* ==========================================================
   Remember
========================================================== */

.remember-wrapper {
  height: 28px;

  display: flex;
  align-items: center;
}

.remember-checkbox {
  color: #34465e;
}

.remember-checkbox :deep(.q-checkbox__label) {
  padding-left: 4px;

  color: #35475e;

  font-size: 14px;
}

/* ==========================================================
   Login button
========================================================== */

.login-button {
  width: 100%;
  height: 55px;

  margin-top: 2px;

  border-radius: 6px;

  background: linear-gradient(90deg, var(--primary) 0%, #0874db 100%) !important;

  color: #ffffff;

  font-size: 17px;

  font-weight: 500;

  letter-spacing: 2px;

  box-shadow: 0 6px 15px rgba(25, 118, 210, 0.18);

  transition:
    filter 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.1s ease;
}

.login-button:hover {
  filter: brightness(1.04);

  box-shadow: 0 8px 20px rgba(25, 118, 210, 0.23);
}

.login-button:active {
  transform: translateY(1px);
}

/* ==========================================================
   Footer
========================================================== */

.login-footer {
  position: relative;
  z-index: 20;

  width: 100%;
  height: 67px;

  flex-shrink: 0;

  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    auto
    minmax(0, 1fr);

  align-items: center;

  column-gap: 24px;

  padding: 0 34px;

  border-top: 1px solid rgba(202, 218, 235, 0.48);

  background: rgba(250, 252, 255, 0.98);

  color: #65758b;

  font-size: 12px;
}

.footer-left,
.footer-center,
.footer-right {
  min-width: 0;

  display: flex;
  align-items: center;

  white-space: nowrap;
}

.footer-left {
  justify-content: flex-start;

  gap: 13px;
}

.footer-center {
  justify-content: center;

  gap: 13px;
}

.footer-right {
  justify-content: flex-end;

  gap: 13px;
}

.footer-info {
  display: flex;
  align-items: center;

  gap: 6px;
}

.footer-line {
  width: 1px;
  height: 17px;

  flex-shrink: 0;

  background: #c2cedb;
}

.footer-link {
  appearance: none;

  display: flex;
  align-items: center;

  gap: 5px;

  padding: 0;

  border: none;

  background: transparent;

  color: inherit;

  font-family: inherit;
  font-size: inherit;

  cursor: pointer;

  transition: color 0.2s ease;
}

.footer-link:hover {
  color: var(--primary);
}

/* ==========================================================
   1600 以下
========================================================== */

@media (max-width: 1600px) {
  .main-layout {
    grid-template-columns:
      minmax(550px, 1fr)
      455px;

    padding-left: 85px;
    padding-right: 70px;

    column-gap: 40px;
  }

  .hero-title {
    font-size: 42px;
  }

  .hero-description {
    font-size: 16px;
  }

  .feature-list {
    gap: 22px;
  }

  .feature-item {
    min-width: 84px;
  }

  .feature-name {
    font-size: 14px;
  }

  .login-card {
    max-width: 455px;

    padding: 43px 32px 38px;
  }

  .login-logo {
    width: 66px;
    height: 66px;

    font-size: 23px;
  }

  .login-brand-info h2 {
    font-size: 22px;
  }

  .header-product-name {
    font-size: 23px;
  }

  .header-actions {
    gap: 33px;
  }
}

/* ==========================================================
   1366 左右
========================================================== */

@media (max-width: 1400px) {
  .login-page {
    min-width: 1100px;
  }

  .login-header {
    height: 66px;

    padding: 0 26px;
  }

  .header-logo {
    width: 50px;
    height: 50px;

    font-size: 18px;
  }

  .header-product-name {
    font-size: 21px;
  }

  .header-action {
    font-size: 14px;
  }

  .main-layout {
    grid-template-columns:
      minmax(500px, 1fr)
      420px;

    padding: 58px 55px 36px 68px;

    column-gap: 32px;
  }

  .hero-title {
    font-size: 38px;
  }

  .hero-description {
    margin: 17px 0 27px;

    font-size: 15px;
  }

  .feature-list {
    gap: 16px;
  }

  .feature-item {
    min-width: 76px;
  }

  .feature-icon {
    width: 46px;
    height: 46px;
  }

  .feature-divider {
    height: 39px;
  }

  .feature-name {
    font-size: 13px;
  }

  .login-card {
    max-width: 420px;

    padding: 35px 29px 32px;
  }

  .login-brand {
    margin-bottom: 29px;
  }

  .login-logo {
    width: 59px;
    height: 59px;

    font-size: 21px;
  }

  .login-brand-info h2 {
    font-size: 20px;
  }

  .login-brand-info p {
    font-size: 12px;
  }

  .login-form {
    gap: 15px;
  }

  .login-field :deep(.q-field__control),
  .login-field :deep(.q-field__native),
  .login-field :deep(.q-field__prepend),
  .login-field :deep(.q-field__append) {
    height: 50px;
    min-height: 50px;
  }

  .realm-field {
    height: 50px;
  }

  .realm-select :deep(.q-field__control),
  .realm-select :deep(.q-field__native),
  .realm-select :deep(.q-field__append) {
    height: 48px;
    min-height: 48px;
  }

  .login-button {
    height: 50px;
  }

  .login-footer {
    height: 60px;

    padding: 0 26px;

    font-size: 11px;
  }
}

/* ==========================================================
   低高度屏幕
========================================================== */

@media (max-height: 800px) {
  .login-page {
    min-height: 660px;
  }

  .login-header {
    height: 64px;
  }

  .login-footer {
    height: 58px;
  }

  .main-layout {
    padding-top: 42px;
    padding-bottom: 28px;
  }

  .hero-title {
    font-size: 37px;
  }

  .hero-description {
    margin: 14px 0 22px;
  }

  .login-card {
    margin-top: 0;

    padding-top: 31px;
    padding-bottom: 29px;
  }

  .login-brand {
    margin-bottom: 25px;
  }

  .login-form {
    gap: 13px;
  }
}
</style>
