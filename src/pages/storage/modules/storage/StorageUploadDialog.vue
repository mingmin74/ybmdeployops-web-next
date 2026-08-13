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
const file = ref<File>(); const filename = ref(''); const progress = ref(0); const uploading = ref(false); const checksumAlgorithm = ref('__default__'); const checksum = ref('');
let abortUpload: (() => void) | undefined;
let uploadAborted = false;
const accepted: Record<string, string[]> = { iso: ['.img', '.iso'], vztmpl: ['.tar.gz', '.tar.xz', '.tar.zst'], import: ['.ova', '.qcow2', '.raw', '.vmdk', '.img'] };
const accept = computed(() => (accepted[props.content] || []).join(','));
function selectFile(next: File | null) { if (!next) return; file.value = next; filename.value = props.content === 'import' && next.name.toLowerCase().endsWith('.img') ? `${next.name}.raw` : next.name; progress.value = 0; }
const validFilename = computed(() => (accepted[props.content] || []).filter((ext) => !(props.content === 'import' && ext === '.img')).some((ext) => filename.value.toLowerCase().endsWith(ext)));
async function upload() { if (!file.value || !validFilename.value) return; uploadAborted = false; uploading.value = true; try { const upid = await uploadStorageContent(props.node, props.storage, file.value, props.content, (value) => { progress.value = value; }, { filename: filename.value, checksumAlgorithm: checksumAlgorithm.value, checksum: checksum.value, onAbortReady: (abort) => { abortUpload = abort; } }); model.value = false; emit('task', upid); } catch (error) { if (!uploadAborted) Notify.create({ type: 'negative', message: error instanceof Error ? error.message : gettext('Upload failed') }); } finally { abortUpload = undefined; uploading.value = false; } }
function cancel() { if (uploading.value) { uploadAborted = true; abortUpload?.(); } model.value = false; }
watch(model, (visible) => { if (visible) { file.value = undefined; filename.value = ''; progress.value = 0; checksumAlgorithm.value = '__default__'; checksum.value = ''; } });
</script>
<template><q-dialog v-model="model" persistent><UWindow :title="gettext('Upload')" width="440px" :loading="uploading"><div class="q-pa-md q-gutter-md"><q-file :model-value="file" dense outlined :accept="accept" :label="gettext('File')" @update:model-value="selectFile" /><q-input v-model="filename" dense outlined :label="gettext('File name')" :error="!!filename && !validFilename" :error-message="gettext('Wrong file extension')" /><div>{{ gettext('File size') }}: {{ formatBytes(file?.size) }}</div><div>{{ gettext('MIME type') }}: {{ file?.type || '-' }}</div><q-select v-model="checksumAlgorithm" dense outlined emit-value map-options :label="gettext('Hash algorithm')" :options="[{ label: gettext('none'), value: '__default__' }, { label: 'SHA256', value: 'sha256' }, { label: 'SHA512', value: 'sha512' }, { label: 'MD5', value: 'md5' }]" /><q-input v-model="checksum" dense outlined :disable="checksumAlgorithm === '__default__'" :label="gettext('Checksum')" /><div class="text-caption text-grey-7">{{ gettext("Uploads are stored temporarily in '/var/tmp/', make sure there is enough free space.") }}</div><q-linear-progress v-if="uploading" :value="progress" color="primary" /></div><template #foot><q-btn no-caps flat :label="uploading ? gettext('Abort') : gettext('Cancel')" @click="cancel" /><q-btn no-caps flat color="primary" :disable="!file || !validFilename || uploading || (checksumAlgorithm !== '__default__' && !checksum.trim())" :label="gettext('Upload')" @click="upload" /></template></UWindow></q-dialog></template>
