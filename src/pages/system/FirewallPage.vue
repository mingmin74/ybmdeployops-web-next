<script setup lang="ts">
import FirewallResourcePanel from './firewall/FirewallResourcePanel.vue';
</script>

<template>
  <div class="q-ma-md">
    <FirewallResourcePanel
      allow-iface
      show-groups
      show-aliases
      show-ipset
    />
  </div>
</template>
