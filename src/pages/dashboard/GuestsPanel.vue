<template>
  <q-card flat bordered class="guests-card">
    <q-card-section class="guests-card__header">
      <div class="guests-card__title">客户</div>
    </q-card-section>

    <q-separator />

    <q-card-section class="guests-card__body">
      <div class="row">
        <!-- 虚拟机 -->
        <div class="col-6 guest-group">
          <div class="guest-group__title">虚拟机</div>

          <div class="guest-list">
            <div class="guest-item">
              <div class="guest-item__label">
                <q-icon name="play_circle" size="16px" class="text-positive" />
                <span>运行中</span>
              </div>

              <div class="guest-item__value">28</div>
            </div>

            <div class="guest-item">
              <div class="guest-item__label">
                <q-icon name="stop_circle" size="16px" class="guest-icon--muted" />
                <span>已停止</span>
              </div>

              <div class="guest-item__value">4</div>
            </div>
          </div>
        </div>

        <!-- LXC 容器 -->
        <div class="col-6 guest-group guest-group--border">
          <div class="guest-group__title">LXC 容器</div>

          <div class="guest-list">
            <div class="guest-item">
              <div class="guest-item__label">
                <q-icon name="play_circle" size="16px" class="text-positive" />
                <span>运行中</span>
              </div>

              <div class="guest-item__value">15</div>
            </div>

            <div class="guest-item">
              <div class="guest-item__label">
                <q-icon name="stop_circle" size="16px" class="guest-icon--muted" />
                <span>已停止</span>
              </div>

              <div class="guest-item__value">3</div>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts"></script>

<style scoped>
.guests-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* header */

.guests-card__header {
  padding: 10px 14px;
}

.guests-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* body */

.guests-card__body {
  padding: 14px;
}

/* group */

.guest-group {
  min-width: 0;
  padding: 0 16px;
}

.guest-group:first-child {
  padding-left: 4px;
}

.guest-group:last-child {
  padding-right: 4px;
}

.guest-group--border {
  border-left: 1px solid #edf0f3;
}

.guest-group__title {
  margin-bottom: 10px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
}

/* list */

.guest-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.guest-item {
  display: flex;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
}

.guest-item__label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7b8494;
  font-size: 12px;
}

.guest-item__value {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

.guest-icon--muted {
  color: #aeb5c0;
}
</style>
