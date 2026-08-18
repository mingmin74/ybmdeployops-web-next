<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import { gettext } from '@/locale';

type IdMapEntry = { type: 'u' | 'g'; ct: string; host: string; length: string };

const model = defineModel<string>({ default: '' });
const passthrough = shallowRef(false);
const entries = reactive<IdMapEntry[]>([]);
let syncing = false;

function isInteger(value: string, minimum: number) {
  return /^\d+$/.test(value) && Number(value) >= minimum;
}

function parse(value: string) {
  entries.splice(0, entries.length);
  passthrough.value = value === 'passthrough';
  if (!value || passthrough.value) return;
  value.split(';').forEach((item) => {
    const [type, ct, host, length] = item.split(':');
    if (
      (type === 'u' || type === 'g') &&
      ct !== undefined &&
      host !== undefined &&
      length !== undefined
    )
      entries.push({ type, ct, host, length });
  });
}

function sync() {
  const value = passthrough.value
    ? 'passthrough'
    : entries
        .filter(
          (entry) =>
            isInteger(entry.ct, 0) && isInteger(entry.host, 0) && isInteger(entry.length, 1)
        )
        .map((entry) => `${entry.type}:${entry.ct}:${entry.host}:${entry.length}`)
        .join(';');
  if (model.value === value) return;
  syncing = true;
  model.value = value;
}

function setPassthrough(value: boolean) {
  passthrough.value = value;
  sync();
}

function add() {
  entries.push({ type: 'u', ct: '', host: '', length: '' });
}

function remove(index: number) {
  entries.splice(index, 1);
  sync();
}

function clear() {
  entries.splice(0, entries.length);
  sync();
}

/**
 * Validity of the whole idmap form. Empty idmap and passthrough are valid;
 * any visible row with a blank/out-of-range value makes the form invalid.
 * The parent must gate Add/Save on this — serialization alone silently drops
 * incomplete rows, which must never be treated as "the form is valid".
 */
function isValid() {
  if (passthrough.value) return true;
  return entries.every(
    (entry) => isInteger(entry.ct, 0) && isInteger(entry.host, 0) && isInteger(entry.length, 1)
  );
}

defineExpose({ isValid });

watch(
  model,
  (value) => {
    if (syncing) {
      syncing = false;
      return;
    }
    parse(value);
  },
  { immediate: true }
);
</script>

<template>
  <div class="ct-idmap-field">
    <q-checkbox
      :model-value="passthrough"
      dense
      color="primary"
      :label="gettext('Passthrough')"
      @update:model-value="setPassthrough(Boolean($event))"
    />
    <template v-if="!passthrough">
      <div class="ct-idmap-field__grid">
        <div class="ct-idmap-field__header">{{ gettext('ID Type') }}</div>
        <div class="ct-idmap-field__header">{{ gettext('Container ID') }}</div>
        <div class="ct-idmap-field__header">{{ gettext('Host ID') }}</div>
        <div class="ct-idmap-field__header">{{ gettext('Range Size') }}</div>
        <div />
        <template
          v-for="(entry, index) in entries"
          :key="index"
        >
          <q-select
            :model-value="entry.type"
            dense
            emit-value
            map-options
            :options="[
              { label: 'UID', value: 'u' },
              { label: 'GID', value: 'g' },
            ]"
            @update:model-value="
              entry.type = $event as 'u' | 'g';
              sync();
            "
          />
          <q-input
            :model-value="entry.ct"
            dense
            type="number"
            min="0"
            :rules="[
              (value) => isInteger(String(value), 0) || gettext('Value must be zero or greater'),
            ]"
            @update:model-value="
              entry.ct = String($event ?? '');
              sync();
            "
          />
          <q-input
            :model-value="entry.host"
            dense
            type="number"
            min="0"
            :rules="[
              (value) => isInteger(String(value), 0) || gettext('Value must be zero or greater'),
            ]"
            @update:model-value="
              entry.host = String($event ?? '');
              sync();
            "
          />
          <q-input
            :model-value="entry.length"
            dense
            type="number"
            min="1"
            :rules="[(value) => isInteger(String(value), 1) || gettext('Minimum value is 1')]"
            @update:model-value="
              entry.length = String($event ?? '');
              sync();
            "
          />
          <q-btn
            flat
            dense
            round
            icon="delete"
            color="negative"
            :aria-label="gettext('Remove')"
            @click="remove(index)"
          />
        </template>
      </div>
      <div class="row q-gutter-sm q-mt-sm">
        <q-btn
          no-caps
          outline
          dense
          size="12px"
          class="u-button"
          :label="gettext('Add')"
          @click="add"
        />
        <q-btn
          no-caps
          outline
          dense
          size="12px"
          class="u-button"
          :disable="!entries.length"
          :label="gettext('Clear')"
          @click="clear"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.ct-idmap-field__grid {
  display: grid;
  grid-template-columns: 0.8fr 1fr 1fr 1fr 28px;
  gap: 6px;
  align-items: center;
}
.ct-idmap-field__header {
  font-size: 12px;
  color: #64748b;
}
</style>
