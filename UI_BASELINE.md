# UI_BASELINE.md

# 项目基础 UI 基准

本文件定义当前 Vue3 + Quasar 项目的基础 UI 样式。

项目虽然已经从 Vue2 + Quasar1 升级到 Vue3 + 当前版本 Quasar，但基础后台控件视觉仍延续旧项目 `webmanager`。

旧项目参考：

`C:\Users\depuser05\Desktop\work\pve\webmanager`

全局样式参考：

`C:\Users\depuser05\Desktop\work\pve\webmanager\src\css\app.scss`

旧弹窗：

`C:\Users\depuser05\Desktop\work\pve\webmanager\src\components\Public\Window.vue`

旧表单：

`C:\Users\depuser05\Desktop\work\pve\webmanager\src\components\Public\FormTem.vue`

如果当前 Vue3 项目已经存在正确的同类型实现，优先使用当前 Vue3 实现。

---

# 1. 基础风格

项目属于高信息密度后台管理系统。

基础视觉特点：

- 主色：`#1976D2`
- 小尺寸控件
- 紧凑工具栏
- 方角为主
- 少圆角
- 少阴影
- 表格为主
- 弹窗紧凑
- 不使用大面积现代 Material 卡片效果

基础颜色：

```text
主色        #1976D2
浅蓝背景    #e6f1fc
表头背景    #f2f5fc
普通文字    #333333
次级文字    #666666
边框        #cccccc
表头边框    #dfe1e6
成功        #21BF4B
警告        #fc0
危险        #FF6C59 / #cf4c35
2. 按钮基准

基础：

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
页面工具栏普通操作

默认：

<q-btn
  no-caps
  outline
  size="12px"
  color="primary"
  class="u-button q-mr-sm"
/>

适用于：

添加
编辑
分离
恢复
卷操作
调整大小
移动
普通工具操作

要求：

no-caps
outline
size="12px"
color="primary"
高度约 28px
方角

禁止无依据改成：

大型实心蓝按钮
大圆角
pill
大号 unelevated 按钮
危险操作

删除 / 移除：

使用当前项目已有的 red / negative 基准按钮。

不要显示成普通 primary 操作。

弹窗主操作

保存 / 添加 / 确定：

<q-btn
  no-caps
  flat
  size="12px"
  class="bg-primary text-grey-1 u-button"
/>

这是弹窗 footer 的实心主操作。

不要把工具栏 outline 规则套到弹窗确认按钮。

取消按钮

使用当前已有弹窗的方角边框型取消按钮。

3. 弹窗基准

优先复用当前项目公共 Window / 已有 Dialog 结构。

基础：

<q-dialog
  v-model="visible"
  persistent
  transition-show="scale"
  transition-hide="scale"
>
  <u-window :title="gettext('Title')" width="600px">
    <!-- content -->

    <template #foot>
      <!-- actions -->
    </template>
  </u-window>
</q-dialog>

视觉要求：

方角
蓝色标题栏
白色标题文字
右上角红色关闭按钮
白色正文
浅灰 footer
footer 操作靠右
persistent
scale 动画

全局：

.q-dialog__inner > div {
  border-radius: 0;
}

不要自行创建圆角现代 Dialog。

4. 弹窗表单项基准

这是强制基础样式。

普通弹窗中的：

q-input
q-select
数字字段
readonly 字段

默认使用：

Quasar standard 下划线样式。

q-input

正确：

<q-input
  dense
  class="q-field--with-bottom"
/>

默认禁止：

outlined
filled
standout
square

也不要通过 CSS 给普通输入框人工画完整矩形边框。

q-select

正确：

<q-select
  dense
  options-dense
  class="q-field--with-bottom"
/>

需要值映射：

emit-value
map-options

只有确实允许清空时才使用：

clearable

普通弹窗 select 默认禁止：

outlined
filled
standout
square
数字字段
<q-input
  v-model.number="value"
  dense
  type="number"
  class="q-field--with-bottom"
/>

min / max / step / 默认值 根据 Proxmox 业务源码决定。

readonly
<q-input
  dense
  readonly
  class="q-field--with-bottom"
/>

不要因为 readonly 改成另一种视觉。

5. Checkbox 基准

默认：

<q-checkbox
  dense
  right-label
  color="primary"
/>

保持：

小尺寸
标签在右
primary
普通文字颜色

不要使用大尺寸 Checkbox。

高级开关如果位于创建 / 编辑弹窗：

优先参考当前项目 VM 创建或硬件编辑弹窗，一般位于 footer 左侧。

6. 表单布局

普通两列表单：

<div class="row q-gutter-lg">
  <div class="col">
    <q-input
      dense
      class="q-field--with-bottom"
    />
  </div>

  <div class="col">
    <q-select
      dense
      options-dense
      class="q-field--with-bottom"
    />
  </div>
</div>

规则：

两列：row q-gutter-lg
小字段同行：row q-gutter-sm
普通字段：q-field--with-bottom
特殊短字段可以明确宽度
不在每个 scoped style 中重复定义全局字段高度

基础全局字段样式：

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

.q-field--dense .q-field__control {
  height: 30px;
}

.q-field--standard.q-field--dense .q-field__control,
.q-field--standard.q-field--dense .q-field__marginal {
  height: 40px;
}

如果 src/css/app.scss 已经存在，不要页面重复实现。

7. SelectTable

表格式选择优先复用：

SelectTable
NodeSelectTable

普通弹窗传：

field-style="standard"

内部表格：

flat
dense
hide-bottom
table-header-class="u-table-header"

搜索框：

borderless
dense
8. 表格基准

常规业务表格：

<q-table
  flat
  row-key="id"
  table-header-class="u-table-header"
  :rows-per-page-options="[0]"
  :no-data-label="gettext('no record can be found')"
/>

要求：

flat
u-table-header
行高约 40px
表头约 40px
高信息密度
无大圆角
无明显阴影
.u-table-header {
  width: 100%;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
}

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
9. 使用率

CPU、内存、磁盘、存储、资源池等百分比：

优先复用：

src/components/UsageProgress.vue

颜色：

>= 90       red
>= 80       warning
其他        primary

不要重复实现另一套进度条。

10. 工具栏 Select 例外

普通弹窗表单使用 standard。

页面顶部工具栏筛选器可以使用：

square
outlined
dense
options-dense
emit-value
map-options

例如：

时间范围
节点选择
聚合方式
页面筛选

工具栏控件高度约 28px。

不要把这条规则错误应用到弹窗 q-input / q-select。

11. 菜单
.q-menu {
  overflow-x: hidden;
  font-size: 13px;
  border-radius: 0;
}

.q-menu .q-item.q-router-link--active,
.q-menu .q-item--active {
  background: #e6f1fc;
}

保持：

方角
小字号
紧凑
浅色背景
12. 状态
online / running      绿色
offline / stopped     红色
unknown               灰色

基础：

.good {
  color: #21bf4b;
}

.warning {
  color: #fc0;
}

.critical {
  color: #ff6c59;
}

.faded {
  color: #cfcfcf;
}

不要随意创建新的状态颜色体系。

13. 页面视觉优化例外

本文件规定的是：

基础控件。

它不限制已经明确进行新设计的页面级布局。

例如：

Dashboard
概览
详情摘要
信息卡片
页面导航

可以进行新的页面设计。

但是即使页面整体重新设计：

普通业务按钮、Table、Dialog、Dialog Form 仍默认使用本文件基准。

只有用户明确要求某个区域采用不同视觉时例外。

14. “改成基准样式”的含义

用户说：

按钮和表单项样式不对，改成基准样式。

默认只处理相关基础控件。

按钮检查：

no-caps
size
outline / flat
primary / negative
u-button
高度
方角

表单检查：

dense
是否为 standard
是否错误使用 outlined
是否错误使用 filled
q-select 是否 options-dense
checkbox 是否使用项目标准
字段间距是否正确

保持业务逻辑和页面整体结构不变。

15. 最终原则

基础控件：

优先复用当前 Vue3 同类实现。

没有同类实现：

按照本文件。

本文件没有说明：

参考旧项目 webmanager。

Proxmox ExtJS：

只用于业务逻辑，不用于决定 Vue3 UI。


---

这样拆之后，我觉得会比刚才的 30 条版稳定很多。

尤其是以后你的正常对话就可以非常短，比如：

> 挂载点功能没问题了，但是按钮和表单项样式不对，改成基准样式。

AI 看到 `AGENTS.override.md` 后应该自动走：

**“基准样式” → 打开 `UI_BASELINE.md` → 只检查按钮和表单控件 → 不动业务逻辑。**

而当你说：

> 跟源码核对一下挂载点编辑逻辑。

就走：

**当前项目 → `pve-manager` → 不查 webmanager 业务逻辑。**

当你说：

> 这个页面跟旧项目样式差别有点大。

才会去 `webmanager` 看页面视觉。

这样三种意图基本就彻底分开了。
```
