<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import {
  createCephPool,
  getCephPoolStatus,
  getCephRules,
  updateCephPool,
  type CephPoolPayload,
} from '@/api/ceph';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ submitted: [upid: string, title: string] }>();
const props = defineProps<{
  node: string;
  pool?: PveRecord | undefined;
  defaultSize?: number;
  defaultMinSize?: number;
}>();

const loading = shallowRef(false);
const submitting = shallowRef(false);
const advanced = shallowRef(false);
const rules = shallowRef<PveRecord[]>([]);
type PoolForm = {
  name: string;
  size: number;
  minSize: number;
  pgAutoscaleMode: 'warn' | 'on' | 'off';
  addStorages: boolean;
  crushRule: string;
  pgNum: number;
  targetSizeRatio: number | null;
  targetSize: number | null;
  pgNumMin: number | null;
  isErasure: boolean;
};
const form = reactive<PoolForm>({
  name: '',
  size: 3,
  minSize: 2,
  pgAutoscaleMode: 'on',
  addStorages: true,
  crushRule: '',
  pgNum: 128,
  targetSizeRatio: null as number | null,
  targetSize: null as number | null,
  pgNumMin: null as number | null,
  isErasure: false,
});

const isCreate = computed(() => !props.pool);
const title = computed(
  () => `${gettext(isCreate.value ? 'Create' : 'Edit')}: ${gettext('Ceph Pool')}`
);
const nameValid = computed(() => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(form.name.trim()));
const sizeValid = computed(() => Number.isInteger(form.size) && form.size >= 2 && form.size <= 7);
const minSizeValid = computed(
  () => Number.isInteger(form.minSize) && form.minSize >= 1 && form.minSize <= 7
);
const pgNumValid = computed(
  () => Number.isInteger(form.pgNum) && form.pgNum >= 1 && form.pgNum <= 32768
);
const pgNumMinValid = computed(
  () =>
    form.pgNumMin === null ||
    (Number.isInteger(form.pgNumMin) && form.pgNumMin >= 0 && form.pgNumMin <= 32768)
);
const targetRatioValid = computed(() => form.targetSizeRatio === null || form.targetSizeRatio >= 0);
const targetSizeValid = computed(() => form.targetSize === null || form.targetSize >= 0);
const canSubmit = computed(
  () =>
    nameValid.value &&
    sizeValid.value &&
    minSizeValid.value &&
    pgNumValid.value &&
    pgNumMinValid.value &&
    targetRatioValid.value &&
    targetSizeValid.value &&
    Boolean(form.crushRule)
);
const showMinSizeHalfWarning = computed(
  () => form.minSize < form.size / 2 && form.minSize !== form.size
);

const ruleOptions = computed(() =>
  rules.value.map((rule) => {
    const name = textValue(rule.name);
    return { label: name, value: name };
  })
);

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resetForm() {
  const pool = props.pool;
  form.name = textValue(pool?.pool_name || pool?.name);
  form.size = numberValue(pool?.size, props.defaultSize ?? 3);
  form.minSize = numberValue(pool?.min_size, props.defaultMinSize ?? 2);
  form.pgAutoscaleMode = (textValue(pool?.pg_autoscale_mode, 'on') ||
    'on') as typeof form.pgAutoscaleMode;
  form.addStorages = true;
  form.crushRule = textValue(pool?.crush_rule_name || pool?.crush_rule);
  form.pgNum = numberValue(pool?.pg_num, 128);
  form.targetSizeRatio =
    pool?.target_size_ratio === undefined ? null : numberValue(pool.target_size_ratio, 0);
  form.targetSize =
    pool?.target_size === undefined ? null : numberValue(pool.target_size, 0) / 1024 ** 3;
  form.pgNumMin = pool?.pg_num_min === undefined ? null : numberValue(pool.pg_num_min, 0);
  form.isErasure = textValue(pool?.type).toLowerCase() === 'erasure';
  advanced.value = !isCreate.value;
}

async function loadRules() {
  const response = await getCephRules(props.node);
  rules.value = response.data || [];
  if (!form.crushRule && ruleOptions.value.length)
    form.crushRule = ruleOptions.value[0]?.value || '';
}

async function open() {
  resetForm();
  loading.value = true;
  try {
    await loadRules();
    if (!isCreate.value && form.name) {
      const response = await getCephPoolStatus(props.node, form.name);
      const status = response.data || {};
      form.size = numberValue(status.size, form.size);
      form.minSize = numberValue(status.min_size, form.minSize);
      form.pgAutoscaleMode = (textValue(status.pg_autoscale_mode, form.pgAutoscaleMode) ||
        'on') as typeof form.pgAutoscaleMode;
      form.crushRule = textValue(status.crush_rule, form.crushRule);
      form.pgNum = numberValue(status.pg_num, form.pgNum);
      form.targetSizeRatio =
        status.target_size_ratio === undefined ? null : numberValue(status.target_size_ratio, 0);
      form.targetSize =
        status.target_size === undefined ? null : numberValue(status.target_size, 0) / 1024 ** 3;
      form.pgNumMin = status.pg_num_min === undefined ? null : numberValue(status.pg_num_min, 0);
    }
  } finally {
    loading.value = false;
  }
}

