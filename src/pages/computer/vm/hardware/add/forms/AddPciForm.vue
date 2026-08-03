<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { getPciMappings } from '@/api/deviceMapping';
import { getNodePciDevices, getNodePciMdevTypes } from '@/api/host';
import type { PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../../context/vmHardwareContext';

type PciMode = 'mapped' | 'raw';

export interface AddPciFormModel {
  pciMode: PciMode;
  pciAddress: string;
  pciMapping: string;
  pciMdev: string;
  pcie: boolean;
  pciAllFunctions: boolean;
  pciPrimaryGpu: boolean;
  pciRomBar: boolean;
  pciVendorId: string;
  pciDeviceId: string;
  pciSubVendorId: string;
  pciSubDeviceId: string;
}

const form = defineModel<AddPciFormModel>('form', { required: true });
const { node, config } = useVmHardwareContext();

const pciRows = shallowRef<PveRecord[]>([]);
const mappingRows = shallowRef<PveRecord[]>([]);
const mdevRows = shallowRef<PveRecord[]>([]);
const loading = shallowRef(false);
const mdevLoading = shallowRef(false);
const advanced = shallowRef(false);

const selectedPci = computed(() =>
  pciRows.value.find((row) => textValue(row.id) === form.value.pciAddress)
);
const selectedMapping = computed(() =>
  mappingRows.value.find((row) => textValue(row.id) === form.value.pciMapping)
);
const selectedDevice = computed(() => (
  form.value.pciMode === 'mapped' ? selectedMapping.value : selectedPci.value
));
const hasMdev = computed(() => Boolean(selectedDevice.value?.mdev));
const isQ35 = computed(() => textValue(config.value.machine).includes('q35'));
const noIommu = computed(() =>
  pciRows.value.length > 0 && pciRows.value.every((row) => Number(row.iommugroup) === -1)
);
const selectedGroupWarning = computed(() => {
  const current = selectedPci.value;
  const group = Number(current?.iommugroup);
  if (!current || group < 0) return false;
  const id = textValue(current.id).replace(/\.\d+$/, '');
  return pciRows.value.some((row) => {
    if (row === current || Number(row.iommugroup) !== group) return false;
    return textValue(row.id).replace(/\.\d+$/, '') !== id;
  });
});
const selectedRequired = computed(() => {
  if (form.value.pciMode === 'mapped') return !form.value.pciMapping.trim();
  return !form.value.pciAddress.trim();
});

const pciColumns: QTableColumn<PveRecord>[] = [
  { name: 'id', label: gettext('ID'), field: (row) => textValue(row.id), align: 'left' },
  {
    name: 'iommugroup',
    label: gettext('IOMMU Group'),
    field: (row) => textValue(row.iommugroup),
    align: 'left',
  },
  {
    name: 'vendor',
    label: gettext('Vendor'),
    field: (row) => textValue(row.vendor_name || row.vendor),
    align: 'left',
  },
  {
    name: 'device',
    label: gettext('Device'),
    field: (row) => textValue(row.device_name || row.device),
    align: 'left',
  },
  {
    name: 'mdev',
    label: gettext('MDev'),
    field: (row) => (row.mdev ? gettext('Yes') : gettext('No')),
    align: 'left',
  },
];

const mappingColumns: QTableColumn<PveRecord>[] = [
  { name: 'id', label: gettext('Mapped Device'), field: (row) => textValue(row.id), align: 'left' },
  {
    name: 'description',
    label: gettext('Description'),
    field: (row) => textValue(row.description),
    align: 'left',
  },
];

const mdevColumns: QTableColumn<PveRecord>[] = [
  { name: 'type', label: gettext('Type'), field: (row) => textValue(row.type), align: 'left' },
  {
    name: 'available',
    label: gettext('Available'),
    field: (row) => textValue(row.available),
    align: 'left',
  },
  {
    name: 'description',
    label: gettext('Description'),
    field: (row) => textValue(row.description),
    align: 'left',
  },
];

function mdevPath() {
  const row = selectedDevice.value;
  if (!row) return '';
  return textValue(row.path || row.id || (form.value.pciMode === 'mapped' ? form.value.pciMapping : form.value.pciAddress));
}

async function loadMdevOptions() {
  const path = mdevPath();
  mdevRows.value = [];
  form.value.pciMdev = '';
  if (!hasMdev.value || !path) return;

  mdevLoading.value = true;
  try {
    const response = await getNodePciMdevTypes(node.value, path);
    mdevRows.value = (response.data || []).sort((left, right) =>
      textValue(left.type).localeCompare(textValue(right.type))
    );
  } finally {
    mdevLoading.value = false;
  }
}

async function loadPciOptions() {
  loading.value = true;
  try {
    const [pciResponse, mappingResponse] = await Promise.all([
      getNodePciDevices(node.value),
      getPciMappings(node.value),
    ]);
    pciRows.value = (pciResponse.data || [])
      .filter((row) => Boolean(textValue(row.id)))
      .sort((left, right) => textValue(left.id).localeCompare(textValue(right.id)));
    mappingRows.value = (mappingResponse.data || [])
      .filter((row) => Boolean(textValue(row.id)))
      .sort((left, right) => textValue(left.id).localeCompare(textValue(right.id)));

    if (form.value.pciMode === 'mapped' && !form.value.pciMapping && mappingRows.value[0]) {
      form.value.pciMapping = textValue(mappingRows.value[0].id);
    }
  } finally {
    loading.value = false;
  }
}

watch(
  () => form.value.pciMode,
  (mode) => {
    form.value.pciMdev = '';
    if (mode === 'mapped') {
      form.value.pciAddress = '';
      form.value.pciAllFunctions = false;
    } else {
      form.value.pciMapping = '';
    }
  },
);

watch(
  () => [form.value.pciAddress, form.value.pciMapping, form.value.pciMode],
  () => {
    void loadMdevOptions();
  },
);

watch(
  () => form.value.pciMdev,
  (mdev) => {
    if (mdev) form.value.pciAllFunctions = false;
  },
);

watch(isQ35, (supported) => {
  if (!supported) form.value.pcie = false;
});

onMounted(() => {
  void loadPciOptions();
});
</script>

<template>
  <div class="add-pci-form u-dense">
    <div class="u-border q-pa-md">
      <div class="column">
        <q-radio
          v-model="form.pciMode"
          dense
          val="mapped"
          :label="gettext('Use mapped Device')"
        />
        <div class="add-pci-form__nested">
          <SelectTable
            v-model="form.pciMapping"
            row-key="id"
            field-style="standard"
            width="500px"
            class="q-field--with-bottom"
            :rows="mappingRows"
            :columns="mappingColumns"
            :display-value="form.pciMapping"
            :loading="loading"
            :get-row-value="(row) => textValue(row.id)"
            :disable="form.pciMode !== 'mapped'"
            :error="form.pciMode === 'mapped' && selectedRequired"
            :error-message="gettext('This field is required')"
            :label="gettext('Choose Device')"
          />
        </div>

        <q-radio
          v-model="form.pciMode"
          dense
          val="raw"
          :label="gettext('Use raw PCI device')"
        />
        <div class="add-pci-form__nested">
          <SelectTable
            v-model="form.pciAddress"
            row-key="id"
            field-style="standard"
            width="680px"
            fixed-layout
            class="q-field--with-bottom"
            :rows="pciRows"
            :columns="pciColumns"
            :display-value="form.pciAddress"
            :loading="loading"
            :get-row-value="(row) => textValue(row.id)"
            :disable="form.pciMode !== 'raw'"
            :error="form.pciMode === 'raw' && selectedRequired"
            :error-message="gettext('This field is required')"
            :label="gettext('Choose Device')"
          />
        </div>

        <q-checkbox
          v-model="form.pciAllFunctions"
          dense
          right-label
          :color="form.pciMode === 'mapped' || form.pciMdev ? 'grey' : 'primary'"
          :disable="form.pciMode === 'mapped' || Boolean(form.pciMdev)"
          :label="gettext('All Functions')"
        />
        <div class="add-pci-form__nested">
          <SelectTable
            v-model="form.pciMdev"
            row-key="type"
            field-style="standard"
            width="560px"
            class="q-field--with-bottom"
            :rows="mdevRows"
            :columns="mdevColumns"
            :display-value="form.pciMdev"
            :loading="mdevLoading"
            :get-row-value="(row) => textValue(row.type)"
            :disable="!hasMdev"
            :label="gettext('MDev Type')"
          />
        </div>
        <q-checkbox
          v-model="form.pciPrimaryGpu"
          dense
          right-label
          color="primary"
          :label="gettext('Primary GPU')"
        />

        <div v-if="noIommu" class="add-pci-form__hint q-mt-sm">
          {{ gettext('No IOMMU detected, please activate it. See Documentation for further information.') }}
        </div>
        <div v-else-if="form.pciMode === 'raw' && selectedGroupWarning" class="add-pci-form__hint q-mt-sm">
          {{ gettext('The selected PCI device is not isolated from other devices in the same IOMMU group.') }}
        </div>
      </div>
    </div>

    <div v-if="advanced" class="u-border q-pa-md q-mt-sm">
      <div class="row q-col-gutter-lg">
        <div class="col">
          <div class="q-field--with-bottom add-pci-form__checkbox">
            <q-checkbox
              v-model="form.pciRomBar"
              dense
              right-label
              color="primary"
              label="ROM-Bar"
            />
          </div>
          <q-input
            v-model="form.pciVendorId"
            dense
            class="q-field--with-bottom"
            label="Vendor ID"
            placeholder="default"
          />
          <q-input
            v-model="form.pciDeviceId"
            dense
            class="q-field--with-bottom"
            label="Device ID"
            placeholder="default"
          />
        </div>
        <div class="col">
          <div class="q-field--with-bottom add-pci-form__checkbox">
            <q-checkbox
              v-model="form.pcie"
              dense
              right-label
              :color="isQ35 ? 'primary' : 'grey'"
              :disable="!isQ35"
              label="PCI-Express"
            />
          </div>
          <q-input
            v-model="form.pciSubVendorId"
            dense
            class="q-field--with-bottom"
            label="Sub-Vendor ID"
            placeholder="default"
          />
          <q-input
            v-model="form.pciSubDeviceId"
            dense
            class="q-field--with-bottom"
            label="Sub-Device ID"
            placeholder="default"
          />
        </div>
      </div>
    </div>

    <div class="row items-center q-mt-xs">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
    </div>
  </div>
</template>

<style scoped>
.add-pci-form__nested {
  padding-left: 36px;
}

.add-pci-form__checkbox {
  margin-left: -10px;
}

.add-pci-form__hint {
  padding: 8px 10px;
  border: 1px solid #f3d29a;
  background: #fff7e6;
  color: #8a5a00;
  font-size: 12px;
  line-height: 1.5;
}
</style>
