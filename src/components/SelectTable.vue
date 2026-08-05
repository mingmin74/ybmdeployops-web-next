<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { shallowRef, useTemplateRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    rows: PveRecord[];
    columns: QTableColumn<PveRecord>[];
    rowKey: string;
    displayValue: string;
    loading?: boolean;
    width?: string;
    label?: string;
    fieldStyle?: 'outlined' | 'standard';
    disable?: boolean;
    error?: boolean;
    errorMessage?: string;
    fixedLayout?: boolean;
    getRowValue?: (row: PveRecord) => string;
    canSelect?: (row: PveRecord) => boolean;
  }>(),
  {
    loading: false,
    width: '580px',
    label: '',
    fieldStyle: 'outlined',
    disable: false,
    error: false,
    errorMessage: '',
    fixedLayout: false,
  },
);

const emit = defineEmits<{
  selected: [row: PveRecord | undefined];
}>();

const popupRef = useTemplateRef<{ hide: () => void }>('popup');
const filter = shallowRef('');

function rowValue(row: PveRecord) {
  if (props.getRowValue) return props.getRowValue(row);
  const value = row[props.rowKey];
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function isSelectable(row: PveRecord) {
  return props.canSelect ? props.canSelect(row) : true;
}

function selectRow(_: Event, row: PveRecord) {
  if (!isSelectable(row)) return;
  model.value = rowValue(row);
  filter.value = '';
  emit('selected', row);
  popupRef.value?.hide();
}
</script>

<template>
  <div
    class="u-hidden-error select-table"
    :class="{
      'select-table--outlined': fieldStyle === 'outlined',
      'select-table--fixed': fixedLayout,
    }"
  >
    <q-select
      v-model="model"
      :square="fieldStyle === 'outlined'"
      :outlined="fieldStyle === 'outlined'"
      dense
      hide-bottom-space
      map-options
      color="grey-8"
      options-dense
      :class="['select-table__field', { 'u-dense': fieldStyle === 'outlined' }]"
      :display-value="displayValue"
      :loading="loading"
      :options="[]"
      :label="label"
      :disable="disable"
      :error="error"
      :error-message="errorMessage"
    >
      <template #selected>
        <slot name="selected">
          <span class="text-primary text-weight-medium">{{ displayValue }}</span>
        </slot>
      </template>

      <q-popup-proxy ref="popup" transition-show="jump-down" transition-hide="jump-up">
        <div class="q-px-sm u-border-bottom bg-grey-2 text-grey">
          <q-input
            v-model="filter"
            borderless
            dense
            debounce="300"
            class="u-dense-m"
            input-class="bg-grey-2 text-grey q-py-none"
            :placeholder="gettext('Search')"
          >
            <template #append>
              <q-icon name="search" size="20px" class="text-grey" />
            </template>
          </q-input>
        </div>
        <q-scroll-area class="select-table__scroll" :style="{ width }">
          <q-table
            flat
            dense
            hide-bottom
            :row-key="rowKey"
            table-header-class="u-table-header"
            :rows="rows"
            :columns="columns"
            :filter="filter"
            :pagination="{ rowsPerPage: 0 }"
            :loading="loading"
            :no-data-label="gettext('no record can be found')"
            @row-click="selectRow"
          >
            <template #body-cell="scope">
              <q-td
                :props="scope"
                class="text-grey-8"
                :class="{ 'select-table__disabled': !isSelectable(scope.row) }"
              >
                <slot name="body-cell" v-bind="scope">
                  {{ scope.value }}
                </slot>
              </q-td>
            </template>

            <template #no-data="{ message }">
              <div class="full-width row flex-center text-accent q-gutter-sm">
                <span class="text-grey-6">{{ message }}</span>
              </div>
            </template>
          </q-table>
        </q-scroll-area>
      </q-popup-proxy>
    </q-select>
  </div>
</template>

<style scoped>
.select-table {
  min-width: 160px;
}

.select-table :deep(.q-field--with-bottom) {
  padding-bottom: 0 !important;
}

.select-table--outlined :deep(.select-table__field .q-field__control),
.select-table--outlined :deep(.select-table__field .q-field__marginal) {
  height: 28px !important;
  min-height: 28px !important;
  display: flex;
  align-items: center;
}

.select-table--outlined :deep(.select-table__field .q-field__control-container) {
  display: flex;
  align-items: center;
  height: 28px !important;
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.select-table :deep(.q-select__control) {
  height: 28px !important;
  display: flex;
  align-items: center;
}

.select-table--outlined :deep(.select-table__field.q-field--outlined .q-field__control::before),
.select-table--outlined :deep(.select-table__field.q-field--outlined .q-field__control::after) {
  border: 1px solid #cccccc !important;
}

.select-table--outlined
  :deep(.select-table__field.q-field--outlined.q-field--highlighted .q-field__control::after) {
  transform: scale3d(1, 1, 1);
}

.select-table__scroll {
  min-height: 150px;
  height: 250px;
}

.select-table__disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.select-table--fixed :deep(.q-table__middle) {
  overflow-x: hidden;
}

.select-table--fixed :deep(.q-table) {
  table-layout: fixed;
  width: 100%;
}
</style>
