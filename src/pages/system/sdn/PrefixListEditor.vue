<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getSdnPrefixList, saveSdnPrefixList } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

defineOptions({ name: 'CtPrefixListEditor' });

const visible = defineModel<boolean>({ default: false });
const loading = defineModel<boolean>('loading', { default: false });
const props = defineProps<{
  prefixListId?: string | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();

const isCreate = computed(() => !props.prefixListId);

const form = reactive({
  id: '',
});

function reset(data: PveRecord = {}) {
  Object.assign(form, {
    id: '',
    ...data,
  });
}

watch(visible, async (open) => {
  if (!open) return;
  reset();
  if (props.prefixListId) {
    loading.value = true;
    try {
      reset((await getSdnPrefixList(props.prefixListId)).data || {});
    } finally {
      loading.value = false;
    }
  }
});

function cleanPayload() {
  return {
    id: form.id.trim(),
  };
}

async function save() {
  if (!form.id.trim()) return;
  loading.value = true;
  try {
    await saveSdnPrefixList(props.prefixListId, cleanPayload());
    visible.value = false;
    emit('saved');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow
      :title="`${isCreate ? gettext('Add') : gettext('Edit')}: ${gettext('Prefix List')}`"
      width="460px"
      :loading="loading"
    >
      <div class="q-pa-md u-dense">
        <div class="u-border q-pa-md">
          <q-input
            v-model="form.id"
            dense
            :label="gettext('Name')"
            :disable="!isCreate"
            :error="!form.id.trim()"
            :error-message="gettext('This field is required')"
          />
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!form.id.trim()"
          :label="isCreate ? gettext('Create') : gettext('OK')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
