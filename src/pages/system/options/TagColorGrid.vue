<script setup lang="ts">
import { ref, watch } from 'vue';
import { gettext } from '@/locale';

interface TagColorEntry {
  tag: string;
  background: string;
  foreground: string;
}

const model = defineModel<string>({ default: '' });
const entries = ref<TagColorEntry[]>([]);

function parse(value: string) {
  return value.split(';').filter(Boolean).map((item) => {
    const [tag = '', background = '', foreground = ''] = item.split(':');
    return { tag, background, foreground };
  });
}

function syncModel() {
  model.value = entries.value
    .filter((entry) => entry.tag && entry.background)
    .map((entry) => [entry.tag, entry.background, entry.foreground].filter(Boolean).join(':'))
    .join(';');
}

watch(model, (value) => { entries.value = parse(value); }, { immediate: true });
watch(entries, syncModel, { deep: true });

function addEntry() {
  entries.value.push({ tag: '', background: '000000', foreground: '' });
}
</script>

<template>
  <div class="column q-gutter-sm">
    <div v-for="(entry, index) in entries" :key="index" class="row q-col-gutter-sm items-center">
      <q-input v-model="entry.tag" dense class="col" :label="gettext('Tag')" :rules="[(value) => /^[a-z0-9+_.-]+$/i.test(value) || gettext('Invalid tag')]" />
      <q-input v-model="entry.background" dense class="col" :label="gettext('Background Color')" :rules="[(value) => /^[0-9a-f]{6}$/i.test(value) || gettext('Use a 6-digit hexadecimal color')]" />
      <q-input v-model="entry.foreground" dense class="col" :label="gettext('Text Color')" :rules="[(value) => !value || /^[0-9a-f]{6}$/i.test(value) || gettext('Use a 6-digit hexadecimal color')]" />
      <q-btn flat dense round icon="delete" color="negative" @click="entries.splice(index, 1)" />
    </div>
    <q-btn flat dense no-caps align="left" icon="add" :label="gettext('Add')" @click="addEntry" />
  </div>
</template>
