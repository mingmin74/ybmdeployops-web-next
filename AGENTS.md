# Project Instructions (ybmdeployops-web-next)

## 写入通道约束（强制，适用于所有文件修改）

本工作区的 `apply_patch` 补丁工具因 Codex 的 reparse point 检测缺陷不可用
（工具在读取文件阶段误报 "path contains a reparse point"，路径实际完全正常）。

**禁止使用 apply_patch。** 所有文件修改一律通过 PowerShell 命令完成：

1. 修改前先用 `Get-Content` 读取目标文件原文；
2. 用 `Set-Content -Encoding utf8NoBOM` 或 `[IO.File]::WriteAllText` 写入完整新内容；
3. 写入后立即 `Get-Content` 校验内容，并 `git diff` 复核；
4. 只改动本次任务目标文件，不要触碰其他未提交文件
   （当前未提交文件：`src/pages/host/components/NodeDiskPanel.vue`、
   `src/api/host.ts`、`src/pages/host/components/NodeServicesPanel.vue`、
   `src/pages/host/components/NodeSystemOptionsPanel.vue`）；
5. 每完成一项修改，向用户报告 `git status` / `git diff --stat` 结果。

## 项目背景

- Vue 3 + Quasar 2 + TypeScript，基于 Proxmox PVE 原生前端改造；
- 行为等价 PVE 原生（`192.168.2.58006` / `pve-manager` 为参照源码）；
- 页面文案统一走 `gettext(...)`。
