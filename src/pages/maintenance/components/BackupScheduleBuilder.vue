<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ schedule: string }>();
const emit = defineEmits<{ apply: [schedule: string] }>();
const weekOptions = [
  ['mon', 'Monday', 'Mon'], ['tue', 'Tuesday', 'Tue'], ['wed', 'Wednesday', 'Wed'],
  ['thu', 'Thursday', 'Thu'], ['fri', 'Friday', 'Fri'], ['sat', 'Saturday', 'Sat'], ['sun', 'Sunday', 'Sun'],
].map(([value, label, shortLabel]) => ({ value, label: gettext(label), shortLabel: gettext(shortLabel) }));
const form = reactive({ timeRule: 'fixed', dateType: 'daily', weekdays: ['mon', 'wed', 'fri'], rangeStart: 'mon', rangeEnd: 'fri', monthDay: 15, yearMonth: 6, yearDay: 26, time: '20:00', periodType: 'custom', startHour: 7, endHour: 18, interval: 15, intervalUnit: 'minute' });
const pad = (value: string | number) => String(value).padStart(2, '0');
const daysInMonth = (month: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 31;
const dateTypeOptions = computed(() => [
  { label: gettext('Daily'), value: 'daily' }, { label: gettext('Specified Weekdays'), value: 'weekly' }, { label: gettext('Weekday Range'), value: 'range' },
  ...(form.timeRule === 'fixed' ? [{ label: gettext('Monthly'), value: 'monthly' }, { label: gettext('Yearly'), value: 'yearly' }] : []),
]);
const datePrefix = computed(() => form.dateType === 'weekly' ? weekOptions.filter((day) => form.weekdays.includes(day.value)).map((day) => day.value).join(',') : form.dateType === 'range' ? `${form.rangeStart}..${form.rangeEnd}` : form.dateType === 'monthly' ? `*-${pad(form.monthDay)}` : form.dateType === 'yearly' ? `*-${pad(form.yearMonth)}-${pad(form.yearDay)}` : '');
const hourList = computed(() => { const result: number[] = []; for (let hour = Number(form.startHour); hour <= Number(form.endHour); hour += Number(form.interval)) result.push(hour); return result; });
const generatedValue = computed(() => {
  if (errorText.value) return '';
  const timeValue = form.timeRule === 'fixed' ? form.time : form.intervalUnit === 'minute' ? `${form.periodType === 'allDay' ? '*' : `${form.startHour}..${form.endHour}`}:00/${form.interval}` : form.periodType === 'allDay' ? `*/${form.interval}:00` : `${hourList.value.join(',')}:00`;
  return datePrefix.value ? `${datePrefix.value} ${timeValue}` : timeValue;
});
const datePreview = computed(() => form.dateType === 'daily' ? gettext('Daily') : form.dateType === 'weekly' ? weekOptions.filter((day) => form.weekdays.includes(day.value)).map((day) => day.label).join(', ') : form.dateType === 'range' ? `${weekOptions.find((day) => day.value === form.rangeStart)?.label} ${gettext('to')} ${weekOptions.find((day) => day.value === form.rangeEnd)?.label}` : form.dateType === 'monthly' ? gettext('Monthly day {0}').replace('{0}', String(form.monthDay)) : gettext('Yearly date {0}/{1}').replace('{0}', `${form.yearMonth}/${form.yearDay}`));
const previewText = computed(() => !generatedValue.value ? '' : form.timeRule === 'fixed' ? `${datePreview.value}, ${gettext('execute at')} ${form.time}` : `${datePreview.value}, ${form.periodType === 'allDay' ? gettext('All Day') : `${pad(form.startHour)}:00 ${gettext('to')} ${pad(form.endHour)}:00`}, ${gettext('execute every')} ${form.interval} ${gettext(form.intervalUnit === 'minute' ? 'Minute Unit' : 'Hour Unit')}`);
const hintText = computed(() => form.timeRule === 'fixed' && form.dateType === 'monthly' && form.monthDay >= 29 ? gettext('Months without this date will not run') : form.timeRule === 'fixed' && form.dateType === 'yearly' && form.yearMonth === 2 && form.yearDay === 29 ? gettext('Runs only in leap years') : '');
const errorText = computed(() => {
  if (form.dateType === 'weekly' && !form.weekdays.length) return gettext('Select at least one weekday');
  if (form.dateType === 'range' && weekOptions.findIndex((day) => day.value === form.rangeEnd) <= weekOptions.findIndex((day) => day.value === form.rangeStart)) return gettext('End weekday cannot be earlier than start weekday');
  if (form.timeRule === 'fixed' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) return gettext('Time is required');
  if (form.timeRule === 'repeat' && (!Number.isInteger(Number(form.interval)) || Number(form.interval) < 1)) return gettext('Interval must be greater than 0');
  if (form.timeRule === 'repeat' && form.intervalUnit === 'minute' && Number(form.interval) > 59) return gettext('Minute interval must be 1 to 59');
  if (form.timeRule === 'repeat' && form.intervalUnit === 'hour' && Number(form.interval) > 23) return gettext('Hour interval must be 1 to 23');
  if (form.timeRule === 'repeat' && form.periodType === 'custom' && Number(form.endHour) < Number(form.startHour)) return gettext('End hour cannot be earlier than start hour');
  return '';
});
function initialize(value: string) {
  const schedule = value.trim();
  const fixed = schedule.match(/^(?:(\*-(\d{2})(?:-(\d{2}))?|[a-z]{3}(?:,[a-z]{3})*|[a-z]{3}\.\.[a-z]{3})\s+)?(\d{2}:\d{2})$/);
  if (!fixed) return;
  Object.assign(form, { timeRule: 'fixed', dateType: 'daily', time: fixed[4] });
  if (!fixed[1]) return;
  if (fixed[1].startsWith('*-')) Object.assign(form, fixed[3] ? { dateType: 'yearly', yearMonth: Number(fixed[2]), yearDay: Number(fixed[3]) } : { dateType: 'monthly', monthDay: Number(fixed[2]) });
  else if (fixed[1].includes('..')) Object.assign(form, { dateType: 'range', rangeStart: fixed[1].slice(0, 3), rangeEnd: fixed[1].slice(-3) });
  else Object.assign(form, { dateType: 'weekly', weekdays: fixed[1].split(',') });
}
function apply() { if (!errorText.value) { emit('apply', generatedValue.value); visible.value = false; } }
watch(() => [visible.value, props.schedule] as const, ([open]) => { if (open) initialize(props.schedule); }, { immediate: true });
watch(() => form.timeRule, (value) => { if (value === 'repeat' && ['monthly', 'yearly'].includes(form.dateType)) form.dateType = 'daily'; });
watch(() => form.yearMonth, () => { if (form.yearDay > daysInMonth(form.yearMonth)) form.yearDay = daysInMonth(form.yearMonth); });
</script>

<template>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Execution Plan')" width="640px">
      <div class="schedule-builder q-pa-md">
        <q-select v-model="form.timeRule" dense options-dense emit-value map-options class="q-field--with-bottom" :label="gettext('Time Rule')" :options="[{ label: gettext('Fixed Time'), value: 'fixed' }, { label: gettext('Period Repeat'), value: 'repeat' }]" />
        <q-select v-model="form.dateType" dense options-dense emit-value map-options class="q-field--with-bottom" :label="gettext('Execution Date')" :options="dateTypeOptions" popup-content-class="backup-schedule-dropdown" />
        <div v-if="form.dateType === 'weekly'" class="q-field--with-bottom"><div class="text-caption text-grey-7 q-mb-xs">{{ gettext('Execution Weekday') }}</div><div class="row q-col-gutter-sm"><q-checkbox v-for="day in weekOptions" :key="day.value" v-model="form.weekdays" dense size="xs" color="primary" :val="day.value" :label="day.shortLabel" /></div></div>
        <div v-if="form.dateType === 'range'" class="row q-col-gutter-md"><q-select v-model="form.rangeStart" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('From')" :options="weekOptions" /><q-select v-model="form.rangeEnd" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('To')" :options="weekOptions" /></div>
        <q-select v-if="form.dateType === 'monthly'" v-model="form.monthDay" dense options-dense emit-value map-options class="q-field--with-bottom" :label="gettext('Execution Date')" :options="Array.from({ length: 31 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }))" />
        <div v-if="form.dateType === 'yearly'" class="row q-col-gutter-md"><q-select v-model="form.yearMonth" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('Execution Month')" :options="Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }))" /><q-select v-model="form.yearDay" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('Execution Date')" :options="Array.from({ length: daysInMonth(form.yearMonth) }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }))" /></div>
        <q-input v-if="form.timeRule === 'fixed'" v-model="form.time" dense type="time" class="q-field--with-bottom" :label="gettext('Execution Time')" />
        <template v-else><q-select v-model="form.periodType" dense options-dense emit-value map-options class="q-field--with-bottom" :label="gettext('Execution Period')" :options="[{ label: gettext('All Day'), value: 'allDay' }, { label: gettext('Specified Period'), value: 'custom' }]" /><div v-if="form.periodType === 'custom'" class="row q-col-gutter-md"><q-select v-model="form.startHour" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('From')" :options="Array.from({ length: 24 }, (_, i) => ({ label: `${pad(i)}:00`, value: i }))" /><q-select v-model="form.endHour" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('To')" :options="Array.from({ length: 24 }, (_, i) => ({ label: `${pad(i)}:00`, value: i }))" /></div><div class="row q-col-gutter-md"><q-input v-model.number="form.interval" class="col q-field--with-bottom" dense type="number" min="1" :label="gettext('Every')" /><q-select v-model="form.intervalUnit" class="col q-field--with-bottom" dense options-dense emit-value map-options :label="gettext('Unit')" :options="[{ label: gettext('Minutes'), value: 'minute' }, { label: gettext('Hours'), value: 'hour' }]" /></div></template>
        <div v-if="hintText" class="q-mb-sm text-caption text-orange-9">{{ hintText }}</div><div class="bg-grey-1 q-pa-sm u-border q-mt-sm"><div class="row q-mb-xs"><div class="col-3 text-grey-7">{{ gettext('Plan Preview') }}</div><div class="col">{{ previewText || '-' }}</div></div><div class="row"><div class="col-3 text-grey-7">{{ gettext('Generated Value') }}</div><div class="col text-primary text-weight-medium">{{ generatedValue || '-' }}</div></div></div><div v-if="errorText" class="text-negative q-mt-sm">{{ errorText }}</div>
      </div>
      <template #foot><q-btn v-close-popup no-caps flat size="12px" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" :disable="Boolean(errorText)" :class="!errorText ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'" :label="gettext('OK')" @click="apply" /></template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>.schedule-builder { min-width: 560px; }.schedule-builder :deep(.q-field__bottom) { min-height: 0; padding: 0; }</style>
<style>.backup-schedule-dropdown { max-height: 240px !important; }</style>
