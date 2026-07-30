<script setup lang="ts">import { gettext } from '@/locale'; const form = defineModel<{ cdrom: string }>('form', { required: true });</script>
<template><q-input v-model="form.cdrom" dense square outlined :label="gettext('CD/DVD Drive')" /></template>
