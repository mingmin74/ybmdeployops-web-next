<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import { gettext } from '@/locale';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';

const { form, state, resources, errors } = useCreateCtWizardContext();
const { advanced } = state;
const { validationErrors } = errors;
const tagInput = shallowRef('');
const tagError = shallowRef('');
const sshKeyFileInput = useTemplateRef<HTMLInputElement>('sshKeyFileInput');
const tags = computed(() => form.tags.split(/[;, ]/).map((tag) => tag.trim()).filter(Boolean));
const passwordError = computed(() => validationErrors.value.password || (form.password && form.password.length < 5 ? gettext('Password must contain at least 5 characters.') : ''));
const confirmPasswordError = computed(() => validationErrors.value.confirmPassword || (form.confirmPassword && form.password !== form.confirmPassword ? gettext('Passwords do not match!') : ''));

function addTag() {
  const newTags = tagInput.value.split(/[;, ]/).map((tag) => tag.trim()).filter(Boolean);
  const invalidTag = newTags.find((tag) => !/^[\p{L}\p{N}\p{Pd}_.:]+$/u.test(tag));
  if (invalidTag) {
    tagError.value = gettext('Tags contain invalid characters.');
    return;
  }
  form.tags = [...new Set([...tags.value, ...newTags])].join(';');
  tagInput.value = '';
  tagError.value = '';
}

function removeTag(tag: string) {
  form.tags = tags.value.filter((item) => item !== tag).join(';');
}

function chooseSshKeyFile() {
  sshKeyFileInput.value?.click();
}

async function loadSshKey(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const key = (await file.text()).trim();
  if (key) form.sshkeys = form.sshkeys.trim() ? `${form.sshkeys.trim()}\n${key}` : key;
  input.value = '';
}

</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm">
      <div class="row q-gutter-lg">
        <div class="col">
          <NodeSelectTable v-model="form.node" disable-offline width="500px" field-style="standard" class="q-field--with-bottom" :label="gettext('Node')" :error="Boolean(validationErrors.node)" :error-message="validationErrors.node" />
          <q-input v-model="form.vmid" dense type="number" min="100" class="q-field--with-bottom" :label="gettext('VM ID')" :error="Boolean(validationErrors.vmid)" :error-message="validationErrors.vmid" />
          <q-input v-model="form.hostname" dense class="q-field--with-bottom" :label="gettext('Hostname')" :error="Boolean(validationErrors.hostname)" :error-message="validationErrors.hostname" />
          <q-checkbox v-model="form.unprivileged" dense right-label color="primary" :label="gettext('Unprivileged container')" />
          <q-checkbox v-model="form.featuresChecked" val="nesting" dense right-label color="primary" :disable="!form.unprivileged" :label="gettext('Nesting')" />
          <q-checkbox v-model="form.haManaged" dense right-label color="primary" :label="gettext('Add to HA')" />
        </div>
        <div class="col">
          <q-select v-model="form.pool" dense clearable options-dense emit-value map-options class="q-field--with-bottom" :options="resources.pools.value.map((pool) => ({ label: pool.poolid, value: pool.poolid }))" :label="gettext('Resource Pool')" />
          <q-input v-model="form.password" dense type="password" class="q-field--with-bottom" :error="Boolean(passwordError)" :error-message="passwordError" :label="gettext('Password')" />
          <q-input v-model="form.confirmPassword" dense type="password" class="q-field--with-bottom" :error="Boolean(confirmPasswordError)" :error-message="confirmPasswordError" :label="gettext('Confirm password')" />
          <q-input v-model="form.sshkeys" dense type="textarea" class="q-field--with-bottom" :label="gettext('SSH public key(s)')" />
          <input ref="sshKeyFileInput" class="hidden" type="file" accept=".pub,text/plain" @change="loadSshKey" />
          <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Load SSH Key File')" @click="chooseSshKeyFile" />
        </div>
      </div>
    </div>
    <div v-if="advanced" class="q-mt-sm u-border-dotted-blue q-px-md q-py-sm bg-white">
      <div class="ct-create-tags">
        <div>{{ gettext('Tags') }}</div>
        <q-input v-model="tagInput" dense class="q-mb-md" :error="Boolean(tagError)" :error-message="tagError" :placeholder="gettext('Enter to add tag...')" @keyup.enter="addTag" @keyup.space="addTag" @blur="addTag">
          <template #append><q-icon name="add" class="cursor-pointer" @click="addTag" /></template>
        </q-input>
        <div class="row q-gutter-sm q-col-gutter-sm">
          <q-chip v-for="tag in tags" :key="tag" square size="12px" removable color="primary" text-color="white" @remove="removeTag(tag)">{{ tag }}</q-chip>
        </div>
      </div>
    </div>
  </q-scroll-area>
</template>
