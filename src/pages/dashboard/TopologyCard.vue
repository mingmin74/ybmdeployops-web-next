```vue
<template>
  <q-card flat bordered class="topology-card">
    <!-- 标题栏 -->
    <q-card-section class="topology-card__header">
      <div class="row items-center justify-between">
        <div class="topology-card__title">
          资源拓扑总览
        </div>

      
      </div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="topology-card__body">
      <!-- 拓扑图 -->
      <div class="topology-image">
        <q-img
          src="@/assets/overview/banner.png"
          alt="数据中心资源拓扑"
          fit="contain"
          class="topology-image__img"
        />
      </div>

 
    </q-card-section>
  </q-card>
</template>

<script setup>
</script>

<style scoped>
.topology-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* -------------------- header -------------------- */

.topology-card__header {
  padding: 10px 14px;
}

.topology-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

.topology-card__action {
  min-height: 28px;
  padding: 0 4px;
  font-size: 12px;
}

/* -------------------- body -------------------- */

.topology-card__body {
  padding: 12px;
}

/* -------------------- topology image -------------------- */

.topology-image {
  width: 100%;
  overflow: hidden;
  background: #f6f9fd;
  border-radius: 6px;
}

.topology-image__img {
  width: 100%;
  height: 400px;
}
</style>
```
