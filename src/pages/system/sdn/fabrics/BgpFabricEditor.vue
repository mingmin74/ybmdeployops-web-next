<script setup lang="ts">
import FabricEditor from './FabricEditor.vue';
const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ fabricId?: string; disableIpPrefixEdit?: boolean }>();
defineEmits<{ saved: [] }>();
</script>
<template>
  <FabricEditor v-model="visible" protocol="bgp" v-bind="props" @saved="$emit('saved')" />
</template>
