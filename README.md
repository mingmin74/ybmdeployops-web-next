# ybmdeployops-web-next

## 0、项目说明

此项目是原 `webmanager` 的升级版前端工程。

核心目标：

**技术栈更新，业务逻辑和页面视觉尽量保持不变。**

老项目参考：

- 原项目：`C:\Users\depuser05\Desktop\work\pve\webmanager`
- Proxmox 源码参考：`C:\Users\depuser05\Desktop\work\pve\pve-manager`
- 旧项目记录：`C:\Users\depuser05\Desktop\work\pve\webmanager\EVS项目记录.md`
- PVE API 文档：https://pve.proxmox.com/pve-docs/api-viewer/index.html

当前第一阶段只搭基础壳，不直接复制所有业务页面。

第一阶段范围：

- 登录
- 主布局
- 顶部导航
- 左侧菜单
- 路由
- 权限
- 国际化
- 请求封装
- 全局错误处理
- 主题和全局样式

验收目标：

- 可以登录
- 可以访问 PVE 接口
- 菜单和旧项目基本一致
- 页面视觉先保持接近旧项目，后续迁移业务页面时再逐页对齐

## 1、技术栈

新项目使用 Vue 3 + Quasar 2 + Vite。

主要版本以 `package.json` 为准：

- Vue 3
- Quasar 2
- Vue Router
- Pinia
- TypeScript

Node 版本要求：

```bash
node >= 22.22.0
```

如果本机 Node 版本不满足，可以使用 nvm 自行切换。

## 2、运行命令

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

类型检查：

```bash
npm run typecheck
```

代码检查：

```bash
npm exec -- eslint -c ./eslint.config.js "./src*/**/*.{ts,js,cjs,mjs,vue}"
```

生产构建：

```bash
npm run build
```

## 3、代理配置

开发服务配置在 `quasar.config.ts`。

默认开发地址：

```text
https://localhost:88
```

PVE 代理：

```ts
proxy: {
  '/api2': {
    target: process.env.VITE_PVE_PROXY_TARGET ,
    ws: true,
    secure: false,
    changeOrigin: true,
  },
}
```

如需切换 PVE 后端地址，优先设置：

```bash
VITE_PVE_PROXY_TARGET=https://你的PVE地址:8006
```

注意：

旧项目里请求主要依赖 devServer proxy，和环境变量的关系不明显；新项目仍保留代理方式，但把目标地址集中到 `quasar.config.ts`，避免页面或 API 文件里散落硬编码地址。

## 4、路由约定

路由配置位置：

```text
src/router/routes.ts
```

当前基础壳路由：

- `/login`：登录页
- `/dashboard`：首页概览
- `/system/service`：系统 / 服务
- `/system/users`：系统 / 用户
- `/system/permissions`：系统 / 权限
- `/system/pools`：系统 / 资源池
- `/storage/disks`：存储 / 硬盘管理
- `/host/cluster`：主机 / 集群
- `/:section/:page`：第一阶段占位路由，用来承接菜单点击
- `/:catchAll(.*)*`：404

当前已迁移但不直接出现在左侧菜单的内部 tab 路由：

- `/system/permission/users`
- `/system/permission/groups`
- `/system/permission/roles`
- `/system/permission/realm`
- `/system/permission/api-tokens`
- `/storage/disks/disk`
- `/storage/disks/directory`
- `/storage/disks/lvm`
- `/storage/disks/lvmthin`
- `/storage/disks/zfs`

和旧项目不同：

旧项目路由最多只能稳定处理两级，超过两级容易出现页面空白。新项目使用 Vue Router 新版本，后续可以支持更清晰的嵌套路由，但迁移业务页面时仍建议先保持旧菜单层级和访问路径稳定。

## 5、请求封装

请求入口：

```text
src/api/request.ts
```

响应解析和错误封装：

```text
src/api/response.ts
```

业务 API 示例：

```text
src/api/system.ts
```

请求规则：

- URL 未以 `/api2` 开头时，自动补成 `/api2/extjs/...`
- GET 参数通过 query string 传递
- POST / PUT / DELETE 默认使用 `application/x-www-form-urlencoded`
- 如接口明确需要 JSON，调用时传 `json: true`
- 自动携带 Cookie：`credentials: include`
- 已登录状态下自动携带 `CSRFPreventionToken`
- 默认超时时间 60 秒

示例：

```ts
import { request } from '@/api/request';

export function getPveVersion() {
  return request('/version');
}

export function updateOptions(data: Record<string, unknown>) {
  return request('/nodes/{node}/qemu/{vmid}/config', {
    method: 'PUT',
    data,
  });
}
```

## 6、响应拦截和错误提示

新项目的响应处理参考 Proxmox 源码里的：

- `API2Request`
- `extractRequestError`
- `extractFormActionError`

PVE 常见响应格式：

```json
{
  "data": {},
  "success": true
}
```

错误响应可能包含：

```json
{
  "success": false,
  "message": "参数错误",
  "status": 400,
  "errors": {
    "field": "错误详情"
  }
}
```

