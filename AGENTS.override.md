# AGENTS.override.md

## 迁移核心原则

本项目从老项目 `webmanager` 迁移到 Vue 3 + Quasar 2。

迁移页面时必须遵守：

**技术实现升级，业务逻辑和页面视觉尽量保持老项目一致。**

不要把页面重做成新的产品风格。老项目是 PVE 管理台式后台界面，视觉关键词是：

- 信息密度高
- 工具栏紧凑
- 表格为主
- 弹窗方正
- 按钮小尺寸
- 蓝色主色
- 少圆角
- 少阴影
- 少装饰

迁移页面前，必须先查看老项目对应页面和相关公共组件：

- 老项目页面：`C:\Users\depuser05\Desktop\work\pve\webmanager\src\pages`
- 老项目全局样式：`C:\Users\depuser05\Desktop\work\pve\webmanager\src\css\app.scss`
- 老项目弹窗组件：`C:\Users\depuser05\Desktop\work\pve\webmanager\src\components\Public\Window.vue`
- 老项目通用表单：`C:\Users\depuser05\Desktop\work\pve\webmanager\src\components\Public\FormTem.vue`

## 全局视觉基准

老项目全局样式以 `src/css/app.scss` 为准。

主要颜色：

- 主色：`#1976D2`
- 浅蓝背景：`#e6f1fc`
- 表头浅蓝背景：`#f2f5fc`
- 常规文字：`#333333`
- 次级文字：`#666666`
- 边框灰：`#cccccc`
- 表头边框：`#dfe1e6`
- 成功：`#21BF4B`
- 警告：`#fc0`
- 危险：`#FF6C59` / `#cf4c35`

基础形态：

- 业务页面不做大圆角。
- 弹窗、菜单、表格卡片尽量保持方角。
- 卡片多用 `no-shadow`、`no-border-radius`。
- 页面不要使用大面积渐变、营销式 hero、装饰性背景图。
- 操作型页面优先保证扫描效率，不追求视觉炫技。

## 表格样式

老项目大量页面以 `q-table` 为主，迁移时应优先复刻该模式。

默认结构：

```vue
<q-card class="q-ma-md q-mt-sm no-border-radius no-shadow">
  <q-card-section>
    <q-table
      flat
      row-key="id"
      table-header-class="u-table-header"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('no record can be found')"
    >
      <template #top>
        <!-- toolbar buttons -->
      </template>
    </q-table>
  </q-card-section>
</q-card>
```

表格规则：

- 表格外层通常是无阴影、无圆角的 `q-card`。
- `q-table` 常用 `flat`。
- 表头统一使用 `table-header-class="u-table-header"`。
- 表格默认不分页时使用 `:rows-per-page-options="[0]"`。
- 行高和表头高度约 `40px`。
- 单元格横向 padding 约 `16px`。
- 空数据文案使用 `gettext('no record can be found')`。
- 空数据插槽保持灰色居中提示。
- 表格工具栏放在 `#top` 插槽内。
- 工具栏左侧放主要操作按钮，右侧可放筛选器、节点选择、搜索等。
- 表格选择通常使用 `selection="single"` 或按原页面保持一致。
- 选中项状态决定按钮禁用和按钮颜色，不要改成交互完全不同的批量操作模式。

表头样式应接近：

```scss
.u-table-header {
  width: 100%;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
}
```

表格全局样式应接近：

```scss
.q-table__card {
  color: #333333 !important;
}

.q-table__top {
  padding: 0 0 10px 0;
}

.q-table th,
.q-table td {
  padding: 0 16px !important;
}

.q-table thead tr,
.q-table tbody td {
  height: 40px;
}
```

## 常用按钮样式

老项目按钮特点是小、方、低高度、无大圆角。

通用按钮类：

```scss
.u-button {
  border: 0 !important;
  min-height: 28px !important;
  border-radius: 0 !important;
}

.u-border-button {
  border: 1px solid #adb0b8 !important;
}

.q-btn {
  font-weight: normal;
}
```

迁移按钮时优先使用：

```vue
<q-btn
  no-caps
  outline
  size="12px"
  color="primary"
  class="u-button q-mr-sm"
  :label="gettext('Create')"
/>
```

