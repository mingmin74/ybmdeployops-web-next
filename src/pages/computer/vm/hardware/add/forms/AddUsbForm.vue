<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef } from 'vue';
import { getNodeUsbDevices } from '@/api/host';
import { getUsbMappings } from '@/api/deviceMapping';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../../context/vmHardwareContext';

type UsbMode = 'spice' | 'mapped' | 'hostdevice' | 'port';

export interface AddUsbFormModel {
  usbMode: UsbMode;
  usbHostDevice: string;
  usbPort: string;
  usbMapping: string;
  usb3: boolean;
}

const form = defineModel<AddUsbFormModel>('form', { required: true });
const { disableUsb3 = false } = defineProps<{ disableUsb3?: boolean }>();
const { node } = useVmHardwareContext();

const usbRows = shallowRef<PveRecord[]>([]);
const mappingRows = shallowRef<PveRecord[]>([]);
const loading = shallowRef(false);

const usbDeviceRows = computed(() =>
  usbRows.value
    .filter((row) => textValue(row.usbpath) && textValue(row.prodid) && Number(row.class) !== 9)
    .map((row) => ({
      ...row,
      deviceKey: `${textValue(row.vendid)}:${textValue(row.prodid)}`,
      portKey: `${textValue(row.busnum)}-${textValue(row.usbpath)}`,
    })),
);

const mappingColumns: QTableColumn<PveRecord>[] = [
  { name: 'id', label: gettext('Mapped Device'), field: (row) => textValue(row.id), align: 'left' },
  {
    name: 'description',
    label: gettext('Description'),
    field: (row) => textValue(row.description),
    align: 'left',
  },
];

const usbDeviceColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'deviceKey',
    label: gettext('Device'),
    field: (row) => textValue(row.deviceKey),
    align: 'left',
  },
  {
    name: 'manufacturer',
    label: gettext('Manufacturer'),
    field: (row) => textValue(row.manufacturer),
    align: 'left',
  },
  {
    name: 'product',
    label: gettext('Product'),
    field: (row) => textValue(row.product),
    align: 'left',
  },
  { name: 'speed', label: gettext('Speed'), field: (row) => textValue(row.speed), align: 'left' },
];

const usbPortColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'portKey',
    label: gettext('Port'),
    field: (row) => textValue(row.portKey),
    align: 'left',
  },
  {
    name: 'manufacturer',
    label: gettext('Manufacturer'),
    field: (row) => textValue(row.manufacturer),
    align: 'left',
  },
  {
    name: 'product',
    label: gettext('Product'),
    field: (row) => textValue(row.product),
    align: 'left',
  },
  { name: 'speed', label: gettext('Speed'), field: (row) => textValue(row.speed), align: 'left' },
];

const selectedRequired = computed(() => {
  if (form.value.usbMode === 'mapped') return !form.value.usbMapping.trim();
  if (form.value.usbMode === 'hostdevice') return !form.value.usbHostDevice.trim();
  if (form.value.usbMode === 'port') return !form.value.usbPort.trim();
  return false;
});
const hostDeviceValid = computed(
  () =>
    !form.value.usbHostDevice.trim() ||
    /^[a-f0-9]{4}:[a-f0-9]{4}$/i.test(form.value.usbHostDevice.trim()),
);
const portValid = computed(
  () => !form.value.usbPort.trim() || /^[0-9]+-[0-9]+(\.[0-9]+)*$/.test(form.value.usbPort.trim()),
);

async function loadUsbOptions() {
  loading.value = true;
  try {
    const [devicesResponse, mappingsResponse] = await Promise.all([
      getNodeUsbDevices(node.value),
      getUsbMappings(node.value),
    ]);
    usbRows.value = devicesResponse.data || [];
    mappingRows.value = mappingsResponse.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadUsbOptions();
});
</script>

<template>
  <div class="add-usb-form u-dense">
    <div class="u-border q-pa-md">
      <div class="column">
        <q-radio v-model="form.usbMode" dense val="spice" :label="gettext('Spice Port')" />
        <q-radio v-model="form.usbMode" dense val="mapped" :label="gettext('Use mapped Device')" />
        <div class="add-usb-form__nested">
          <SelectTable
            v-model="form.usbMapping"
            row-key="id"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="mappingRows"
            :columns="mappingColumns"
            :display-value="form.usbMapping"
            :loading="loading"
            :get-row-value="(row) => textValue(row.id)"
            :disable="form.usbMode !== 'mapped'"
            :error="form.usbMode === 'mapped' && selectedRequired"
            :error-message="gettext('This field is required')"
            :label="gettext('Choose Device')"
          />
        </div>
        <q-radio
          v-model="form.usbMode"
          dense
          val="hostdevice"
          :label="gettext('Use USB Vendor/Device ID')"
        />
        <div class="add-usb-form__nested">
          <SelectTable
            v-model="form.usbHostDevice"
            row-key="deviceKey"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="usbDeviceRows"
            :columns="usbDeviceColumns"
            :display-value="form.usbHostDevice"
            editable
            :loading="loading"
            :get-row-value="(row) => textValue(row.deviceKey)"
            :disable="form.usbMode !== 'hostdevice'"
            :error="form.usbMode === 'hostdevice' && (selectedRequired || !hostDeviceValid)"
            :error-message="
              selectedRequired
                ? gettext('This field is required')
                : gettext('Use the format 1234:5678')
            "
            :label="gettext('Choose Device')"
          />
        </div>
        <q-radio v-model="form.usbMode" dense val="port" :label="gettext('Use USB Port')" />
        <div class="add-usb-form__nested">
          <SelectTable
            v-model="form.usbPort"
            row-key="portKey"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="usbDeviceRows"
            :columns="usbPortColumns"
            :display-value="form.usbPort"
            editable
            :loading="loading"
            :get-row-value="(row) => textValue(row.portKey)"
            :disable="form.usbMode !== 'port'"
            :error="form.usbMode === 'port' && (selectedRequired || !portValid)"
            :error-message="
              selectedRequired ? gettext('This field is required') : gettext('Use the format 1-2.3')
            "
            :label="gettext('Choose Port')"
          />
        </div>
        <q-checkbox
          v-model="form.usb3"
          dense
          right-label
          :color="disableUsb3 ? 'grey' : 'primary'"
          :disable="disableUsb3"
          :label="gettext('Use USB3')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-usb-form__nested {
  padding-left: 36px;
}
</style>
