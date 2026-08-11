<script setup lang="ts">
import NodeEditor from './NodeEditor.vue';
const visible = defineModel<boolean>({ default: false });
const props = defineProps<{
  fabricId: string;
  nodeId?: string;
  disallowedNodes?: string[];
  fabricIpPrefix?: string;
  fabricIp6Prefix?: string;
}>();
defineEmits<{ saved: [] }>();
</script>
<template>
  <NodeEditor v-model="visible" protocol="bgp" v-bind="props" @saved="$emit('saved')" />
</template>