常见规则：

- 文本按钮默认 `no-caps`。
- 操作按钮默认 `size="12px"`。
- 表格工具栏按钮常用 `outline`。
- 按钮高度保持紧凑，约 `28px`。
- 按钮圆角为 `0`。
- 普通主操作：`color="primary"`。
- 危险操作：`color="red"` 或 `bg-negative`，按老页面保持。
- 禁用按钮常用 `color="grey"`。
- 表单保存按钮常用 `flat` + 背景色类。

表单确认按钮状态：

```vue
<q-btn
  no-caps
  flat
  size="12px"
  :label="gettext('Save')"
  :class="isPass && !loading ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'"
/>
```

不要把旧页面的小工具按钮改成大号 `unelevated`、大圆角、整行按钮。

## 弹窗样式

老项目弹窗以 `q-dialog + u-window` 为主。

默认弹窗：

```vue
<q-dialog v-model="dialogVisible" persistent transition-show="scale" transition-hide="scale">
  <u-window :title="gettext('Title')" width="600px">
    <!-- content -->
    <template #foot>
      <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Save')" />
    </template>
  </u-window>
</q-dialog>
```

迁移到新项目时如果没有 `u-window`，应实现一个等价的页面局部结构，视觉保持：

- 弹窗外层 `q-card` 方角。
- 弹窗默认 `persistent`。
- 动画使用 `transition-show="scale"`、`transition-hide="scale"`。
- 弹窗宽度按旧页面保持，常见为 `400px`、`600px`、`780px`、`1180px`。
- 弹窗标题栏使用深蓝背景。
- 标题栏文字白色。
- 标题栏左侧有小 loading/spinner 图标的旧页面，迁移时尽量保留。
- 关闭按钮在右上角，红色背景，图标 `close`，小尺寸。
- 内容区域通常 `q-pa-none` 或内部自控 padding。
- footer 使用浅灰背景 `bg-grey-2`，右对齐。
- 弹窗内表单错误区域可隐藏，保持旧项目的紧凑感。

老项目 `u-window` 关键视觉：

```vue
<q-card :style="'max-width: ' + width + ';width:' + width + ';height: ' + height">
  <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
    <q-spinner-bars size="14px" color="white" />
    <div class="text-weight-bold q-mx-sm text-overflow">{{ title }}</div>
    <q-space />
    <q-btn class="bg-negative" icon="close" size="sm" flat dense />
  </q-card-section>
  <q-card-section class="q-pa-none u-hidden-error">
    <!-- body -->
  </q-card-section>
  <q-card-actions align="right" class="bg-grey-2 overflow-hidden">
    <!-- footer -->
  </q-card-actions>
</q-card>
```

全局弹窗方角：

```scss
.q-dialog__inner > div {
  border-radius: 0;
}
```

## 表单样式

老项目表单偏紧凑，字段间距小，常用 `dense`。

通用表单规则：

- 输入框使用 `dense`。
- 下拉框使用 `dense`、`options-dense`、`emit-value`、`map-options`。
- 表单字段 label 和输入文字字号偏小，约 `12px`。
- 字段错误提示通常隐藏或压缩，保持弹窗高度稳定。
- 表单外层常用 `u-border q-ma-sm q-pa-md`。
- 保存/添加按钮放在弹窗 footer 或右下角。
- 表单配置型页面可以参考老项目 `FormTem.vue`，但 Vue3 中应重写，不直接复制 Vue2 Options API 逻辑。

字段样式应接近：

```scss
.q-field__native,
.q-field__prefix,
.q-field__suffix,
.q-field__input {
  color: #666666;
  font-size: 12px;
}

.q-field__control-container .q-field__label {
  color: #333333;
}

.q-field--with-bottom {
  padding-bottom: 15px;
}

.q-field--outlined.q-field--focused .q-field__control::after {
  border-width: 1px !important;
}
```

紧凑输入：

```scss
.u-dense .q-field__control,
.u-dense .q-field__marginal {
  height: 30px !important;
}

.q-field--dense .q-field__control {
  height: 30px;
}
```

隐藏错误区域：

