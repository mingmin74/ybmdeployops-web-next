<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Notify, type QTableColumn } from 'quasar';
import Sortable from 'sortablejs';
import { getVmPendingConfig, revertVmConfig, updateVmConfig } from '@/api/overview';
import { getNodeStorage } from '@/api/storageContent';
import SelectTable from '@/components/SelectTable.vue';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';

function optionIcon(key: string) {
  if (key === 'name') return 'badge';
  if (key === 'description') return 'subject';
  if (key === 'onboot' || key === 'acpi') return 'power_settings_new';
  if (key === 'ostype') return 'computer';
  if (key === 'boot') return 'play_circle';
  if (key === 'tablet') return 'mouse';
  if (key === 'startup' || key === 'localtime' || key === 'startdate') return 'schedule';
  if (key === 'hotplug') return 'settings_input_component';
  if (key === 'kvm') return 'memory';
  if (key === 'freeze') return 'ac_unit';
  if (key === 'vmstatestorage') return 'storage';
  if (key === 'arch') return 'architecture';
  if (key === 'console' || key === 'cmode' || key === 'tty') return 'terminal';
  if (key === 'protection') return 'shield';
  if (key === 'unprivileged') return 'lock_open';
  if (key === 'features') return 'extension';
  if (key === 'hookscript' || key === 'entrypoint' || key === 'env') return 'code';
  if (key === 'agent') return 'smart_toy';
  if (key === 'protection') return 'shield';
  if (key === 'spice') return 'desktop_windows';
  if (key === 'sev' || key === 'tdx') return 'security';
  return 'settings';
}

type BootDevice = { name: string; enabled: boolean; description: string };
type OsTypeOption = { label: string; value: string };
type OsTypeGroup = { label: string; value: string; versions: OsTypeOption[] };

const otherOsTypeGroup: OsTypeGroup = {
  label: 'Other',
  value: 'Other',
  versions: [{ label: '-', value: 'other' }],
};

const osTypeGroups: OsTypeGroup[] = [
  {
    label: 'Linux',
    value: 'Linux',
    versions: [
      { label: '7.x - 2.6 Kernel', value: 'l26' },
      { label: '2.4 Kernel', value: 'l24' },
    ],
  },
  {
    label: 'Microsoft Windows',
    value: 'Microsoft Windows',
    versions: [
      { label: '11/2022/2025', value: 'win11' },
      { label: '10/2016/2019', value: 'win10' },
      { label: '8.x/2012/2012r2', value: 'win8' },
      { label: '7/2008r2', value: 'win7' },
      { label: 'Vista/2008', value: 'w2k8' },
      { label: 'XP/2003', value: 'wxp' },
      { label: '2000', value: 'w2k' },
    ],
  },
  {
    label: 'Solaris Kernel',
    value: 'Solaris Kernel',
    versions: [{ label: '-', value: 'solaris' }],
  },
  otherOsTypeGroup,
];

const hotplugFeatureOrder = ['disk', 'network', 'usb', 'memory', 'cpu'];

function osBaseFor(ostype: string) {
  return (
    osTypeGroups.find((group) => group.versions.some((version) => version.value === ostype))
      ?.value || 'Other'
  );
}

