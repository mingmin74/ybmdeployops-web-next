<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import UWindow from '@/components/UWindow.vue';
import { uploadStorageContent } from '@/api/storageContent';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/pveFormat';
const model = defineModel<boolean>({ required: true });
const props = defineProps<{ node: string; storage: string; content: string }>();
const emit = defineEmits<{ task: [upid: string] }>();
const file = ref<File>();
const filename = ref('');
const progress = ref(0);
const uploading = ref(false);
const checksumAlgorithm = ref('__default__');
const checksum = ref('');
let abortUpload: (() => void) | undefined;
let uploadAborted = false;
const accepted: Record<string, string[]> = {
  iso: ['.img', '.iso'],
  vztmpl: ['.tar.gz', '.tar.xz', '.tar.zst'],
  import: ['.ova', '.qcow2', '.raw', '.vmdk', '.img'],
};
const accept = computed(() => (accepted[props.content] || []).join(','));
function selectFile(next: File | null) {
  if (!next) return;
  file.value = next;
  filename.value =
    props.content === 'import' && next.name.toLowerCase().endsWith('.img')
      ? `${next.name}.raw`
      : next.name;
  progress.value = 0;
}
const validFilename = computed(() =>
  (accepted[props.content] || [])
    .filter((ext) => !(props.content === 'import' && ext === '.img'))
    .some((ext) => filename.value.toLowerCase().endsWith(ext))
);
async function upload() {
  if (!file.value || !validFilename.value) return;
  uploadAborted = false;
  uploading.value = true;
  try {
    const upid = await uploadStorageContent(
      props.node,
      props.storage,
      file.value,
      props.content,
      (value) => {
        progress.value = value;
      },
      {
        filename: filename.value,
        checksumAlgorithm: checksumAlgorithm.value,
        checksum: checksum.value,
        onAbortReady: (abort) => {
          abortUpload = abort;
        },
      }
    );
    model.value = false;
    emit('task', upid);
  } catch (error) {
    if (!uploadAborted)
      Notify.create({
        type: 'negative',
        message: error instanceof Error ? error.message : gettext('Upload failed'),
      });
  } finally {
    abortUpload = undefined;
    uploading.value = false;
  }
}
function cancel() {
  if (uploading.value) {
    uploadAborted = true;
    abortUpload?.();
  }
  model.value = false;
}
watch(model, (visible) => {
  if (visible) {
    file.value = undefined;
    filename.value = '';
    progress.value = 0;
    checksumAlgorithm.value = '__default__';
    checksum.value = '';
  }
});
</script>
<template>
  <q-dialog
    v-model="model"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Upload')"
      width="520px"
      :loading="uploading"
    >
      <div class="q-pa-md">
        <q-file
          :model-value="file"
          dense
          class="q-field--with-bottom"
          :accept="accept"
          :label="gettext('File')"
          @update:model-value="selectFile"
        >
          <template #prepend>
            <q-icon
              name="attach_file"
              size="18px"
            />
          </template>
        </q-file>
        <q-input
          v-model="filename"
          dense
          class="q-field--with-bottom"
          :label="gettext('File name')"
          :error="!!filename && !validFilename"
          :error-message="gettext('Wrong file extension')"
        />
        <dl class="file-metadata">
          <div>
            <dt>{{ gettext('File size') }}</dt>
            <dd>{{ formatBytes(file?.size) }}</dd>
          </div>
          <div>
            <dt>{{ gettext('MIME type') }}</dt>
            <dd>{{ file?.type || '-' }}</dd>
          </div>
        </dl>
        <q-select
          v-model="checksumAlgorithm"
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
          v-model="checksum"
          dense
          class="q-field--with-bottom"
          :disable="checksumAlgorithm === '__default__'"
          :label="gettext('Checksum')"
        />
        <div class="upload-hint text-caption text-grey-7">
          {{
            gettext(
              "Uploads are stored temporarily in '/var/tmp/', make sure there is enough free space."
            )
          }}
        </div>
        <q-linear-progress
          v-if="uploading"
          class="q-mt-md"
          :value="progress"
          color="primary"
        />
      </div>
      <template #foot>
        <q-btn
          no-caps
          flat
          size="12px"
          class="u-button u-border-button"
          :label="uploading ? gettext('Abort') : gettext('Cancel')"
          @click="cancel"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="
            !file ||
            !validFilename ||
            uploading ||
            (checksumAlgorithm !== '__default__' && !checksum.trim())
          "
          :label="gettext('Upload')"
          @click="upload"
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
.upload-hint {
  padding-top: 12px;
  border-top: 1px solid #dfe1e6;
  line-height: 1.7;
}
</style>