```scss
.u-hidden-error .q-field__bottom {
  display: none !important;
}
```

## 卡片和内容区

老项目卡片不是现代 dashboard 卡片风格，更多是内容容器。

常见结构：

```vue
<div class="q-ma-md">
  <q-card class="no-border-radius no-shadow">
    <q-card-section>
      <!-- toolbar / content -->
    </q-card-section>
  </q-card>

  <q-card class="q-mt-md no-shadow no-border-radius">
    <q-card-section class="no-padding">
      <div class="content-center u-main-area">
        <!-- table / details -->
      </div>
    </q-card-section>
  </q-card>
</div>
```

内容区样式：

```scss
.u-main-area {
  background-color: #ffffff;
  min-height: 100px;
  padding: 16px;
}

.u-content-area {
  border: 1px solid #cccccc;
  padding: 10px;
  margin: 10px 0;
  color: #333333;
}

.u-card-blue {
  background: #e9edfa;
  color: #333333;
}
```

迁移时：

- 不要把每个区块都做成悬浮大卡片。
- 不要给表格外层增加明显阴影。
- 不要加入新的大标题 hero 区。
- 页面标题、工具栏、表格应保持后台工具布局。

## 菜单和下拉

老项目菜单、弹出菜单是方角、紧凑、浅色背景。

```scss
.q-menu {
  overflow-x: hidden;
  font-size: 13px;
  border-radius: 0;
}

.q-menu .q-item.q-router-link--active,
.q-menu .q-item--active {
  background: #e6f1fc;
}

.q-btn-dropdown--simple .q-btn-dropdown__arrow {
  margin-left: 0 !important;
}
```

迁移规则：

- 下拉菜单保持小字号和方角。
- 菜单项不要改成大块卡片。
- 激活背景使用浅蓝 `#e6f1fc`。
- 下拉按钮也要使用 `u-button` 密度。

## 状态和颜色

常见状态颜色应沿用老项目：

```scss
.good {
  color: #21BF4B;
}

.warning {
  color: #fc0;
}

.critical {
  color: #FF6C59;
}

.faded {
  color: #cfcfcf;
}
```

表格状态列可使用 `q-badge`，例如服务状态：

```vue
<q-badge
  :color="row.state === 'running' ? 'green' : 'red'"
  :label="statusLabel"
/>
```

不要随意替换旧状态色，除非源页面已有新规则。

## 迁移检查清单

迁移任意老页面到新项目时，完成前必须检查：

- 是否查看了老项目同名页面。
- 表格是否保留 `flat`、`u-table-header`、约 40px 行高。
- 工具栏按钮是否为小尺寸、方角、`no-caps`。
- 弹窗是否为方角、蓝色标题栏、灰色 footer。
- 表单是否使用紧凑 `dense` 风格。
- 旧页面的按钮启用/禁用规则是否保留。
- 旧页面的空数据、加载、任务弹窗是否保留。
- 是否避免了新增大圆角、大阴影、大卡片、渐变背景。
- 是否所有可见文案都走 `gettext(...)`。
- 是否没有在页面里重复实现全局请求错误提示。

## 禁止事项

迁移页面时不要做以下事情：

- 不要为了“现代化”重设计页面视觉。
- 不要把表格工具页改成营销页或大卡片页。
- 不要使用大圆角按钮、大投影卡片、渐变背景作为默认风格。
- 不要把旧项目小按钮改成大号主按钮。
- 不要把弹窗改成圆角浮层或抽屉，除非旧页面本来就是抽屉。
- 不要直接复制 Vue2 组件代码到 Vue3 项目里运行。
- 不要跳过旧页面样式核对。

## 推荐实现方式

在新项目中可以逐步沉淀这些兼容类到全局样式：

- `.u-button`
- `.u-border-button`
- `.u-table-header`
- `.u-main-area`
- `.u-content-area`
- `.u-card-blue`
- `.u-hidden-error`
- `.u-dense`
- `.text-overflow`

公共弹窗建议实现一个 Vue3 版 `UWindow`，视觉对齐老项目 `Window.vue`。

公共表格建议实现轻量约定组件或组合函数，但不要牺牲页面和旧项目的结构一致性。