const props = withDefaults(
  defineProps<{ node: string; vmid: string; config: PveRecord; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' },
);
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const form = reactive({
  name: '',
  description: '',
  onboot: false,
  protection: false,
  agent: false,
  agentFstrimClonedDisks: false,
  agentFreezeFs: true,
  agentType: '__default__',
  acpi: true,
  kvm: true,
  tablet: true,
  hotplug: '',
  startup: '',
  startupOrder: '',
  startupUp: '',
  startupDown: '',
  osBase: 'Other',
  ostype: 'other',
  boot: '',
  freeze: false,
  localtime: '__default__',
  startdate: 'now',
  vmstatestorage: '',
  smbios1: '',
  smbiosUuid: '',
  smbiosManufacturer: '',
  smbiosProduct: '',
  smbiosVersion: '',
  smbiosSerial: '',
  smbiosSku: '',
  smbiosFamily: '',
  spiceFolderSharing: false,
  spiceVideoStreaming: 'off',
  sevType: '__default__',
  sevDebug: true,
  sevKeySharing: true,
  sevSmt: true,
  sevKernelHashes: false,
  tdxType: '__default__',
  tdxAttestation: true,
  tdxVsockCid: '2',
  tdxVsockPort: '4050',
  console: true,
  tty: '2',
  cmode: '__default__',
  featureKeyctl: false,
  featureNesting: false,
  featureNfs: false,
  featureCifs: false,
  featureFuse: false,
  featureMknod: false,
  entrypoint: '',
});
const original = shallowRef({
  name: '',
  description: '',
  onboot: false,
  protection: false,
  agent: false,
  agentFstrimClonedDisks: false,
  agentFreezeFs: true,
  agentType: '__default__',
  acpi: true,
  kvm: true,
  tablet: true,
  hotplug: '',
  startup: '',
  startupOrder: '',
  startupUp: '',
  startupDown: '',
  osBase: 'Other',
  ostype: 'other',
  boot: '',
  freeze: false,
  localtime: '__default__',
  startdate: 'now',
  vmstatestorage: '',
  smbios1: '',
  smbiosUuid: '',
  smbiosManufacturer: '',
  smbiosProduct: '',
  smbiosVersion: '',
  smbiosSerial: '',
  smbiosSku: '',
  smbiosFamily: '',
  spiceFolderSharing: false,
  spiceVideoStreaming: 'off',
  sevType: '__default__',
  sevDebug: true,
  sevKeySharing: true,
  sevSmt: true,
  sevKernelHashes: false,
  tdxType: '__default__',
  tdxAttestation: true,
  tdxVsockCid: '2',
  tdxVsockPort: '4050',
  console: true,
  tty: '2',
  cmode: '__default__',
  featureKeyctl: false,
  featureNesting: false,
  featureNfs: false,
  featureCifs: false,
  featureFuse: false,
  featureMknod: false,
  entrypoint: '',
});
type EnvRow = { id: number; name: string; value: string };
const envRows = ref<EnvRow[]>([]);
const originalEnv = shallowRef('');
let nextEnvRowId = 0;
const bootRows = ref<BootDevice[]>([]);
const bootTableBody = useTemplateRef<HTMLTableSectionElement>('bootTableBody');
const originalBootValue = shallowRef('');
const bootValue = computed(
  () =>
    `order=${bootRows.value
      .filter((row) => row.enabled)
      .map((row) => row.name)
      .join(';')}`,
);
const originalSmbios1Value = shallowRef('');
const hotplugFeatures = ref<string[]>([]);
const originalHotplugValue = shallowRef('');
const hotplugValue = computed(
  () =>
    hotplugFeatureOrder.filter((feature) => hotplugFeatures.value.includes(feature)).join(',') ||
    '0',
);
const canConfigureOptions = computed(() =>
  Boolean(
    (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Options'],
  ),
);
const canConfigureHardware = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.HWType']),
);
const canModifyNode = computed(() =>
  Boolean((session.caps as unknown as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify']),
);
const canEditLxcFeatures = computed(
  () =>
    session.userid === 'root@pam' ||
    (Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Allocate']) &&
      optionEnabled(props.config.unprivileged)),
);
const envValue = computed(() =>
  envRows.value
    .filter((row) => row.name.trim())
    .map((row) => `${row.name.trim()}=${row.value}`)
    .join('\0'),
);
const lxcAdvancedChanged = computed(
  () =>
    props.guestType === 'lxc' &&
    ((
      [
        'console',
        'tty',
        'cmode',
        'featureKeyctl',
        'featureNesting',
        'featureNfs',
        'featureCifs',
        'featureFuse',
        'featureMknod',
        'entrypoint',
      ] as const
    ).some((key) => form[key] !== original.value[key]) ||
      envValue.value !== originalEnv.value),
);
const hardwareFields = new Set([
  'smbios1',
  'smbiosUuid',
  'smbiosManufacturer',
  'smbiosProduct',
  'smbiosVersion',
  'smbiosSerial',
  'smbiosSku',
  'smbiosFamily',
  'sevType',
  'sevDebug',
  'sevKeySharing',
  'sevSmt',
  'sevKernelHashes',
  'tdxType',
  'tdxAttestation',
  'tdxVsockCid',
  'tdxVsockPort',
]);
const optionsChanged = computed(
  () =>
    bootValue.value !== originalBootValue.value ||
    hotplugValue.value !== originalHotplugValue.value ||
    Object.entries(form).some(
      ([key, value]) =>
        !hardwareFields.has(key) && value !== original.value[key as keyof typeof original.value],
    ),
);
const hardwareChanged = computed(() =>
  [...hardwareFields].some(
    (key) => form[key as keyof typeof form] !== original.value[key as keyof typeof original.value],
  ),
);
const canSave = computed(
  () =>
    (optionsChanged.value || hardwareChanged.value || lxcAdvancedChanged.value) &&
    (!optionsChanged.value || canConfigureOptions.value) &&
    (!hardwareChanged.value || canConfigureHardware.value),
);
const spiceDisplayIsQxl = computed(() =>
  /^qxl\d?$/.test(textValue(parseProperties(props.config.vga).type)),
);
const startupValue = computed(() =>
  [
    form.startupOrder.trim() ? `order=${form.startupOrder.trim()}` : '',
    form.startupUp.trim() ? `up=${form.startupUp.trim()}` : '',
    form.startupDown.trim() ? `down=${form.startupDown.trim()}` : '',
  ]
    .filter(Boolean)
    .join(','),
);
const smbios1Value = computed(() => {
  const fields = [
    ['uuid', form.smbiosUuid],
    ['manufacturer', form.smbiosManufacturer],
    ['product', form.smbiosProduct],
    ['version', form.smbiosVersion],
    ['serial', form.smbiosSerial],
    ['sku', form.smbiosSku],
    ['family', form.smbiosFamily],
  ] as const;
  const values = fields
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${key === 'uuid' ? value : encodeSmbiosValue(value)}`);
  if (fields.some(([key, value]) => key !== 'uuid' && value)) values.push('base64=1');
  return values.join(',');
});
const osVersionOptions = computed(
  () => (osTypeGroups.find((group) => group.value === form.osBase) || otherOsTypeGroup).versions,
);
const selectedOption = shallowRef(props.guestType === 'lxc' ? 'onboot' : 'name');
const isLxcReadOnlyOption = computed(
  () =>
    props.guestType === 'lxc' &&
    ['ostype', 'arch', 'unprivileged', 'hookscript'].includes(selectedOption.value),
);
const agentAdvanced = shallowRef(false);
const pendingRows = shallowRef<PveRecord[]>([]);
const vmStateStorageOptions = shallowRef<PveRecord[]>([]);
const vmStateStorageDisplayValue = computed(
  () => form.vmstatestorage || gettext("Automatic (Storage used by the VM, or 'local')"),
);
const vmStateStorageColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'storage',
    label: gettext('Storage'),
    field: (row) => textValue(row.storage),
    align: 'left',
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    field: (row) => textValue(row.type),
    align: 'left',
    sortable: true,
  },
];
const pendingByKey = computed<Record<string, PveRecord>>(() =>
  Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row])),
);
function optionEnabled(value: unknown) {
  return value === true || value === 1 || textValue(value) === '1';
}
const optionRows = computed(() => {
  if (props.guestType === 'lxc') {
    const config = props.config;
    return [
      {
        key: 'onboot',
        label: gettext('Start at boot'),
        value: optionEnabled(config.onboot) ? gettext('Yes') : gettext('No'),
      },
      {
        key: 'startup',
        label: gettext('Start/Shutdown order'),
        value: textValue(config.startup) || '-',
      },
      {
        key: 'ostype',
        label: gettext('OS Type'),
        value: textValue(config.ostype) || gettext('Unknown'),
      },
      {
        key: 'arch',
        label: gettext('Architecture'),
        value: textValue(config.arch) || gettext('Unknown'),
      },
      {
        key: 'console',
        label: '/dev/console',
        value: config.console === 0 || config.console === '0' ? gettext('No') : gettext('Yes'),
      },
      { key: 'tty', label: gettext('TTY count'), value: textValue(config.tty) || '2' },
      { key: 'cmode', label: gettext('Console mode'), value: textValue(config.cmode) || 'tty' },
      {
        key: 'protection',
        label: gettext('Protection'),
        value: optionEnabled(config.protection) ? gettext('Yes') : gettext('No'),
      },
      {
        key: 'unprivileged',
        label: gettext('Unprivileged container'),
        value: optionEnabled(config.unprivileged) ? gettext('Yes') : gettext('No'),
      },
      {
        key: 'features',
        label: gettext('Features'),
        value: textValue(config.features) || gettext('None'),
      },
      {
        key: 'hookscript',
        label: gettext('Hookscript'),
        value: textValue(config.hookscript) || '-',
      },
      {
        key: 'entrypoint',
        label: gettext('Entrypoint'),
        value: textValue(config.entrypoint) || '/sbin/init',
      },
      {
        key: 'env',
        label: gettext('Environment'),
        value: textValue(config.env).replaceAll(/\0+/g, ' ') || gettext('None'),
      },
    ];
  }
  return [
    { key: 'name', label: gettext('Name'), value: form.name || '-' },
    { key: 'description', label: '中文名称', value: form.description || '--' },
    {
      key: 'onboot',
      label: gettext('Start at boot'),
      value: form.onboot ? gettext('Yes') : gettext('No'),
    },
    { key: 'ostype', label: gettext('OS Type'), value: form.ostype || '-' },
    {
      key: 'boot',
      label: gettext('Boot Order'),
      value: bootValue.value === 'order=' ? gettext('None') : bootValue.value.replace('order=', ''),
    },
    {
      key: 'tablet',
      label: gettext('USB Tablet'),
      value: form.tablet ? gettext('Yes') : gettext('No'),
    },
    {
      key: 'hotplug',
      label: gettext('Hotplug'),
      value: hotplugValue.value === '0' ? gettext('None') : hotplugValue.value,
    },
    { key: 'startup', label: gettext('Startup/Shutdown order'), value: startupValue.value || '-' },
    {
      key: 'acpi',
      label: gettext('ACPI support'),
      value: form.acpi ? gettext('Yes') : gettext('No'),
    },
    {
      key: 'kvm',
      label: gettext('KVM hardware virtualization'),
      value: form.kvm ? gettext('Yes') : gettext('No'),
    },
    {
      key: 'freeze',
      label: gettext('Freeze CPU at startup'),
      value: form.freeze ? gettext('Yes') : gettext('No'),
    },
    {
      key: 'localtime',
      label: gettext('Use local time for RTC'),
      value:
        form.localtime === '1'
          ? gettext('Yes')
          : form.localtime === '0'
            ? gettext('No')
            : gettext('Default'),
    },
    { key: 'startdate', label: gettext('RTC start date'), value: form.startdate || 'now' },
    {
      key: 'vmstatestorage',
      label: gettext('VM State storage'),
      value: form.vmstatestorage || '-',
    },
    { key: 'smbios1', label: gettext('SMBIOS settings (type1)'), value: form.smbios1 || '-' },
    {
      key: 'agent',
      label: gettext('QEMU Guest Agent'),
      value: form.agent ? gettext('Yes') : gettext('No'),
    },
    {
      key: 'protection',
      label: gettext('Protection'),
      value: form.protection ? gettext('Yes') : gettext('No'),
    },
    {
      key: 'spice',
      label: gettext('Spice Enhancements'),
      value:
        form.spiceFolderSharing || form.spiceVideoStreaming !== 'off'
          ? gettext('Enabled')
          : gettext('None'),
    },
    {
      key: 'sev',
      label: gettext('AMD SEV Type'),
      value: form.sevType === '__default__' ? gettext('Default') : form.sevType,
    },
    {
      key: 'tdx',
      label: gettext('Intel TDX Type'),
      value: form.tdxType === '__default__' ? gettext('Default') : form.tdxType,
    },
  ];
});
const advancedOptionKeys = new Set([
  'hotplug',
  'startup',
  'freeze',
  'localtime',
  'startdate',
  'vmstatestorage',
  'smbios1',
  'spice',
  'sev',
  'tdx',
]);
const basicOptionRows = computed(() =>
  props.guestType === 'lxc'
    ? optionRows.value
    : optionRows.value.filter((row) => !advancedOptionKeys.has(row.key)),
);
const advancedOptionRows = computed(() =>
  props.guestType === 'lxc'
    ? []
    : optionRows.value.filter((row) => advancedOptionKeys.has(row.key)),
);
const pendingKeyMap: Record<string, string[]> = {
  spice: ['spice_enhancements'],
  sev: ['amd-sev'],
  tdx: ['intel-tdx'],
};
const hardwareOptionKeys = new Set(['smbios1', 'sev', 'tdx']);
const pendingKeysForOption = (key: string) => pendingKeyMap[key] || [key];
const selectedPendingKeys = computed(() => pendingKeysForOption(selectedOption.value));
const canRevertSelected = computed(() =>
  selectedPendingKeys.value.some((key) => Boolean(pendingByKey.value[key])),
);
const canRevertCurrentOption = computed(() =>
  hardwareOptionKeys.has(selectedOption.value)
    ? canConfigureHardware.value
    : canConfigureOptions.value,
);

async function loadPending() {
  const response = await getVmPendingConfig(props.node, props.vmid, props.guestType);
  pendingRows.value = response.data || [];
}

async function loadVmStateStorages() {
  const response = await getNodeStorage(props.node, 'images');
  vmStateStorageOptions.value = (response.data || []).filter((storage) =>
    textValue(storage.storage),
  );
}

async function revertSelected() {
  if (!canRevertSelected.value || !canRevertCurrentOption.value) return;
  loading.value = true;
  try {
    await revertVmConfig(props.node, props.vmid, selectedPendingKeys.value, props.guestType);
    await loadPending();
    emit('updated');
  } finally {
    loading.value = false;
  }
}

function parseProperties(value: unknown) {
  const textValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return Object.fromEntries(
    textValue
      .split(',')
      .filter(Boolean)
      .map((part) => {
        const [key, ...parts] = part.split('=');
        return [key, parts.join('=') || '1'];
      }),
  );
}

function encodeSmbiosValue(value: string) {
  const bytes = new TextEncoder().encode(value);
  return btoa(String.fromCharCode(...bytes));
}

function decodeSmbiosValue(value: string) {
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function parseSmbios1(value: string) {
  const parsed = parseProperties(value);
  const base64 = parsed.base64 === '1';
  const field = (key: string) => {
    const fieldValue = textValue(parsed[key]);
    return base64 && key !== 'uuid' ? decodeSmbiosValue(fieldValue) : fieldValue;
  };
  return {
    uuid: field('uuid'),
    manufacturer: field('manufacturer'),
    product: field('product'),
    version: field('version'),
    serial: field('serial'),
    sku: field('sku'),
    family: field('family'),
  };
}

function selectOsBase(value: string | null) {
  const group = osTypeGroups.find((item) => item.value === value) || otherOsTypeGroup;
  const firstVersion = group.versions[0];
  if (!firstVersion) return;
  form.osBase = group.value;
  form.ostype = firstVersion.value;
}

function addEnvRow() {
  envRows.value.push({ id: nextEnvRowId++, name: '', value: '' });
}

function removeEnvRow(id: number) {
  envRows.value = envRows.value.filter((row) => row.id !== id);
}

function isBootDevice(key: string, value: string) {
  const isCloudInit = /media=cdrom/.test(value) && /[:/]vm-\d+-cloudinit/.test(value);
  return (
    (/^(?:ide|sata|scsi|virtio)\d+$/.test(key) && !isCloudInit) ||
    /^net\d+$/.test(key) ||
    /^hostpci\d+$/.test(key) ||
    (/^usb\d+$/.test(key) && !/spice/.test(value))
  );
}

function buildBootRows() {
  const devices = Object.entries(props.config)
    .filter(([key, value]) => isBootDevice(key, textValue(value)))
    .map(([name, value]) => ({ name, description: textValue(value) }));
  const byName = new Map(devices.map((device) => [device.name, device]));
  const rawBoot = textValue(props.config.boot);
  const boot = parseProperties(rawBoot);
  const bootOrder = textValue(boot.order);
  const orderedNames = bootOrder
    ? bootOrder.split(';').filter((name: string) => byName.has(name))
    : (() => {
        const legacy = rawBoot.includes('=') ? textValue(boot.legacy) : rawBoot;
        const names: string[] = [];
        const bootdisk = textValue(props.config.bootdisk);
        if (legacy.includes('c') && byName.has(bootdisk)) names.push(bootdisk);
        if (legacy.includes('d'))
          names.push(
            ...devices
              .filter((device) => /media=cdrom/.test(device.description))
              .map((device) => device.name),
          );
        if (legacy.includes('n'))
          names.push(
            ...devices
              .filter((device) => /^net\d+$/.test(device.name))
              .map((device) => device.name),
          );
        return [...new Set(names)];
      })();
  const enabled = orderedNames.map((name) => ({ ...byName.get(name)!, enabled: true }));
  const disabled = devices
    .filter((device) => !orderedNames.includes(device.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((device) => ({ ...device, enabled: false }));
  bootRows.value = [...enabled, ...disabled];
  originalBootValue.value = bootValue.value;
}

function reorderBootDevice(oldIndex: number, newIndex: number) {
  if (
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= bootRows.value.length ||
    newIndex >= bootRows.value.length
  )
    return;
  const rows = [...bootRows.value];
  const [row] = rows.splice(oldIndex, 1);
  if (!row) return;
  rows.splice(newIndex, 0, row);
  bootRows.value = rows;
}

let bootSortable: Sortable | undefined;

onMounted(() => {
  if (!bootTableBody.value) return;
  bootSortable = Sortable.create(bootTableBody.value, {
    animation: 150,
    draggable: '.boot-order-row',
    handle: '.boot-order-drag-handle',
    ghostClass: 'boot-order-row--ghost',
    onEnd: ({ oldIndex, newIndex }: Sortable.SortableEvent) => {
      if (oldIndex === undefined || newIndex === undefined) return;
      reorderBootDevice(oldIndex, newIndex);
    },
  });
});

onBeforeUnmount(() => bootSortable?.destroy());

function syncForm() {
  const spiceEnhancements = parseProperties(props.config.spice_enhancements);
  const agent = parseProperties(props.config.agent);
  const sev = parseProperties(props.config['amd-sev']);
  const tdx = parseProperties(props.config['intel-tdx']);
  const startup = parseProperties(props.config.startup);
  const features = parseProperties(props.config.features);
  const textValue = (value: unknown, fallback = '') =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
  const smbios1 = parseSmbios1(textValue(props.config.smbios1));
  const next = {
    name: textValue(props.config.name),
    description: textValue(props.config.description),
    onboot: Number(props.config.onboot || 0) === 1,
    protection: Number(props.config.protection || 0) === 1,
    agent: textValue(props.config.agent) === '1' || textValue(agent.enabled) === '1',
    agentFstrimClonedDisks: textValue(agent.fstrim_cloned_disks) === '1',
    agentFreezeFs: textValue(agent['freeze-fs'] || agent['freeze-fs-on-backup'] || '1') !== '0',
    agentType: ['virtio', 'isa'].includes(textValue(agent.type))
      ? textValue(agent.type)
      : '__default__',
    acpi: Number(props.config.acpi ?? 1) === 1,
    kvm: Number(props.config.kvm ?? 1) === 1,
    tablet: Number(props.config.tablet ?? 1) === 1,
    hotplug: textValue(props.config.hotplug),
    startup: textValue(props.config.startup),
    startupOrder: textValue(startup.order),
    startupUp: textValue(startup.up),
    startupDown: textValue(startup.down),
    osBase: osBaseFor(textValue(props.config.ostype, 'other')),
    ostype: textValue(props.config.ostype, 'other'),
    boot: textValue(props.config.boot),
    freeze: Number(props.config.freeze || 0) === 1,
    localtime:
      props.config.localtime === undefined ? '__default__' : textValue(props.config.localtime),
    startdate: textValue(props.config.startdate, 'now'),
    vmstatestorage: textValue(props.config.vmstatestorage),
    smbios1: textValue(props.config.smbios1),
    smbiosUuid: smbios1.uuid,
    smbiosManufacturer: smbios1.manufacturer,
    smbiosProduct: smbios1.product,
    smbiosVersion: smbios1.version,
    smbiosSerial: smbios1.serial,
    smbiosSku: smbios1.sku,
    smbiosFamily: smbios1.family,
    spiceFolderSharing: String(spiceEnhancements.foldersharing || '0') === '1',
    spiceVideoStreaming: ['all', 'filter'].includes(String(spiceEnhancements.videostreaming || ''))
      ? String(spiceEnhancements.videostreaming)
      : 'off',
    sevType: ['std', 'es', 'snp'].includes(String(sev.type || ''))
      ? String(sev.type)
      : '__default__',
    sevDebug: String(sev['no-debug'] || '0') !== '1',
    sevKeySharing: String(sev['no-key-sharing'] || '0') !== '1',
    sevSmt: String(sev['allow-smt'] || '1') !== '0',
    sevKernelHashes: String(sev['kernel-hashes'] || '0') === '1',
    tdxType: String(tdx.type || '') === 'tdx' ? 'tdx' : '__default__',
    tdxAttestation: String(tdx.attestation || '1') !== '0',
    tdxVsockCid: String(tdx['vsock-cid'] || '2'),
    tdxVsockPort: String(tdx['vsock-port'] || '4050'),
    console: Number(props.config.console ?? 1) === 1,
    tty: textValue(props.config.tty, '2'),
    cmode: ['tty', 'console', 'shell'].includes(textValue(props.config.cmode))
      ? textValue(props.config.cmode)
      : '__default__',
    featureKeyctl: textValue(features.keyctl) === '1',
    featureNesting: textValue(features.nesting) === '1',
    featureNfs: textValue(features.mount).split(/[; ]/).includes('nfs'),
    featureCifs: textValue(features.mount).split(/[; ]/).includes('cifs'),
    featureFuse: textValue(features.fuse) === '1',
    featureMknod: textValue(features.mknod) === '1',
    entrypoint: textValue(props.config.entrypoint),
  };
  Object.assign(form, next);
  envRows.value = textValue(props.config.env)
    .split(/\0+/)
    .filter(Boolean)
    .map((entry) => {
      const [name, ...value] = entry.split('=');
      return { id: nextEnvRowId++, name: name || '', value: value.join('=') };
    });
  originalEnv.value = envValue.value;
  original.value = { ...next };
  hotplugFeatures.value =
    form.hotplug === '0'
      ? []
      : !form.hotplug || form.hotplug === '1'
        ? ['disk', 'network', 'usb']
        : form.hotplug.split(',').filter(Boolean);
  originalHotplugValue.value = hotplugValue.value;
  buildBootRows();
  originalSmbios1Value.value = smbios1Value.value;
}

async function save() {
  if (!canSave.value) return;
  const data: PveRecord = { digest: props.config.digest };
  const deletedKeys: string[] = [];
  const setOptional = (key: string, value: string) => {
    if (value.trim()) data[key] = value.trim();
    else deletedKeys.push(key);
  };
  if (form.name !== original.value.name) setOptional('name', form.name);
  if (form.description !== original.value.description) {
    if (form.description.trim()) data.description = form.description.trim();
    else deletedKeys.push('description');
  }
  if (form.onboot !== original.value.onboot) data.onboot = form.onboot ? 1 : 0;
  if (form.protection !== original.value.protection) data.protection = form.protection ? 1 : 0;
  if (
    form.agent !== original.value.agent ||
    form.agentFstrimClonedDisks !== original.value.agentFstrimClonedDisks ||
    form.agentFreezeFs !== original.value.agentFreezeFs ||
    form.agentType !== original.value.agentType
  ) {
    const agent = [`enabled=${form.agent ? 1 : 0}`];
    if (form.agentFstrimClonedDisks) agent.push('fstrim_cloned_disks=1');
    if (!form.agentFreezeFs) agent.push('freeze-fs=0');
    if (form.agentType !== '__default__') agent.push(`type=${form.agentType}`);
    data.agent = agent.join(',');
  }
  if (form.acpi !== original.value.acpi) data.acpi = form.acpi ? 1 : 0;
  if (form.kvm !== original.value.kvm) data.kvm = form.kvm ? 1 : 0;
  if (form.tablet !== original.value.tablet) data.tablet = form.tablet ? 1 : 0;
  if (hotplugValue.value !== originalHotplugValue.value) data.hotplug = hotplugValue.value;
  if (startupValue.value !== original.value.startup) setOptional('startup', startupValue.value);
  if (form.ostype !== original.value.ostype) data.ostype = form.ostype;
  if (bootValue.value !== originalBootValue.value) data.boot = bootValue.value;
  if (form.freeze !== original.value.freeze) data.freeze = form.freeze ? 1 : 0;
  if (form.localtime !== original.value.localtime) {
    if (form.localtime === '__default__') deletedKeys.push('localtime');
    else data.localtime = form.localtime;
  }
  if (form.startdate !== original.value.startdate) setOptional('startdate', form.startdate);
  if (form.vmstatestorage !== original.value.vmstatestorage)
    setOptional('vmstatestorage', form.vmstatestorage);
  if (
    form.spiceFolderSharing !== original.value.spiceFolderSharing ||
    form.spiceVideoStreaming !== original.value.spiceVideoStreaming
  ) {
    const enhancements: string[] = [];
    if (form.spiceFolderSharing) enhancements.push('foldersharing=1');
    if (form.spiceVideoStreaming !== 'off')
      enhancements.push(`videostreaming=${form.spiceVideoStreaming}`);
    if (enhancements.length) data.spice_enhancements = enhancements.join(',');
    else deletedKeys.push('spice_enhancements');
  }
  if (smbios1Value.value !== originalSmbios1Value.value) setOptional('smbios1', smbios1Value.value);
  if (
    form.sevType !== original.value.sevType ||
    form.sevDebug !== original.value.sevDebug ||
    form.sevKeySharing !== original.value.sevKeySharing ||
    form.sevSmt !== original.value.sevSmt ||
    form.sevKernelHashes !== original.value.sevKernelHashes
  ) {
    if (form.sevType === '__default__') deletedKeys.push('amd-sev');
    else {
      const sev = [`type=${form.sevType}`];
      if (!form.sevDebug) sev.push('no-debug=1');
      if (form.sevType === 'snp' && !form.sevSmt) sev.push('allow-smt=0');
      if (form.sevType !== 'snp' && !form.sevKeySharing) sev.push('no-key-sharing=1');
      if (form.sevKernelHashes) sev.push('kernel-hashes=1');
      data['amd-sev'] = sev.join(',');
    }
  }
  if (
    form.tdxType !== original.value.tdxType ||
    form.tdxAttestation !== original.value.tdxAttestation ||
    form.tdxVsockCid !== original.value.tdxVsockCid ||
    form.tdxVsockPort !== original.value.tdxVsockPort
  ) {
    if (form.tdxType === '__default__') deletedKeys.push('intel-tdx');
    else
      data['intel-tdx'] = [
        `type=${form.tdxType}`,
        `attestation=${form.tdxAttestation ? 1 : 0}`,
        `vsock-cid=${form.tdxVsockCid || '2'}`,
        `vsock-port=${form.tdxVsockPort || '4050'}`,
      ].join(',');
  }
  if (props.guestType === 'lxc') {
    if (form.console !== original.value.console) data.console = form.console ? 1 : 0;
    if (form.tty !== original.value.tty) {
      if (form.tty.trim()) data.tty = form.tty.trim();
      else deletedKeys.push('tty');
    }
    if (form.cmode !== original.value.cmode) {
      if (form.cmode === '__default__') deletedKeys.push('cmode');
      else data.cmode = form.cmode;
    }
    const featureChanged = [
      'featureKeyctl',
      'featureNesting',
      'featureNfs',
      'featureCifs',
      'featureFuse',
      'featureMknod',
    ].some(
      (key) =>
        form[key as keyof typeof form] !== original.value[key as keyof typeof original.value],
    );
    if (featureChanged) {
      const features = [
        form.featureKeyctl ? 'keyctl=1' : '',
        form.featureNesting ? 'nesting=1' : '',
        form.featureNfs || form.featureCifs
          ? `mount=${[form.featureNfs ? 'nfs' : '', form.featureCifs ? 'cifs' : ''].filter(Boolean).join(';')}`
          : '',
        form.featureFuse ? 'fuse=1' : '',
        form.featureMknod ? 'mknod=1' : '',
      ]
        .filter(Boolean)
        .join(',');
      if (features) data.features = features;
      else deletedKeys.push('features');
    }
    if (form.entrypoint !== original.value.entrypoint) setOptional('entrypoint', form.entrypoint);
    if (envValue.value !== originalEnv.value) {
      if (envValue.value) data.env = envValue.value;
      else deletedKeys.push('env');
    }
  }
  if (deletedKeys.length) data.delete = deletedKeys.join(',');
  if (Object.keys(data).length === 1) return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data, props.guestType);
    Notify.create({ type: 'positive', message: gettext('VM configuration saved successfully') });
    emit('updated');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.node, props.vmid, textValue(props.config.digest)],
  () => {
    void loadPending();
    void loadVmStateStorages();
  },
  { immediate: true },
);
watch(() => props.config, syncForm, { immediate: true });
</script>

<template>
  <q-form class="vm-config-legacy vm-options-tab u-hidden-error" @submit.prevent="save">
    <div class="row q-gutter-sm q-py-sm options-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRevertSelected ? 'primary' : 'grey'"
        :disable="!canRevertSelected || !canRevertCurrentOption"
        :loading="loading"
        :label="gettext('Revert')"
        @click="revertSelected"
      />
    </div>
    <div class="row">
      <div class="col-7 options-list-column">
        <div class="u-border q-pa-sm options-scroll options-list-panel">
          <div
            v-for="row in basicOptionRows"
            :key="row.key"
            class="cursor-pointer q-px-sm row options-list-row"
            :class="{ 'bg-blue-2 text-grey-1': selectedOption === row.key }"
            @click="selectedOption = row.key"
          >
            <div class="col-4 text-grey-10 options-list-label">
              <q-icon :name="optionIcon(row.key)" size="16px" class="q-mr-xs options-list-icon" />{{
                row.label
              }}:
            </div>
            <div class="col-8 text-grey-8 options-list-value">{{ row.value }}</div>
          </div>
          <div v-if="advancedOptionRows.length" class="options-advanced-list">
            <div class="options-advanced-heading">
              <q-icon name="tune" size="15px" />{{ gettext('Advanced settings') }}
            </div>
            <div
              v-for="row in advancedOptionRows"
              :key="row.key"
              class="cursor-pointer q-px-sm row options-list-row"
              :class="{ 'bg-blue-2 text-grey-1': selectedOption === row.key }"
              @click="selectedOption = row.key"
            >
              <div class="col-4 text-grey-10 options-list-label">
                <q-icon
                  :name="optionIcon(row.key)"
                  size="16px"
                  class="q-mr-xs options-list-icon"
                />{{ row.label }}:
              </div>
              <div class="col-8 text-grey-8 options-list-value">{{ row.value }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-5 options-editor-column">
        <div class="u-border u-hidden-error options-scroll options-editor">
          <div class="q-pa-sm">
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">
                {{ optionRows.find((row) => row.key === selectedOption)?.label }}
              </div>
              <q-space />
              <q-btn
                no-caps
                flat
                size="12px"
                class="bg-primary text-grey-1 u-button"
                type="submit"
                :disable="!canSave"
                :loading="loading"
                :label="gettext('Save')"
              />
            </div>
            <div v-if="isLxcReadOnlyOption" class="hardware-editor-hint">
              {{ gettext('This option cannot be edited.') }}
            </div>
            <div class="row q-col-gutter-lg">
              <div v-show="selectedOption === 'name'" class="col-12 col-md-6">
                <q-input v-model="form.name" dense :label="gettext('Name')" />
              </div>
              <div v-show="selectedOption === 'description'" class="col-12">
                <q-input
                  v-model="form.description"
                  dense
                  type="textarea"
                  autogrow
                  :label="gettext('Description')"
                />
              </div>
              <div v-show="selectedOption === 'onboot'" class="col-12">
                <q-checkbox
                  v-model="form.onboot"
                  dense
                  color="primary"
                  :label="gettext('Start at boot')"
                />
              </div>
              <div v-show="selectedOption === 'protection'" class="col-12">
                <q-checkbox
                  v-model="form.protection"
                  dense
                  color="primary"
                  :label="props.guestType === 'lxc' ? gettext('Enabled') : gettext('Protection')"
                />
              </div>
              <div
                v-show="props.guestType === 'lxc' && selectedOption === 'console'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.console"
                  dense
                  color="primary"
                  :disable="!canConfigureOptions"
                  label="/dev/console"
                />
              </div>
              <div
                v-show="props.guestType === 'lxc' && selectedOption === 'tty'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.tty"
                  dense
                  type="number"
                  min="0"
                  max="6"
                  :disable="!canConfigureOptions"
                  :label="gettext('TTY count')"
                  :placeholder="gettext('Default')"
                />
              </div>
              <div
                v-show="props.guestType === 'lxc' && selectedOption === 'cmode'"
                class="col-12 col-md-6"
              >
                <q-select
                  v-model="form.cmode"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :disable="!canConfigureOptions"
                  :options="[
                    { label: `${gettext('Default')} (tty)`, value: '__default__' },
                    { label: '/dev/tty[X]', value: 'tty' },
                    { label: '/dev/console', value: 'console' },
                    { label: 'shell', value: 'shell' },
                  ]"
                  :label="gettext('Console mode')"
                />
              </div>
              <div
                v-show="props.guestType === 'lxc' && selectedOption === 'features'"
                class="col-12"
              >
                <div class="column">
                  <q-checkbox
                    v-model="form.featureKeyctl"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures || !optionEnabled(props.config.unprivileged)"
                    :label="gettext('keyctl')"
                  /><q-checkbox
                    v-model="form.featureNesting"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures"
                    :label="gettext('Nesting')"
                  /><q-checkbox
                    v-model="form.featureNfs"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures || optionEnabled(props.config.unprivileged)"
                    label="NFS"
                  /><q-checkbox
                    v-model="form.featureCifs"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures || optionEnabled(props.config.unprivileged)"
                    label="SMB/CIFS"
                  /><q-checkbox
                    v-model="form.featureFuse"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures"
                    label="FUSE"
                  /><q-checkbox
                    v-model="form.featureMknod"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures"
                    :label="gettext('Create Device Nodes') + ' (' + gettext('Experimental') + ')'"
                  />
                </div>
              </div>
              <div
                v-show="props.guestType === 'lxc' && selectedOption === 'entrypoint'"
                class="col-12"
              >
                <q-input
                  v-model="form.entrypoint"
                  dense
                  :disable="!canConfigureOptions"
                  :label="gettext('Entrypoint Init Command')"
                  placeholder="/sbin/init"
                />
                <div class="option-hint q-mt-sm">
                  {{ gettext('Changing the entrypoint command can lead to start failure!') }}
                </div>
              </div>
              <div v-show="props.guestType === 'lxc' && selectedOption === 'env'" class="col-12">
                <div class="row q-col-gutter-sm text-caption text-grey-7 q-mb-xs">
                  <div class="col-5">{{ gettext('Name') }}</div>
                  <div class="col-6">{{ gettext('Value') }}</div>
                </div>
                <div v-for="row in envRows" :key="row.id" class="row q-col-gutter-sm q-mb-sm">
                  <div class="col-5">
                    <q-input v-model="row.name" dense :disable="!canConfigureOptions" />
                  </div>
                  <div class="col-6">
                    <q-input v-model="row.value" dense :disable="!canConfigureOptions" />
                  </div>
                  <div class="col-1">
                    <q-btn
                      flat
                      round
                      dense
                      size="sm"
                      color="negative"
                      icon="delete"
                      :disable="!canConfigureOptions"
                      @click="removeEnvRow(row.id)"
                    />
                  </div>
                </div>
                <q-btn
                  no-caps
                  flat
                  size="12px"
                  color="primary"
                  class="u-button"
                  :disable="!canConfigureOptions"
                  :label="gettext('Add Variable')"
                  @click="addEnvRow"
                />
              </div>
              <div v-show="selectedOption === 'agent'" class="col-12">
                <div class="column agent-options">
                  <q-checkbox
                    v-model="form.agent"
                    dense
                    color="primary"
                    :label="gettext('Use QEMU Guest Agent')"
                  />
                  <q-checkbox
                    v-model="form.agentFstrimClonedDisks"
                    dense
                    color="primary"
                    :disable="!form.agent"
                    :label="gettext('Run guest-trim after a disk move or VM migration')"
                  />
                  <q-checkbox
                    v-model="form.agentFreezeFs"
                    dense
                    color="primary"
                    :disable="!form.agent"
                    :label="
                      gettext(
                        'Freeze/thaw guest filesystems during certain operations for consistency',
                      )
                    "
                  />
                  <div v-if="form.agent && !form.agentFreezeFs" class="option-hint">
                    {{
                      gettext(
                        'Freeze/thaw for guest filesystems disabled. This can lead to inconsistent disk images during snapshots, backups, and similar operations.',
                      )
                    }}
                  </div>
                  <div v-if="form.agent" class="option-hint">
                    {{ gettext('Make sure the QEMU Guest Agent is installed in the VM') }}
                  </div>
                  <q-checkbox
                    v-model="agentAdvanced"
                    dense
                    color="primary"
                    class="q-mt-sm"
                    :label="gettext('Advanced')"
                  />
                </div>
                <div v-show="agentAdvanced" class="row q-col-gutter-lg q-mt-sm">
                  <div class="col-12 col-md-6">
                    <q-select
                      v-model="form.agentType"
                      dense
                      options-dense
                      emit-value
                      map-options
                      :disable="!form.agent"
                      :options="[
                        { label: `${gettext('Default')} (VirtIO)`, value: '__default__' },
                        { label: 'VirtIO', value: 'virtio' },
                        { label: 'ISA', value: 'isa' },
                      ]"
                      :label="gettext('Type')"
                    />
                  </div>
                </div>
              </div>
              <div v-show="selectedOption === 'acpi'" class="col-12">
                <q-checkbox
                  v-model="form.acpi"
                  dense
                  color="primary"
                  :label="gettext('ACPI support')"
                />
              </div>
              <div v-show="selectedOption === 'kvm'" class="col-12">
                <q-checkbox
                  v-model="form.kvm"
                  dense
                  color="primary"
                  :label="gettext('KVM hardware virtualization')"
                />
              </div>
              <div v-show="selectedOption === 'tablet'" class="col-12">
                <q-checkbox
                  v-model="form.tablet"
                  dense
                  color="primary"
                  :label="gettext('USB Tablet')"
                />
              </div>
              <div v-show="selectedOption === 'hotplug'" class="col-12 col-md-6">
                <div class="column hotplug-options">
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="disk"
                    dense
                    color="primary"
                    :label="gettext('Disk')"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="network"
                    dense
                    color="primary"
                    :label="gettext('Network')"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="usb"
                    dense
                    color="primary"
                    label="USB"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="memory"
                    dense
                    color="primary"
                    :label="gettext('Memory')"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="cpu"
                    dense
                    color="primary"
                    :label="gettext('CPU')"
                  />
                </div>
              </div>
              <div v-show="selectedOption === 'startup'" class="col-12 col-md-6">
                <q-input
                  v-model="form.startupOrder"
                  dense
                  :disable="props.guestType === 'lxc' && !canModifyNode"
                  :label="gettext('Start/Shutdown order')"
                  :placeholder="gettext('any')"
                />
                <q-input
                  v-model="form.startupUp"
                  dense
                  :disable="props.guestType === 'lxc' && !canModifyNode"
                  class="q-mt-sm"
                  :label="gettext('Startup delay')"
                  :placeholder="gettext('default')"
                />
                <q-input
                  v-model="form.startupDown"
                  dense
                  :disable="props.guestType === 'lxc' && !canModifyNode"
                  class="q-mt-sm"
                  :label="gettext('Shutdown timeout')"
                  :placeholder="gettext('default')"
                />
              </div>
              <div
                v-show="selectedOption === 'ostype' && props.guestType !== 'lxc'"
                class="col-12 col-md-6"
              >
                <q-select
                  v-model="form.osBase"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :options="osTypeGroups"
                  :label="gettext('Type')"
                  @update:model-value="selectOsBase"
                />
                <q-select
                  v-model="form.ostype"
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="q-mt-sm"
                  :options="osVersionOptions"
                  :label="gettext('Version')"
                />
              </div>
              <div v-show="selectedOption === 'boot'" class="col-12">
                <q-markup-table dense flat bordered class="boot-order-table">
                  <thead>
                    <tr>
                      <th class="text-left">#</th>
                      <th class="text-left">{{ gettext('Enabled') }}</th>
                      <th class="text-left">{{ gettext('Device') }}</th>
                      <th class="text-left">{{ gettext('Description') }}</th>
                    </tr>
                  </thead>
                  <tbody ref="bootTableBody">
                    <tr
                      v-for="(row, index) in bootRows"
                      :key="row.name"
                      :class="['boot-order-row', { 'text-grey-6': !row.enabled }]"
                    >
                      <td>
                        <q-icon
                          name="drag_indicator"
                          size="16px"
                          class="boot-order-drag-handle q-mr-xs"
                        />{{ index + 1 }}
                      </td>
                      <td><q-checkbox v-model="row.enabled" dense color="primary" /></td>
                      <td>{{ row.name }}</td>
                      <td class="boot-order-description">
                        <div class="ellipsis">
                          {{ row.description }}<q-tooltip>{{ row.description }}</q-tooltip>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!bootRows.length">
                      <td colspan="4" class="text-center text-grey-7">
                        {{ gettext('No bootable devices available') }}
                      </td>
                    </tr>
                  </tbody>
                </q-markup-table>
                <div class="text-caption text-grey-7 q-mt-xs">
                  {{ gettext('Use the arrow buttons to reorder devices') }}
                </div>
              </div>
              <div v-show="selectedOption === 'freeze'" class="col-12 col-md-6">
                <q-checkbox
                  v-model="form.freeze"
                  dense
                  color="primary"
                  :label="gettext('Freeze CPU at startup')"
                />
              </div>
              <div v-show="selectedOption === 'localtime'" class="col-12 col-md-6">
                <q-select
                  v-model="form.localtime"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :label="gettext('Use local time for RTC')"
                  :options="[
                    { label: gettext('Default'), value: '__default__' },
                    { label: gettext('Yes'), value: '1' },
                    { label: gettext('No'), value: '0' },
                  ]"
                />
              </div>
              <div v-show="selectedOption === 'startdate'" class="col-12 col-md-6">
                <q-input
                  v-model="form.startdate"
                  dense
                  :label="gettext('RTC start date')"
                  hint="now or YYYY-MM-DDTHH:MM:SS"
                />
              </div>
              <div v-show="selectedOption === 'vmstatestorage'" class="col-12 col-md-6">
                <SelectTable
                  v-model="form.vmstatestorage"
                  row-key="storage"
                  field-style="standard"
                  width="500px"
                  :rows="vmStateStorageOptions"
                  :columns="vmStateStorageColumns"
                  :display-value="vmStateStorageDisplayValue"
                  :get-row-value="(row) => textValue(row.storage)"
                  :label="gettext('VM State storage')"
                >
                  <template #selected>
                    <span
                      :class="
                        form.vmstatestorage ? 'text-primary text-weight-medium' : 'text-grey-6'
                      "
                    >
                      {{ vmStateStorageDisplayValue }}
                    </span>
                  </template>
                </SelectTable>
              </div>
              <div v-show="selectedOption === 'spice'" class="col-12 col-md-6">
                <q-checkbox
                  v-model="form.spiceFolderSharing"
                  dense
                  color="primary"
                  :label="gettext('SPICE Folder Sharing')"
                /><q-select
                  v-model="form.spiceVideoStreaming"
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="q-mt-sm"
                  :label="gettext('SPICE Video Streaming')"
                  :options="[
                    { label: gettext('Off'), value: 'off' },
                    { label: gettext('All'), value: 'all' },
                    { label: gettext('Filter'), value: 'filter' },
                  ]"
                />
                <div v-if="!spiceDisplayIsQxl" class="option-hint">
                  {{
                    gettext(
                      'To use these features set the display to SPICE in the hardware settings of the VM.',
                    )
                  }}
                </div>
                <div v-if="form.spiceFolderSharing" class="option-hint">
                  {{ gettext('Make sure the SPICE WebDav daemon is installed in the VM.') }}
                </div>
              </div>
              <div v-show="selectedOption === 'smbios1'" class="col-12">
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <q-input v-model="form.smbiosUuid" dense label="UUID" />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosManufacturer"
                      dense
                      type="textarea"
                      autogrow
                      :label="gettext('Manufacturer')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosProduct"
                      dense
                      type="textarea"
                      autogrow
                      :label="gettext('Product')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosVersion"
                      dense
                      type="textarea"
                      autogrow
                      :label="gettext('Version')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosSerial"
                      dense
                      type="textarea"
                      autogrow
                      :label="gettext('Serial')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input v-model="form.smbiosSku" dense type="textarea" autogrow label="SKU" />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosFamily"
                      dense
                      type="textarea"
                      autogrow
                      :label="gettext('Family')"
                    />
                  </div>
                </div>
              </div>
              <div v-show="selectedOption === 'sev'" class="col-12 col-md-6">
                <q-select
                  v-model="form.sevType"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :disable="!canConfigureHardware"
                  :label="gettext('AMD SEV Type')"
                  :options="[
                    {
                      label: `${gettext('Default')} (${gettext('Disabled')})`,
                      value: '__default__',
                    },
                    { label: gettext('AMD SEV'), value: 'std' },
                    { label: gettext('AMD SEV-ES'), value: 'es' },
                    { label: gettext('AMD SEV-SNP'), value: 'snp' },
                  ]"
                />
                <div v-if="form.sevType !== '__default__'" class="q-mt-sm">
                  <q-checkbox
                    v-model="form.sevDebug"
                    dense
                    color="primary"
                    :disable="!canConfigureHardware"
                    :label="gettext('Allow Debugging')"
                  /><q-checkbox
                    v-if="form.sevType !== 'snp'"
                    v-model="form.sevKeySharing"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :disable="!canConfigureHardware"
                    :label="gettext('Allow Key-Sharing')"
                  /><q-checkbox
                    v-if="form.sevType === 'snp'"
                    v-model="form.sevSmt"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :disable="!canConfigureHardware"
                    :label="gettext('Allow SMT')"
                  /><q-checkbox
                    v-model="form.sevKernelHashes"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :disable="!canConfigureHardware"
                    :label="gettext('Enable Kernel Hashes')"
                  />
                </div>
              </div>
              <div v-show="selectedOption === 'tdx'" class="col-12 col-md-6">
                <q-select
                  v-model="form.tdxType"
                  dense
                  options-dense
                  emit-value
                  map-options
                  :disable="!canConfigureHardware"
                  :label="gettext('Intel TDX Type')"
                  :options="[
                    {
                      label: `${gettext('Default')} (${gettext('Disabled')})`,
                      value: '__default__',
                    },
                    { label: gettext('Intel TDX'), value: 'tdx' },
                  ]"
                />
                <div v-if="form.tdxType === 'tdx'" class="q-mt-sm">
                  <q-checkbox
                    v-model="form.tdxAttestation"
                    dense
                    color="primary"
                    :disable="!canConfigureHardware"
                    :label="gettext('Enable Attestation')"
                  />
                  <div class="row q-col-gutter-sm q-mt-xs">
                    <div class="col-6">
                      <q-input
                        v-model="form.tdxVsockCid"
                        dense
                        type="number"
                        min="2"
                        :disable="!canConfigureHardware || !form.tdxAttestation"
                        :label="gettext('CID')"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="form.tdxVsockPort"
                        dense
                        type="number"
                        min="0"
                        :disable="!canConfigureHardware || !form.tdxAttestation"
                        :label="gettext('Port')"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </q-form>
</template>

<style scoped lang="scss">
.vm-config-legacy {
  padding: 8px;
  font-size: 13px;
}
.options-toolbar {
  margin-top: 0;
  margin-bottom: 4px;
}
.options-scroll {
  font-size: 13px;
  background: #fff;
}
.options-list-column {
  display: flex;
  overflow: hidden;
  align-self: stretch;
}
.options-editor-column {
  display: flex;
  overflow: hidden;
  background: #fff;
}
.options-list-panel {
  flex: 1 1 auto;
  height: 100%;
  border-right: 0;
}
.options-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 100%;
  border-left: 1px solid #d7dce2;
}
.options-list-row {
  min-height: 30px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}
.options-list-label {
  align-self: flex-start;
  padding-top: 6px;
}
.options-list-icon {
  vertical-align: text-bottom;
}
.options-list-value {
  min-width: 0;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 18px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.options-list-row:last-child {
  border-bottom: 0;
}
.options-list-row:hover {
  background: #f4f8fc;
}
.options-list-row.bg-blue-2 {
  background: #e6f1fb !important;
}
.options-list-row.bg-blue-2 :deep(.text-grey-10),
.options-list-row.bg-blue-2 :deep(.text-grey-8) {
  color: #1f4f78 !important;
}
.editor-titlebar {
  min-height: 38px;
  margin: -4px -4px 10px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #d7dce2;
}
.editor-title {
  font-weight: 600;
  color: #334155;
}
.options-advanced-list {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #e2e8f0;
}
.options-advanced-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 8px;
  color: #52606d;
  font-size: 12px;
  font-weight: 600;
  background: #f7fafc;
}
.boot-order-table {
  width: 100%;
  overflow: visible;
  font-size: 12px;
}
.boot-order-table :deep(.q-table__container) {
  overflow: visible;
}
.boot-order-table :deep(table) {
  width: 100%;
  table-layout: fixed;
}
.boot-order-table :deep(th:nth-child(1)) {
  width: 64px;
}
.boot-order-table :deep(th:nth-child(2)) {
  width: 76px;
}
.boot-order-table :deep(th:nth-child(3)) {
  width: 120px;
}
.boot-order-description {
  overflow: hidden;
}
.boot-order-drag-handle {
  cursor: grab;
  color: #778495;
  touch-action: none;
}
.boot-order-drag-handle:active {
  cursor: grabbing;
}
.boot-order-row--ghost {
  background: #e6f1fb;
  opacity: 0.7;
}
.hotplug-options {
  align-items: flex-start;
}
.agent-options {
  align-items: flex-start;
}
.option-hint {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
.hardware-editor-hint {
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
.vm-options-tab :deep(.q-checkbox) {
  min-height: 30px;
}
@media (prefers-reduced-motion: reduce) {
  .options-list-row {
    transition: none;
  }
}
</style>