function payload(): CephPoolPayload {
  const data: CephPoolPayload = {
    size: form.size,
    min_size: form.minSize,
    pg_num: form.pgNum,
    pg_autoscale_mode: form.pgAutoscaleMode,
    crush_rule: form.crushRule,
    target_size_ratio: form.targetSizeRatio ?? 0,
  };
  if (isCreate.value) {
    data.name = form.name.trim();
    data.add_storages = form.addStorages;
  }
  if (form.targetSize !== null) data.target_size = `${form.targetSize}G`;
  if (form.pgNumMin !== null) data.pg_num_min = form.pgNumMin;
  return data;
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const response = isCreate.value
      ? await createCephPool(props.node, payload())
      : await updateCephPool(props.node, form.name, payload());
    visible.value = false;
    emit('submitted', textValue(response.data), title.value);
  } finally {
    submitting.value = false;
  }
}

watch(visible, (value) => {
  if (value) void open();
});
watch(
  () => form.size,
  (size) => {
    if (isCreate.value && Number.isFinite(size)) form.minSize = Math.round(size / 2);
  }
);
</script>

<template>
  <q-dialog
    v-model="visible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      width="720px"
      :title="title"
      :loading="loading || submitting"
    >
      <div class="q-pa-md">
        <div class="row q-gutter-lg">
          <div class="col">
            <q-input
              v-model="form.name"
              dense
              :readonly="!isCreate"
              autofocus
              class="q-field--with-bottom"
              :label="gettext('Name')"
              :error="Boolean(form.name) && !nameValid"
              :error-message="
                gettext('Pool name may contain letters, numbers, dot, underscore, and hyphen.')
              "
            />
            <q-input
              v-model.number="form.size"
              dense
              type="number"
              min="2"
              max="7"
              :disable="form.isErasure"
              class="q-field--with-bottom"
              :label="gettext('Size')"
              :error="!sizeValid"
              :error-message="gettext('Value must be between 2 and 7.')"
            />
          </div>
          <div class="col">
            <q-select
              v-model="form.pgAutoscaleMode"
              dense
              options-dense
              emit-value
              map-options
              class="q-field--with-bottom"
              :label="gettext('PG Autoscaler Mode')"
              :options="['warn', 'on', 'off'].map((value) => ({ label: value, value }))"
            />
            <q-checkbox
              v-if="isCreate"
              v-model="form.addStorages"
              dense
              right-label
              color="primary"
              :label="gettext('Add as Storage')"
            >
              <q-tooltip>
                {{ gettext('Add the new pool to the cluster storage configuration.') }}
              </q-tooltip>
            </q-checkbox>
          </div>
        </div>
        <q-expansion-item
          v-model="advanced"
          dense
          :label="gettext('Advanced')"
          header-class="text-primary q-px-none"
        >
          <div class="row q-gutter-lg q-pt-sm">
            <div class="col">
              <q-input
                v-model.number="form.minSize"
                dense
                type="number"
                min="1"
                max="7"
                :disable="form.isErasure"
                class="q-field--with-bottom"
                :label="gettext('Min. Size')"
                :error="!minSizeValid"
                :error-message="gettext('Value must be between 1 and 7.')"
              />
              <div
                v-if="form.minSize === 1"
                class="pool-hint"
              >
                {{ gettext('a min_size of 1 is not recommended and can lead to data loss') }}
              </div>
              <div
                v-else-if="showMinSizeHalfWarning"
                class="pool-hint"
              >
                {{
                  gettext(
                    'min_size < size/2 can lead to data loss, incomplete PGs or unfound objects.'
                  )
                }}
              </div>
              <q-select
                v-model="form.crushRule"
                dense
                options-dense
                emit-value
                map-options
                :disable="form.isErasure"
                class="q-field--with-bottom"
                :label="gettext('Crush Rule')"
                :options="ruleOptions"
              />
              <q-input
                v-model.number="form.pgNum"
                dense
                type="number"
                min="1"
                max="32768"
                class="q-field--with-bottom"
                label="# of PGs"
                :error="!pgNumValid"
                :error-message="gettext('Value must be between 1 and 32768.')"
              />
            </div>
            <div class="col">
              <q-input
                v-model.number="form.targetSizeRatio"
                dense
                type="number"
                min="0"
                step="0.001"
                class="q-field--with-bottom"
                :label="gettext('Target Ratio')"
                :error="!targetRatioValid"
              />
              <q-input
                v-model.number="form.targetSize"
                dense
                type="number"
                min="0"
                suffix="GiB"
                class="q-field--with-bottom"
                :label="gettext('Target Size')"
                :error="!targetSizeValid"
              />
              <div class="pool-hint">
                {{ gettext('Target Ratio takes precedence over Target Size.') }}
              </div>
              <q-input
                v-model.number="form.pgNumMin"
                dense
                type="number"
                min="0"
                max="32768"
                class="q-field--with-bottom"
                :label="gettext('Min. # of PGs')"
                :error="!pgNumMinValid"
              />
            </div>
          </div>
        </q-expansion-item>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canSubmit"
          :loading="submitting"
          :label="gettext(isCreate ? 'Create' : 'OK')"
          @click="submit"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.pool-hint {
  color: #8a6d3b;
  font-size: 12px;
  line-height: 1.4;
  margin: -8px 0 12px;
}
</style>
