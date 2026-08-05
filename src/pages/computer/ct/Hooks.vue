<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    preEnabled: boolean;
    postEnabled: boolean;
    preHook: string;
    postHook: string;
  }>(),
  { preEnabled: false, postEnabled: false, preHook: '', postHook: '' },
);

const emit = defineEmits<{
  (e: 'update:preEnabled', v: boolean): void;
  (e: 'update:postEnabled', v: boolean): void;
  (e: 'update:preHook', v: string): void;
  (e: 'update:postHook', v: string): void;
}>();
</script>

<template>
  <div class="q-gutter-md">
    <div class="row items-center q-gutter-sm">
      <q-checkbox
        :model-value="props.preEnabled"
        @update:model-value="(v) => emit('update:preEnabled', v)"
        :label="$t ? $t('Enable Pre-create Hook') : 'Enable Pre-create Hook'"
      />
    </div>
    <q-input
      v-if="props.preEnabled"
      :model-value="props.preHook"
      type="textarea"
      autogrow
      dense
      outlined
      :label="$t ? $t('Pre-create Hook Script/Command') : 'Pre-create Hook Script/Command'"
      @input="(v: string) => emit('update:preHook', v)"
    />

    <div class="row items-center q-gutter-sm q-mt-md">
      <q-checkbox
        :model-value="props.postEnabled"
        @update:model-value="(v: boolean) => emit('update:postEnabled', v)"
        :label="$t ? $t('Enable Post-create Hook') : 'Enable Post-create Hook'"
      />
    </div>
    <q-input
      v-if="props.postEnabled"
      :model-value="props.postHook"
      type="textarea"
      autogrow
      dense
      outlined
      :label="$t ? $t('Post-create Hook Script/Command') : 'Post-create Hook Script/Command'"
      @input="(v: string) => emit('update:postHook', v)"
    />

    <q-banner class="q-mt-sm" dense>{{
      $t
        ? $t('Hook scripts will be stored and executed on the host during CT lifecycle events.')
        : 'Hook scripts will be stored and executed on the host during CT lifecycle events.'
    }}</q-banner>
  </div>
</template>
