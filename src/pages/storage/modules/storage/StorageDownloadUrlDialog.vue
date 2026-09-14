<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { downloadStorageUrl, queryUrlMetadata } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatBytes, textValue } from '@/utils/pveFormat';
const model = defineModel<boolean>({ required: true });
const props = defineProps<{ node: string; storage: string; content: string }>();
const emit = defineEmits<{ task: [upid: string] }>();
const loading = ref(false);
const form = reactive({
  url: '',
  filename: '',
  size: 0,
  mimetype: '',
  checksumAlgorithm: '__default__',
  checksum: '',
  verifyCertificates: true,
  compression: '__default__',
});
function clearMetadata() {
  form.size = 0;
  form.mimetype = '';
}
async function query() {
  if (!form.url.trim()) return;
  loading.value = true;
  try {
    const data =
      (await queryUrlMetadata(props.node, form.url.trim(), form.verifyCertificates)).data || {};
    let filename = textValue(data.filename);
    let compression = '__default__';
    if (props.content === 'iso') {
      const matches = filename.match(/^(.+)\.(gz|lzo|zst|bz2)$/i);
      if (matches) {
        filename = matches[1] || filename;
        compression = (matches[2] || '').toLowerCase();
      }
    }
    if (props.content === 'import' && filename.endsWith('.img')) filename += '.raw';
    Object.assign(form, {
      filename,
      size: Number(data.size) || 0,
      mimetype: textValue(data.mimetype),
      compression,
    });
  } finally {
    loading.value = false;
  }
}
async function download() {
  if (!form.url.trim() || !form.filename.trim()) return;
  loading.value = true;
  try {
    const data: Record<string, unknown> = {
      content: props.content,
      url: form.url.trim(),
      filename: form.filename.trim(),
      'verify-certificates': form.verifyCertificates ? 1 : 0,
      ...(props.content === 'iso' ? { compression: form.compression } : {}),
      ...(form.checksumAlgorithm !== '__default__'
        ? { 'checksum-algorithm': form.checksumAlgorithm, checksum: form.checksum.trim() }
        : {}),
    };
    const upid = String((await downloadStorageUrl(props.node, props.storage, data)).data || '');
    model.value = false;
    emit('task', upid);
  } finally {
    loading.value = false;
  }
}
watch(model, (visible) => {
  if (visible)
    Object.assign(form, {
      url: '',
      filename: '',
      size: 0,
      mimetype: '',
      checksumAlgorithm: '__default__',
      checksum: '',
      verifyCertificates: true,
      compression: '__default__',
    });
});
watch([() => form.url, () => form.verifyCertificates], clearMetadata);
</script>
<template>
  <q-dialog
    v-model="model"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Download from URL')"
      width="560px"
      :loading="loading"
    >
      <div class="q-pa-md">
        <div class="url-query-row">
          <q-input
            v-model="form.url"
            dense
            class="q-field--with-bottom"
            :label="gettext('URL')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button url-query-button"
            :label="gettext('Query URL')"
            @click="query"
          />
        </div>
        <q-input
          v-model="form.filename"
          dense
          class="q-field--with-bottom"
          :label="gettext('File name')"
        />
        <dl class="file-metadata">
          <div>
            <dt>{{ gettext('File size') }}</dt>
            <dd>{{ form.size ? formatBytes(form.size) : '-' }}</dd>
          </div>
          <div>
            <dt>{{ gettext('MIME type') }}</dt>
            <dd>{{ form.mimetype || '-' }}</dd>
          </div>
        </dl>
        <q-select
          v-model="form.checksumAlgorithm"
          dense
          class="q-field--with-bottom"
          options-dense
          emit-value
          map-options
          :label="gettext('Hash algorithm')"
          :options="[
            { label: gettext('none'), value: '__default__' },
            { label: 'SHA256', value: 'sha256' },
            { label: 'SHA512', value: 'sha512' },
            { label: 'MD5', value: 'md5' },
          ]"
        />
        <q-input
          v-model="form.checksum"
          dense
          class="q-field--with-bottom"
          :disable="form.checksumAlgorithm === '__default__'"
          :label="gettext('Checksum')"
        />
        <q-checkbox
          v-model="form.verifyCertificates"
          class="q-mb-md"
          color="primary"
          right-label
          dense
          :label="gettext('Verify certificates')"
        />
        <q-select
          v-if="content === 'iso'"
          v-model="form.compression"
          dense
          class="q-field--with-bottom"
          options-dense
          emit-value
          map-options
          :label="gettext('Decompression algorithm')"
          :options="[
            { label: gettext('none'), value: '__default__' },
            { label: 'LZO', value: 'lzo' },
            { label: 'GZIP', value: 'gz' },
            { label: 'ZSTD', value: 'zst' },
            { label: 'BZIP2', value: 'bz2' },
          ]"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button u-border-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="
            !form.url.trim() ||
            !form.filename.trim() ||
            (form.checksumAlgorithm !== '__default__' && !form.checksum.trim())
          "
          :label="gettext('Download')"
          @click="download"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.file-metadata {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin: 0 0 16px;
  padding: 12px;
  background: #f2f5fc;
  border-left: 2px solid #1976d2;
  font-size: 12px;
}

.file-metadata dt {
  margin-bottom: 4px;
  color: #666;
}

.file-metadata dd {
  margin: 0;
  color: #333;
  line-height: 1.6;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.url-query-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}

.url-query-button {
  margin-top: 8px;
}

@media (max-width: 400px) {
  .url-query-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .url-query-button {
    justify-self: end;
    margin: 0 0 12px;
  }
}
</style>
