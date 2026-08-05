<template>
  <q-card flat bordered class="nodes-card">
    <!-- 标题栏 -->
    <q-card-section class="nodes-card__header">
      <div class="row items-center justify-between">
        <div class="nodes-card__title">节点</div>

        <q-btn flat dense round size="sm" icon="chevron_right" color="grey-6" />
      </div>
    </q-card-section>

    <q-separator />

    <!-- 表格 -->
    <q-markup-table flat separator="horizontal" class="nodes-table">
      <thead>
        <tr>
          <th class="text-left">名称</th>
          <th class="text-left">ID</th>
          <th class="text-left">在线</th>
          <th class="text-left">支持</th>
          <th class="text-left">服务器地址</th>
          <th class="text-left">CPU 利用率</th>
          <th class="text-left">内存使用率</th>
          <th class="text-left">运行时间</th>
        </tr>
      </thead>

      <tbody>
        <!-- 节点 1 -->
        <tr>
          <td>
            <span class="node-name">pve-node-01</span>
          </td>

          <td>
            <span class="mono-text text-muted">1</span>
          </td>

          <td>
            <div class="status-text status-text--online">
              <q-icon name="check" size="15px" />
              <span>在线</span>
            </div>
          </td>

          <td>
            <span class="text-secondary">企业版</span>
          </td>

          <td>
            <span class="mono-text">192.168.1.101</span>
          </td>

          <td>
            <div class="usage-cell">
              <q-linear-progress
                :value="0.32"
                rounded
                size="6px"
                color="primary"
                track-color="blue-grey-1"
                class="usage-progress"
              />

              <span class="usage-value"> 32% </span>
            </div>
          </td>

          <td>
            <div class="usage-cell">
              <q-linear-progress
                :value="0.58"
                rounded
                size="6px"
                color="positive"
                track-color="blue-grey-1"
                class="usage-progress"
              />

              <span class="usage-value"> 58% </span>
            </div>
          </td>

          <td>
            <span class="mono-text text-muted"> 32天 16小时 </span>
          </td>
        </tr>

        <!-- 节点 2 -->
        <tr>
          <td>
            <span class="node-name">pve-node-02</span>
          </td>

          <td>
            <span class="mono-text text-muted">2</span>
          </td>

          <td>
            <div class="status-text status-text--online">
              <q-icon name="check" size="15px" />
              <span>在线</span>
            </div>
          </td>

          <td>
            <span class="text-secondary">企业版</span>
          </td>

          <td>
            <span class="mono-text">192.168.1.102</span>
          </td>

          <td>
            <div class="usage-cell">
              <q-linear-progress
                :value="0.46"
                rounded
                size="6px"
                color="primary"
                track-color="blue-grey-1"
                class="usage-progress"
              />

              <span class="usage-value"> 46% </span>
            </div>
          </td>

          <td>
            <div class="usage-cell">
              <q-linear-progress
                :value="0.64"
                rounded
                size="6px"
                color="positive"
                track-color="blue-grey-1"
                class="usage-progress"
              />

              <span class="usage-value"> 64% </span>
            </div>
          </td>

          <td>
            <span class="mono-text text-muted"> 28天 9小时 </span>
          </td>
        </tr>

        <!-- 节点 3 -->
        <tr>
          <td>
            <span class="node-name">pve-node-03</span>
          </td>

          <td>
            <span class="mono-text text-muted">3</span>
          </td>

          <td>
            <div class="status-text status-text--online">
              <q-icon name="check" size="15px" />
              <span>在线</span>
            </div>
          </td>

          <td>
            <span class="text-secondary">企业版</span>
          </td>

          <td>
            <span class="mono-text">192.168.1.103</span>
          </td>

          <td>
            <div class="usage-cell">
              <q-linear-progress
                :value="0.27"
                rounded
                size="6px"
                color="primary"
                track-color="blue-grey-1"
                class="usage-progress"
              />

              <span class="usage-value"> 27% </span>
            </div>
          </td>

          <td>
            <div class="usage-cell">
              <q-linear-progress
                :value="0.49"
                rounded
                size="6px"
                color="positive"
                track-color="blue-grey-1"
                class="usage-progress"
              />

              <span class="usage-value"> 49% </span>
            </div>
          </td>

          <td>
            <span class="mono-text text-muted"> 41天 3小时 </span>
          </td>
        </tr>
      </tbody>
    </q-markup-table>
  </q-card>
</template>

<script setup></script>

<style scoped>
.nodes-card {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* ---------------- header ---------------- */

.nodes-card__header {
  padding: 10px 14px;
}

.nodes-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* ---------------- table ---------------- */

.nodes-table {
  width: 100%;
  border-radius: 0;
}

.nodes-table :deep(table) {
  min-width: 760px;
}

/* 表头 */
.nodes-table :deep(thead tr) {
  background: #f7f9fc;
}

.nodes-table :deep(thead th) {
  height: 38px;
  padding: 0 12px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* 表格内容 */
.nodes-table :deep(tbody td) {
  height: 45px;
  padding: 0 12px;
  color: #3e4653;
  font-size: 12px;
  white-space: nowrap;
  border-color: #edf0f3;
}

.nodes-table :deep(tbody tr) {
  transition: background-color 0.15s ease;
}

.nodes-table :deep(tbody tr:hover) {
  background: #f7faff;
}

/* ---------------- name ---------------- */

.node-name {
  color: #1976d2;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.node-name:hover {
  color: #1565c0;
}

/* ---------------- status ---------------- */

.status-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.status-text--online {
  color: #27a474;
}

.status-text--offline {
  color: #e35d6a;
}

/* ---------------- resource progress ---------------- */

.usage-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-progress {
  width: 64px;
  flex-shrink: 0;
}

.usage-value {
  min-width: 30px;
  color: #7b8494;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ---------------- text ---------------- */

.mono-text {
  color: #3e4653;
  font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.text-muted {
  color: #8b94a3;
}

.text-secondary {
  color: #697386;
}
</style>