处理规则：

- `success !== false`：视为成功
- `success === false`：抛出 `PveApiError`
- 有 `message` 时优先显示 `message`
- 有 `status` 时拼接到提示后面
- 有 `errors` 时展开为详情
- 401 时清理登录态并跳转 `/login`
- 超时显示 `Connection error - Timeout.`
- 网络异常显示 `Connection error - server offline?`

页面里不要重复解析 PVE 返回结构，优先使用统一的 `request()` 和模块 API。

## 7、登录和权限

登录状态管理：

```text
src/stores/session.ts
```

当前保存内容：

- username
- realm
- CSRFPreventionToken
- ticket Cookie
- cap 权限信息

路由权限在 `src/router/index.ts` 中处理：

- `meta.public`：公开页面
- `meta.auth`：需要登录

后续迁移业务页面时，页面权限判断应优先基于 PVE 返回的 `cap` 能力信息，不要在页面里写死临时权限。

## 8、国际化 / Locale

国际化配置目录：

```text
src/locale
```

当前项目不再使用 `src/i18n` 和 `$t(...)`。迁移页面时统一使用源代码风格：

```vue
{{ gettext('Dashboard') }}
```

```ts
import { gettext } from '@/locale';

gettext('Login failed');
```

约定：

- 默认语言是 `zh-CN`；`localStorage.locale` 未设置时必须显示中文
- 菜单、按钮、表单 label、错误提示都应走 `gettext(...)`
- Proxmox 源码已有词条优先复用 `src/locale/pve-lang-zh_CN.js`
- 新项目自定义词条补充到 `src/locale/zh-CN.ts` 和 `src/locale/en-US.ts`
- 迁移旧页面时，优先保留旧项目中的显示文案
- 新增文案同时补充 `zh-CN` 和 `en-US`

## 9、样式和主题

全局样式入口：

```text
src/css/app.scss
```

当前目标不是重新设计界面，而是保证：

- 主布局接近旧项目
- 菜单层级接近旧项目
- 登录和基础页面视觉稳定
- 后续业务页面迁移时逐页还原旧页面体验

不要在第一阶段大面积重做视觉风格。

## 10、迁移约定

后续迁移业务页面时建议遵守：

1. 先迁移页面入口和 API 模块，再补复杂交互。
2. 同一模块内，优先保持旧接口路径、参数名、返回处理方式。
3. 表单提交默认按 `x-www-form-urlencoded`，除非接口明确要求 JSON。
4. 不在页面里重复写请求拦截、错误提示、登录失效处理。
5. 旧项目的全局组件逻辑可以参考，但不要直接把 Vue2 写法硬搬进 Vue3。
6. 页面视觉以旧项目为基准，技术实现按 Vue3 + Quasar2 重写。

## 11、当前已完成

- 项目基础脚手架
- Vue3 + Quasar2 基础配置
- 登录页
- 主布局
- 顶部导航
- 左侧菜单
- 路由守卫
- Pinia 登录态
- locale / gettext
- PVE 请求封装
- PVE 响应和错误拦截
- 全局错误处理
- Dashboard 基础接口验证
- 系统-服务页面迁移样板：`/system/service`
- 系统-用户页面迁移：`/system/users`
- 系统-用户组页面迁移：`/system/groups`
- 简单表格页迁移：
  - 系统-资源池：`/system/pools`
  - 系统-权限：`/system/permissions`
  - 权限-用户：`/system/permissions` 内部 tab
  - 权限-用户组：`/system/permissions` 内部 tab
  - 权限-角色：`/system/permissions` 内部 tab
  - 权限-认证域：`/system/permissions` 内部 tab
  - 权限-API Tokens：`/system/permissions` 内部 tab
  - 存储-硬盘管理：`/storage/disks`
  - 存储-磁盘：`/storage/disks` 内部 tab
  - 存储-挂载点：`/storage/disks` 内部 tab
  - 存储-LVM：`/storage/disks` 内部 tab
  - 存储-LVM-Thin：`/storage/disks` 内部 tab
  - 存储-ZFS：`/storage/disks` 内部 tab
  - 主机-集群：`/host/cluster`

系统-服务页面当前包含：

- 节点下拉筛选
- 服务表格
- 启动 / 停止 / 重启
- 系统日志弹窗
- 任务 UPID 提示弹窗

系统-用户页面当前包含：

- 用户列表
- 搜索
- 新增 / 编辑用户
- 修改密码
- 删除用户
- 用户相关 PVE 接口封装

系统-用户组页面当前包含：

- 用户组列表
- 搜索
- 新增 / 编辑用户组
- 删除用户组
- 用户组相关 PVE 接口封装

简单表格页当前包含：

- 路由接入
- 左侧菜单接入
- 列表接口封装
- 搜索
- 刷新
- 旧项目风格表格
- 磁盘类页面节点筛选

已验证：

```bash
npm run typecheck
npm exec -- eslint -c ./eslint.config.js "./src*/**/*.{ts,js,cjs,mjs,vue}"
npm run build
```
