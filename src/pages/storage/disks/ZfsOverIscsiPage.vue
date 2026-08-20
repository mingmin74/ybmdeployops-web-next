<script setup lang="ts">
import { gettext } from '@/locale';

defineProps<{ node?: string; embedded?: boolean }>();
</script>

<template>
  <section class="zfs-iscsi-placeholder q-pa-md full-height">
    <div class="row items-center q-mb-md zfs-iscsi-placeholder__title">
      <q-icon name="cloud_done" color="primary" size="18px" class="q-mr-sm" />
      <span>{{ gettext('ZFS over iSCSI') }}</span>
    </div>
    <q-card flat bordered class="text-grey-6 q-pa-md">
      <q-icon name="construction" size="32px" class="q-mr-sm text-grey-5" />
      <span class="text-sm">{{ gettext('Module under construction.') }}</span>
    </q-card>
    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12 col-md-4">
        <q-skeleton type="text" width="42%" />
        <q-skeleton type="rect" height="74px" />
      </div>
      <div class="col-12 col-md-4">
        <q-skeleton type="text" width="52%" />
        <q-skeleton type="rect" height="74px" />
      </div>
      <div class="col-12 col-md-4">
        <q-skeleton type="text" width="38%" />
        <q-skeleton type="rect" height="74px" />
      </div>
    </div>
    <q-skeleton class="q-mt-lg" type="rect" height="220px" />
  </section>
</template>

<style scoped>
.zfs-iscsi-placeholder {
  min-height: calc(100vh - 272px);
  background: #fff;
}
.zfs-iscsi-placeholder__title {
  font-size: 14px;
  color: #333;
}
</style>
