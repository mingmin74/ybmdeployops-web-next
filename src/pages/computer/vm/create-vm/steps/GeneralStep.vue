<script setup lang="ts">
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import { gettext } from '@/locale';
import { useCreateVmWizardContext } from '../context/createVmWizardContext';

const { form, state, errors, resources, actions, derived } = useCreateVmWizardContext();
const { advanced } = state;
const { vmidError, tagInput, tagError, validationErrors } = errors;
const { pools } = resources;
const { validateVmid, addTag, removeTag } = actions;
const { tags, stepContentHeight } = derived;
</script>

<template>
  <q-scroll-area
    class="q-pa-sm vm-create-general"
    :style="{ height: stepContentHeight('general') }"
  >
    <div class="q-px-md q-py-sm u-border-dotted-blue bg-white">
      <div class="row q-gutter-lg">
        <div class="col">
          <NodeSelectTable
            v-model="form.node"
            disable-offline
            width="500px"
            :label="gettext('Node')"
              class="q-field--with-bottom"
            field-style="standard"
          />
          <q-input
            v-model="form.vmid"
            :error="Boolean(validationErrors.vmid || vmidError)"
            :error-message="validationErrors.vmid || vmidError"
            dense
            type="number"
            min="100"
            max="999999999"
            class="q-field--with-bottom"
            :label="gettext('VM ID')"
            @blur="void validateVmid()"
          />
          <q-checkbox
            v-model="form.haManaged"
            dense
            right-label
            color="primary"
            :label="gettext('Add to HA')"
          />
        </div>
        <div class="col">
          <q-select
            v-model="form.pool"
            dense
            clearable
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="pools.map((pool) => ({ label: pool.poolid, value: pool.poolid }))"
            :label="gettext('Pool')"
          />
          <q-input
            v-model="form.name"
            :error="Boolean(validationErrors.name)"
            :error-message="validationErrors.name"
            dense
            class="q-field--with-bottom"
            :label="gettext('Name')"
          />
        </div>
      </div>
    </div>
    <div v-if="advanced" class="q-mt-sm u-border-dotted-blue q-px-md q-py-sm bg-white">
      <div class="row q-gutter-lg">
        <div class="col column">
          <q-checkbox
            v-model="form.onboot"
            dense
            right-label
            color="primary"
            :label="gettext('Start at boot')"
          />
          <q-input
            v-model="form.startupDown"
            dense
            class="q-field--with-bottom"
            :label="gettext('Shutdown timeout')"
            :placeholder="gettext('default')"
          />
          <q-select
            v-model="form.arch"
            dense
            options-dense
            emit-value
            map-options
            class="q-field--with-bottom"
            :options="[
              { label: gettext('Default'), value: '__default__' },
              { label: 'x86_64', value: 'x86_64' },
              { label: 'aarch64', value: 'aarch64' },
            ]"
            :label="gettext('vCPU Architecture')"
          />
        </div>
        <div class="col column">
          <q-input
            v-model="form.startupOrder"
            dense
            class="q-field--with-bottom"
            :label="gettext('Start/Shutdown order')"
            :placeholder="gettext('any')"
          />
          <q-input
            v-model="form.startupUp"
            dense
            class="q-field--with-bottom"
            :label="gettext('Startup delay')"
            :placeholder="gettext('default')"
          />
        </div>
      </div>
      <div class="vm-create-tags">
        <div class="">{{ gettext('Tags') }}</div>
        <q-input
          v-model="tagInput"
          dense
          class="q-mb-md"
          :error="Boolean(tagError)"
          :error-message="tagError"
          :placeholder="gettext('Enter to add tag...')"
          @keyup.enter="addTag"
          @keyup.space="addTag"
          @blur="addTag"
        >
          <template #append>
            <q-icon name="add" class="cursor-pointer" @click="addTag" />
          </template>
        </q-input>
        <div class="row q-gutter-sm q-col-gutter-sm">
          <q-chip
            v-for="tag in tags"
            :key="tag"
            square
            size="12px"
            removable
            color="primary"
            text-color="white"
            @remove="removeTag(tag)"
          >
            {{ tag }}
          </q-chip>
        </div>
      </div>
    </div>
  </q-scroll-area>
</template>
