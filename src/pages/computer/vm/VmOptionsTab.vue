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
import { getVmConfig, getVmPendingConfig, revertVmConfig, updateVmConfig } from '@/api/overview';
import { getNodeStorage } from '@/api/storageContent';
import SelectTable from '@/components/SelectTable.vue';
import { getClusterResources, type PveRecord } from '@/api/resources';
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
const qemuOptionCapabilities: Record<string, string[]> = {
  name: ['VM.Config.Options'],
  description: ['VM.Config.Options'],
  onboot: ['VM.Config.Options'],
  ostype: ['VM.Config.Options'],
  boot: ['VM.Config.Disk'],
  tablet: ['VM.Config.HWType'],
  hotplug: ['VM.Config.HWType'],
  startup: ['VM.Config.Options', 'Sys.Modify'],
  acpi: ['VM.Config.HWType'],
  kvm: ['VM.Config.HWType'],
  freeze: ['VM.PowerMgmt'],
  localtime: ['VM.Config.Options'],
  startdate: ['VM.Config.Options'],
  vmstatestorage: ['VM.Config.Options'],
  smbios1: ['VM.Config.HWType'],
  agent: ['VM.Config.Options'],
  protection: ['VM.Config.Options'],
  spice: ['VM.Config.Options'],
  sev: ['VM.Config.HWType'],
  tdx: ['VM.Config.HWType'],
};
const dnsNamePattern =
  /^(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\.)*(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?))$/;
const qemuStartDatePattern = /^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/;
const uuidPattern = /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;

function osBaseFor(ostype: string) {
  return (
    osTypeGroups.find((group) => group.versions.some((version) => version.value === ostype))
      ?.value || 'Other'
  );
}

const props = withDefaults(
  defineProps<{ node: string; vmid: string; config: PveRecord; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' }
);
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const hostArchitecture = shallowRef('');
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
/**
 * Config snapshot (with digest) locked while the current option is edited.
 * The form is (re)built from this snapshot when an option is opened, and the
 * save request uses its digest — mirroring PVE editors which load /config on
 * open. The parent's periodic refresh of props.config never touches the form.
 */
const editConfig = shallowRef<PveRecord>({ ...props.config });
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
      .join(';')}`
);
const originalSmbios1Value = shallowRef('');
const hotplugFeatures = ref<string[]>([]);
const originalHotplugValue = shallowRef('');
const hotplugValue = computed(
  () =>
    hotplugFeatureOrder.filter((feature) => hotplugFeatures.value.includes(feature)).join(',') ||
    '0'
);
const canConfigureOptions = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Options'])
);
const canConfigureHardware = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.HWType'])
);
const canConfigureDisk = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Disk'])
);
const canManagePower = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.PowerMgmt'])
);
const canModifyNode = computed(() =>
  Boolean((session.caps as unknown as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify'])
);
const canEditLxcFeatures = computed(
  () =>
    session.userid === 'root@pam' ||
    (Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Allocate']) &&
      optionEnabled(props.config.unprivileged))
);
const envValue = computed(() =>
  envRows.value
    .filter((row) => row.name.trim())
    .map((row) => `${row.name.trim()}=${row.value}`)
    .join('\0')
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
      envValue.value !== originalEnv.value)
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
function hasQemuOptionCapability(option: string) {
  return (qemuOptionCapabilities[option] || []).every((capability) => {
    if (capability === 'Sys.Modify') return canModifyNode.value;
    if (capability === 'VM.Config.Disk') return canConfigureDisk.value;
    if (capability === 'VM.Config.HWType') return canConfigureHardware.value;
    if (capability === 'VM.PowerMgmt') return canManagePower.value;
    return canConfigureOptions.value;
  });
}
function canEditOption(option: string) {
  if (props.guestType !== 'qemu') return !isLxcReadOnlyOption.value && canConfigureOptions.value;
  return hasQemuOptionCapability(option);
}
const selectedOptionEditable = computed(() => canEditOption(selectedOption.value));
const changedQemuOptions = computed(() => {
  const changed = new Set<string>();
  if (form.name !== original.value.name) changed.add('name');
  if (form.description !== original.value.description) changed.add('description');
  if (form.onboot !== original.value.onboot) changed.add('onboot');
  if (form.protection !== original.value.protection) changed.add('protection');
  if (
    form.agent !== original.value.agent ||
    form.agentFstrimClonedDisks !== original.value.agentFstrimClonedDisks ||
    form.agentFreezeFs !== original.value.agentFreezeFs ||
    form.agentType !== original.value.agentType
  )
    changed.add('agent');
  if (form.acpi !== original.value.acpi) changed.add('acpi');
  if (form.kvm !== original.value.kvm) changed.add('kvm');
  if (form.tablet !== original.value.tablet) changed.add('tablet');
  if (hotplugValue.value !== originalHotplugValue.value) changed.add('hotplug');
  if (startupValue.value !== original.value.startup) changed.add('startup');
  if (form.ostype !== original.value.ostype) changed.add('ostype');
  if (bootValue.value !== originalBootValue.value) changed.add('boot');
  if (form.freeze !== original.value.freeze) changed.add('freeze');
  if (form.localtime !== original.value.localtime) changed.add('localtime');
  if (form.startdate !== original.value.startdate) changed.add('startdate');
  if (form.vmstatestorage !== original.value.vmstatestorage) changed.add('vmstatestorage');
  if (
    form.spiceFolderSharing !== original.value.spiceFolderSharing ||
    form.spiceVideoStreaming !== original.value.spiceVideoStreaming
  )
    changed.add('spice');
  if (smbios1Value.value !== originalSmbios1Value.value) changed.add('smbios1');
  if (
    [...hardwareFields].some(
      (key) => form[key as keyof typeof form] !== original.value[key as keyof typeof original.value]
    )
  ) {
    if (
      [...hardwareFields].some(
        (key) =>
          key.startsWith('sev') &&
          form[key as keyof typeof form] !== original.value[key as keyof typeof original.value]
      )
    )
      changed.add('sev');
    if (
      [...hardwareFields].some(
        (key) =>
          key.startsWith('tdx') &&
          form[key as keyof typeof form] !== original.value[key as keyof typeof original.value]
      )
    )
      changed.add('tdx');
  }
  return changed;
});
const nameValidationError = computed(() =>
  form.name.trim() && !dnsNamePattern.test(form.name.trim()) ? gettext('Invalid DNS name') : ''
);
const startdateValidationError = computed(() =>
  form.startdate.trim() && !qemuStartDatePattern.test(form.startdate.trim())
    ? gettext('Invalid RTC start date')
    : ''
);
const smbiosUuidValidationError = computed(() =>
  form.smbiosUuid.trim() && !uuidPattern.test(form.smbiosUuid.trim()) ? gettext('Invalid UUID') : ''
);
// PVE TdxEdit uses proxmoxintegerfield with allowBlank=false for CID (min 2)
// and Port (min 0); they are only meaningful while TDX + attestation are on.
const tdxFieldsRequired = computed(() => form.tdxType === 'tdx' && form.tdxAttestation);
const tdxCidValid = computed(
  () =>
    !tdxFieldsRequired.value ||
    (form.tdxVsockCid.trim() !== '' &&
      /^\d+$/.test(form.tdxVsockCid.trim()) &&
      Number(form.tdxVsockCid) >= 2)
);
const tdxPortValid = computed(
  () =>
    !tdxFieldsRequired.value ||
    (form.tdxVsockPort.trim() !== '' &&
      /^\d+$/.test(form.tdxVsockPort.trim()) &&
      Number(form.tdxVsockPort) >= 0)
);
const tdxCidError = computed(() =>
  tdxFieldsRequired.value
    ? form.tdxVsockCid.trim()
      ? gettext('Minimum value is 2')
      : gettext('This field is required')
    : ''
);
const tdxPortError = computed(() =>
  tdxFieldsRequired.value
    ? form.tdxVsockPort.trim()
      ? gettext('Minimum value is 0')
      : gettext('This field is required')
    : ''
);
const hasValidationError = computed(() =>
  Boolean(
    nameValidationError.value ||
    startdateValidationError.value ||
    smbiosUuidValidationError.value ||
    !tdxCidValid.value ||
    !tdxPortValid.value
  )
);
const canSave = computed(() => {
  if (hasValidationError.value) return false;
  if (props.guestType === 'lxc')
    return (
      (lxcAdvancedChanged.value ||
        Object.entries(form).some(
          ([key, value]) => value !== original.value[key as keyof typeof original.value]
        )) &&
      canConfigureOptions.value
    );
  return (
    changedQemuOptions.value.size > 0 &&
    [...changedQemuOptions.value].every(hasQemuOptionCapability)
  );
});
const spiceDisplayIsQxl = computed(() =>
  /^qxl\d?$/.test(textValue(parseProperties(editConfig.value.vga).type))
);
const startupValue = computed(() =>
  [
    form.startupOrder.trim() ? `order=${form.startupOrder.trim()}` : '',
    form.startupUp.trim() ? `up=${form.startupUp.trim()}` : '',
    form.startupDown.trim() ? `down=${form.startupDown.trim()}` : '',
  ]
    .filter(Boolean)
    .join(',')
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
const guestArchitecture = computed(() => {
  const configured = textValue(editConfig.value.arch);
  return configured && configured !== '__default__'
    ? configured
    : hostArchitecture.value || 'x86_64';
});
const availableOsTypeGroups = computed(() =>
  guestArchitecture.value === 'aarch64'
    ? osTypeGroups
        .filter((group) => ['Linux', 'Other'].includes(group.value))
        .map((group) => ({
          ...group,
          versions: group.versions.filter((version) => ['l26', 'other'].includes(version.value)),
        }))
    : osTypeGroups
);
const osVersionOptions = computed(
  () =>
    (availableOsTypeGroups.value.find((group) => group.value === form.osBase) || otherOsTypeGroup)
      .versions
);
const selectedOption = shallowRef(props.guestType === 'lxc' ? 'onboot' : 'name');
const isLxcReadOnlyOption = computed(
  () =>
    props.guestType === 'lxc' &&
    ['ostype', 'arch', 'unprivileged', 'hookscript'].includes(selectedOption.value)
);
const isReadOnlyOption = computed(
  () =>
    isLxcReadOnlyOption.value ||
    (props.guestType === 'qemu' && selectedOption.value === 'hookscript')
);
const agentAdvanced = shallowRef(false);
const pendingRows = shallowRef<PveRecord[]>([]);
const vmStateStorageOptions = shallowRef<PveRecord[]>([]);
const vmStateStorageDisplayValue = computed(
  () => form.vmstatestorage || gettext("Automatic (Storage used by the VM, or 'local')")
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
  Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row]))
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
  const config = props.config;
  const current = (key: string, fallback = '') =>
    formatOptionValue(key, textValue(config[key], fallback), config);
  return [
    { key: 'name', label: gettext('Name'), value: textValue(config.name) || '-' },
    { key: 'description', label: '中文名称', value: textValue(config.description) || '--' },
    { key: 'onboot', label: gettext('Start at boot'), value: current('onboot') },
    { key: 'ostype', label: gettext('OS Type'), value: current('ostype') },
    { key: 'boot', label: gettext('Boot Order'), value: current('boot') },
    { key: 'tablet', label: gettext('USB Tablet'), value: current('tablet', '1') },
    { key: 'hotplug', label: gettext('Hotplug'), value: current('hotplug') },
    { key: 'startup', label: gettext('Startup/Shutdown order'), value: current('startup') },
    { key: 'acpi', label: gettext('ACPI support'), value: current('acpi', '1') },
    { key: 'kvm', label: gettext('KVM hardware virtualization'), value: current('kvm', '1') },
    { key: 'freeze', label: gettext('Freeze CPU at startup'), value: current('freeze') },
    {
      key: 'localtime',
      label: gettext('Use local time for RTC'),
      value: current('localtime', '__default__'),
    },
    { key: 'startdate', label: gettext('RTC start date'), value: current('startdate', 'now') },
    { key: 'vmstatestorage', label: gettext('VM State storage'), value: current('vmstatestorage') },
    { key: 'smbios1', label: gettext('SMBIOS settings (type1)'), value: current('smbios1') },
    { key: 'agent', label: gettext('QEMU Guest Agent'), value: current('agent') },
    { key: 'protection', label: gettext('Protection'), value: current('protection') },
    { key: 'spice', label: gettext('Spice Enhancements'), value: current('spice') },
    { key: 'sev', label: gettext('AMD SEV Type'), value: current('sev') },
    { key: 'tdx', label: gettext('Intel TDX Type'), value: current('tdx') },
    { key: 'hookscript', label: gettext('Hookscript'), value: textValue(config.hookscript) || '-' },
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
  'hookscript',
]);
const basicOptionRows = computed(() =>
  props.guestType === 'lxc'
    ? optionRows.value
    : optionRows.value.filter((row) => !advancedOptionKeys.has(row.key))
);
const advancedOptionRows = computed(() =>
  props.guestType === 'lxc' ? [] : optionRows.value.filter((row) => advancedOptionKeys.has(row.key))
);
const pendingKeyMap: Record<string, string[]> = {
  boot: ['boot', 'bootdisk'],
  spice: ['spice_enhancements'],
  sev: ['amd-sev'],
  tdx: ['intel-tdx'],
};
const pendingKeysForOption = (key: string) => pendingKeyMap[key] || [key];
const selectedPendingKeys = computed(() => pendingKeysForOption(selectedOption.value));
const canRevertSelected = computed(() =>
  selectedPendingKeys.value.some((key) => Boolean(pendingByKey.value[key]))
);
function pendingRowForOption(key: string) {
  return pendingKeysForOption(key)
    .map((pendingKey) => pendingByKey.value[pendingKey])
    .find(Boolean);
}
/** Extra values the pending formatter needs (e.g. bootdisk for boot). */
function pendingRelatedForOption(key: string) {
  if (key !== 'boot') return {};
  const bootdisk = pendingByKey.value.bootdisk;
  return { bootdisk: bootdisk ? textValue(bootdisk.pending ?? bootdisk.value) : '' };
}
function pendingValueForOption(key: string) {
  const row = pendingRowForOption(key);
  if (!row || row.delete) return '';
  const raw = textValue(row.pending ?? row.value);
  if (props.guestType !== 'qemu') {
    // LXC rows render their current values manually; keep the pending text raw
    // except for the shared Yes/No options.
    if (['onboot', 'protection'].includes(key)) return yesNo(raw);
    return raw;
  }
  return formatOptionValue(key, raw, pendingRelatedForOption(key));
}
function pendingDeleteForOption(key: string) {
  return Boolean(pendingRowForOption(key)?.delete);
}
const bootSelectionWarning = computed(
  () => bootRows.value.length > 0 && !bootRows.value.some((row) => row.enabled)
);
const bootRngWarning = computed(
  () =>
    textValue(editConfig.value.bios) === 'ovmf' &&
    !editConfig.value.rng0 &&
    bootRows.value.some((row) => row.enabled && /^net\d+$/.test(row.name))
);

async function loadPending() {
  try {
    const response = await getVmPendingConfig(props.node, props.vmid, props.guestType);
    pendingRows.value = response.data || [];
  } catch {
    // the global Notify already surfaced the error; keep the previous pending state
  }
}

async function loadVmStateStorages() {
  try {
    const response = await getNodeStorage(props.node, 'images');
    vmStateStorageOptions.value = (response.data || []).filter((storage) =>
      textValue(storage.storage)
    );
  } catch {
    // the global Notify already surfaced the error
  }
}

async function loadNodeArchitecture() {
  try {
    const response = await getClusterResources({ type: 'node' });
    const node = response.data?.find((item) => textValue(item.node) === props.node);
    hostArchitecture.value = textValue(node?.['host-arch']);
  } catch {
    // the global Notify already surfaced the error
  }
}

async function revertSelected() {
  if (!canRevertSelected.value) return;
  loading.value = true;
  try {
    await revertVmConfig(props.node, props.vmid, selectedPendingKeys.value, props.guestType);
    await loadPending();
    await loadEditSnapshot();
    emit('updated');
  } catch {
    // the global Notify already surfaced the error; consume the rejection here
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
      })
  );
}

/** PVE Parser.parsePropertyString equivalent: a bare token becomes `defaultKey`. */
function parsePropertyString(value: string, defaultKey?: string) {
  const result: Record<string, string> = {};
  value
    .split(',')
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) {
        if (defaultKey && result[defaultKey] === undefined) result[defaultKey] = part;
      } else {
        result[part.slice(0, idx)] = part.slice(idx + 1);
      }
    });
  return result;
}

/** PVE Parser.parseStartup equivalent. */
function parseStartup(value: string) {
  const result: Record<string, string> = {};
  value
    .split(',')
    .filter((part) => part.trim())
    .forEach((part) => {
      const match = part.match(/^(?:order=)?(\d+)$/);
      if (match && match[1] !== undefined) result.order = match[1];
      else if (part.startsWith('up=')) result.up = part.slice(3);
      else if (part.startsWith('down=')) result.down = part.slice(5);
    });
  return result;
}

// PVE Proxmox.Utils renderers (see manager6/qemu/Options.js + manager6/Utils.js)
const yesNo = (value: unknown) => (optionEnabled(value) ? gettext('Yes') : gettext('No'));

function formatLocaltime(value: string) {
  if (value === '__default__') return `${gettext('Default')} (${gettext('Enabled for Windows')})`;
  return yesNo(value);
}

function formatStartup(value: string) {
  const startup = parseStartup(value);
  let result = 'order=';
  result += startup.order === undefined ? 'any' : startup.order;
  if (startup.up !== undefined) result += `,up=${startup.up}`;
  if (startup.down !== undefined) result += `,down=${startup.down}`;
  return result;
}

function formatOsType(value: string) {
  if (!value) return 'Other';
  const group = osTypeGroups.find((item) =>
    item.versions.some((version) => version.value === value)
  );
  const version = group?.versions.find((item) => item.value === value);
  if (!group) return value;
  return version && version.label !== '-' ? `${group.label} ${version.label}` : group.label;
}

function formatBootOrder(value: string, bootdisk: string) {
  if (/^\s*$/.test(value)) return gettext('(No boot device selected)');
  const boot = parsePropertyString(value, 'legacy');
  if (boot.order) return boot.order.split(';').filter(Boolean).join(', ');
  const legacy = value.includes('=') ? textValue(boot.legacy) : value;
  const labels: string[] = [];
  for (const sel of legacy || 'cdn') {
    if (sel === 'c') labels.push(bootdisk || gettext('first disk'));
    else if (sel === 'n') labels.push(gettext('any net'));
    else if (sel === 'a') labels.push(gettext('Floppy'));
    else if (sel === 'd') labels.push(gettext('any CD-ROM'));
    else labels.push(sel);
  }
  return labels.join(', ');
}

function formatHotplug(value: string) {
  if (!value || value === '0') return gettext('Disabled');
  const source = value === '1' ? 'disk,network,usb' : value;
  const labels: Record<string, string> = {
    disk: gettext('Disk'),
    network: gettext('Network'),
    usb: 'USB',
    memory: gettext('Memory'),
    cpu: gettext('CPU'),
  };
  return source
    .split(',')
    .filter(Boolean)
    .map((item) => labels[item] || item)
    .join(', ');
}

function formatQga(value: string) {
  if (!value) return `${gettext('Default')} (${gettext('Disabled')})`;
  const qga = parsePropertyString(value, 'enabled');
  if (!optionEnabled(qga.enabled)) return gettext('Disabled');
  const parts: string[] = [gettext('Enabled')];
  Object.entries(qga).forEach(([key, item]) => {
    if (key === 'enabled') return;
    let display = gettext('Disabled');
    if (key === 'type') {
      const map: Record<string, string> = { isa: 'ISA', virtio: 'VirtIO' };
      display = map[item] || gettext('Unknown');
    } else if (key === 'freeze-fs-on-backup' && optionEnabled(item)) {
      return;
    } else if (key === 'freeze-fs' && optionEnabled(item)) {
      return;
    } else if (optionEnabled(item)) {
      display = gettext('Enabled');
    }
    parts.push(`${key}: ${display}`);
  });
  return parts.join(', ');
}

function formatSpice(value: string) {
  const props = parsePropertyString(value);
  if (!Object.keys(props).length) return gettext('none');
  const output: string[] = [];
  if (optionEnabled(props.foldersharing)) output.push(`Folder Sharing: ${gettext('Enabled')}`);
  if (props.videostreaming === 'all' || props.videostreaming === 'filter')
    output.push(`Video Streaming: ${props.videostreaming}`);
  return output.join(', ');
}

function formatSev(value: string) {
  const sev = parsePropertyString(value, 'type');
  if (sev.type === 'std') return `AMD SEV (${value})`;
  if (sev.type === 'es') return `AMD SEV-ES (${value})`;
  if (sev.type === 'snp') return `AMD SEV-SNP (${value})`;
  return value || `${gettext('Default')} (${gettext('Disabled')})`;
}

function formatTdx(value: string) {
  const tdx = parsePropertyString(value, 'type');
  if (tdx.type === 'tdx') return `Intel (${value})`;
  return value || `${gettext('Default')} (${gettext('Disabled')})`;
}

/**
 * Single PVE-equivalent formatter used for both the current and the pending
 * value of an option (mirrors PendingObjectGrid which passes `pending` to the
 * very same renderer). `related` carries extra keys the renderer needs, e.g.
 * bootdisk for the boot order.
 */
function formatOptionValue(key: string, value: string, related: PveRecord = {}) {
  switch (key) {
    case 'onboot':
    case 'acpi':
    case 'kvm':
    case 'tablet':
    case 'freeze':
    case 'protection':
      return yesNo(value);
    case 'localtime':
      return formatLocaltime(value);
    case 'startup':
      return formatStartup(value);
    case 'ostype':
      return formatOsType(value);
    case 'boot':
      return formatBootOrder(value, textValue(related.bootdisk));
    case 'hotplug':
      return formatHotplug(value);
    case 'startdate':
      return textValue(value, 'now');
    case 'vmstatestorage':
      return textValue(value) || gettext('Automatic');
    case 'smbios1':
      return textValue(value) || '-';
    case 'agent':
      return formatQga(value);
    case 'spice':
      return formatSpice(value);
    case 'sev':
      return formatSev(value);
    case 'tdx':
      return formatTdx(value);
    default:
      return textValue(value) || '-';
  }
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

function buildBootRows(source: PveRecord) {
  const devices = Object.entries(source)
    .filter(([key, value]) => isBootDevice(key, textValue(value)))
    .map(([name, value]) => ({ name, description: textValue(value) }));
  const byName = new Map(devices.map((device) => [device.name, device]));
  const rawBoot = textValue(source.boot);
  const boot = parseProperties(rawBoot);
  const bootOrder = textValue(boot.order);
  const orderedNames = bootOrder
    ? bootOrder.split(';').filter((name: string) => byName.has(name))
    : (() => {
        const legacy = rawBoot.includes('=') ? textValue(boot.legacy) : rawBoot;
        const names: string[] = [];
        const bootdisk = textValue(source.bootdisk);
        if (legacy.includes('c') && byName.has(bootdisk)) names.push(bootdisk);
        if (legacy.includes('d'))
          names.push(
            ...devices
              .filter((device) => /media=cdrom/.test(device.description))
              .map((device) => device.name)
          );
        if (legacy.includes('n'))
          names.push(
            ...devices.filter((device) => /^net\d+$/.test(device.name)).map((device) => device.name)
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
let pendingRefreshTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (!bootTableBody.value) return;
  bootSortable = Sortable.create(bootTableBody.value, {
    animation: 150,
    draggable: '.boot-order-row',
    handle: '.boot-order-drag-handle',
    ghostClass: 'boot-order-row--ghost',
    onEnd: ({ oldIndex, newIndex }: Sortable.SortableEvent) => {
      if (!selectedOptionEditable.value) return;
      if (oldIndex === undefined || newIndex === undefined) return;
      reorderBootDevice(oldIndex, newIndex);
    },
  });
});

onBeforeUnmount(() => {
  bootSortable?.destroy();
  if (pendingRefreshTimer) clearInterval(pendingRefreshTimer);
});

function syncForm(source: PveRecord = editConfig.value) {
  const spiceEnhancements = parseProperties(source.spice_enhancements);
  const agent = parseProperties(source.agent);
  const sev = parseProperties(source['amd-sev']);
  const tdx = parseProperties(source['intel-tdx']);
  const startup = parseProperties(source.startup);
  const features = parseProperties(source.features);
  const textValue = (value: unknown, fallback = '') =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
  const smbios1 = parseSmbios1(textValue(source.smbios1));
  const next = {
    name: textValue(source.name),
    description: textValue(source.description),
    onboot: Number(source.onboot || 0) === 1,
    protection: Number(source.protection || 0) === 1,
    agent: textValue(source.agent) === '1' || textValue(agent.enabled) === '1',
    agentFstrimClonedDisks: textValue(agent.fstrim_cloned_disks) === '1',
    agentFreezeFs: textValue(agent['freeze-fs'] || agent['freeze-fs-on-backup'] || '1') !== '0',
    agentType: ['virtio', 'isa'].includes(textValue(agent.type))
      ? textValue(agent.type)
      : '__default__',
    acpi: Number(source.acpi ?? 1) === 1,
    kvm: Number(source.kvm ?? 1) === 1,
    tablet: Number(source.tablet ?? 1) === 1,
    hotplug: textValue(source.hotplug),
    startup: textValue(source.startup),
    startupOrder: textValue(startup.order),
    startupUp: textValue(startup.up),
    startupDown: textValue(startup.down),
    osBase: osBaseFor(textValue(source.ostype, 'other')),
    ostype: textValue(source.ostype, 'other'),
    boot: textValue(source.boot),
    freeze: Number(source.freeze || 0) === 1,
    localtime: source.localtime === undefined ? '__default__' : textValue(source.localtime),
    startdate: textValue(source.startdate, 'now'),
    vmstatestorage: textValue(source.vmstatestorage),
    smbios1: textValue(source.smbios1),
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
    console: Number(source.console ?? 1) === 1,
    tty: textValue(source.tty, '2'),
    cmode: ['tty', 'console', 'shell'].includes(textValue(source.cmode))
      ? textValue(source.cmode)
      : '__default__',
    featureKeyctl: textValue(features.keyctl) === '1',
    featureNesting: textValue(features.nesting) === '1',
    featureNfs: textValue(features.mount).split(/[; ]/).includes('nfs'),
    featureCifs: textValue(features.mount).split(/[; ]/).includes('cifs'),
    featureFuse: textValue(features.fuse) === '1',
    featureMknod: textValue(features.mknod) === '1',
    entrypoint: textValue(source.entrypoint),
  };
  Object.assign(form, next);
  envRows.value = textValue(source.env)
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
  buildBootRows(source);
  originalSmbios1Value.value = smbios1Value.value;
}

/** Fetch the latest config when an option is opened; form + digest share it. */
async function loadEditSnapshot() {
  try {
    const response = await getVmConfig(props.node, props.vmid, props.guestType);
    editConfig.value = response.data || { ...props.config };
  } catch {
    // getVmConfig is silent on failure; fall back to the last known config
    editConfig.value = { ...props.config };
  }
  syncForm();
}

async function save() {
  if (!canSave.value) return;
  if (hasValidationError.value) return;
  const data: PveRecord = { digest: textValue(editConfig.value.digest) };
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
      (key) => form[key as keyof typeof form] !== original.value[key as keyof typeof original.value]
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
    await loadEditSnapshot();
    await loadPending();
    emit('updated');
  } catch {
    // the global Notify already surfaced the error; consume the rejection here
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.node, props.vmid, textValue(props.config.digest)],
  () => {
    void loadPending();
    void loadVmStateStorages();
    void loadNodeArchitecture();
  },
  { immediate: true }
);
onMounted(() => {
  pendingRefreshTimer = setInterval(() => void loadPending(), 5000);
});
// Opening/switching an option is an explicit "edit" action: reload the latest
// config into a locked snapshot and rebuild the form from it, so unsaved
// changes of the previously selected option are never submitted together
// with the current one (PVE opens a fresh editor per option).
watch(selectedOption, () => void loadEditSnapshot());
void loadEditSnapshot();
</script>

<template>
  <q-form
    class="vm-config-legacy vm-options-tab u-hidden-error"
    @submit.prevent="save"
  >
    <div class="row q-gutter-sm q-py-sm options-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRevertSelected ? 'primary' : 'grey'"
        :disable="!canRevertSelected"
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
              <q-icon
                :name="optionIcon(row.key)"
                size="16px"
                class="q-mr-xs options-list-icon"
              />
              {{ row.label }}:
            </div>
            <div class="col-8 text-grey-8 options-list-value">
              <div
                v-if="!pendingRowForOption(row.key) || pendingDeleteForOption(row.key)"
                :class="{ 'pending-delete': pendingDeleteForOption(row.key) }"
              >
                {{ row.value }}
              </div>
              <div
                v-if="pendingRowForOption(row.key)"
                class="pending-value"
              >
                {{
                  pendingDeleteForOption(row.key)
                    ? gettext('Pending deletion')
                    : pendingValueForOption(row.key)
                }}
              </div>
            </div>
          </div>
          <div
            v-if="advancedOptionRows.length"
            class="options-advanced-list"
          >
            <div class="options-advanced-heading">
              <q-icon
                name="tune"
                size="15px"
              />
              {{ gettext('Advanced settings') }}
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
                />
                {{ row.label }}:
              </div>
              <div class="col-8 text-grey-8 options-list-value">
                <div :class="{ 'pending-delete': pendingDeleteForOption(row.key) }">
                  {{ row.value }}
                </div>
                <div
                  v-if="pendingRowForOption(row.key)"
                  class="pending-value"
                >
                  {{
                    pendingDeleteForOption(row.key)
                      ? gettext('Pending deletion')
                      : pendingValueForOption(row.key)
                  }}
                </div>
              </div>
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
            <div
              v-if="isReadOnlyOption"
              class="hardware-editor-hint"
            >
              {{ gettext('This option cannot be edited.') }}
            </div>
            <div class="row q-col-gutter-lg">
              <div
                v-show="selectedOption === 'name'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.name"
                  dense
                  :disable="!selectedOptionEditable"
                  :error="Boolean(nameValidationError)"
                  :error-message="nameValidationError"
                  :label="gettext('Name')"
                />
              </div>
              <div
                v-show="selectedOption === 'description'"
                class="col-12"
              >
                <q-input
                  v-model="form.description"
                  dense
                  type="textarea"
                  autogrow
                  :disable="!selectedOptionEditable"
                  :label="gettext('Description')"
                />
              </div>
              <div
                v-show="selectedOption === 'onboot'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.onboot"
                  dense
                  color="primary"
                  :disable="!selectedOptionEditable"
                  :label="gettext('Start at boot')"
                />
              </div>
              <div
                v-show="selectedOption === 'protection'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.protection"
                  dense
                  color="primary"
                  :disable="!selectedOptionEditable"
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
                  />
                  <q-checkbox
                    v-model="form.featureNesting"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures"
                    :label="gettext('Nesting')"
                  />
                  <q-checkbox
                    v-model="form.featureNfs"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures || optionEnabled(props.config.unprivileged)"
                    label="NFS"
                  />
                  <q-checkbox
                    v-model="form.featureCifs"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures || optionEnabled(props.config.unprivileged)"
                    label="SMB/CIFS"
                  />
                  <q-checkbox
                    v-model="form.featureFuse"
                    dense
                    color="primary"
                    :disable="!canEditLxcFeatures"
                    label="FUSE"
                  />
                  <q-checkbox
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
              <div
                v-show="props.guestType === 'lxc' && selectedOption === 'env'"
                class="col-12"
              >
                <div class="row q-col-gutter-sm text-caption text-grey-7 q-mb-xs">
                  <div class="col-5">{{ gettext('Name') }}</div>
                  <div class="col-6">{{ gettext('Value') }}</div>
                </div>
                <div
                  v-for="row in envRows"
                  :key="row.id"
                  class="row q-col-gutter-sm q-mb-sm"
                >
                  <div class="col-5">
                    <q-input
                      v-model="row.name"
                      dense
                      :disable="!canConfigureOptions"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="row.value"
                      dense
                      :disable="!canConfigureOptions"
                    />
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
              <div
                v-show="selectedOption === 'agent'"
                class="col-12"
              >
                <div class="column agent-options">
                  <q-checkbox
                    v-model="form.agent"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable"
                    :label="gettext('Use QEMU Guest Agent')"
                  />
                  <q-checkbox
                    v-model="form.agentFstrimClonedDisks"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable || !form.agent"
                    :label="gettext('Run guest-trim after a disk move or VM migration')"
                  />
                  <q-checkbox
                    v-model="form.agentFreezeFs"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable || !form.agent"
                    :label="
                      gettext(
                        'Freeze/thaw guest filesystems during certain operations for consistency'
                      )
                    "
                  />
                  <div
                    v-if="form.agent && !form.agentFreezeFs"
                    class="option-hint"
                  >
                    {{
                      gettext(
                        'Freeze/thaw for guest filesystems disabled. This can lead to inconsistent disk images during snapshots, backups, and similar operations.'
                      )
                    }}
                  </div>
                  <div
                    v-if="form.agent"
                    class="option-hint"
                  >
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
                <div
                  v-show="agentAdvanced"
                  class="row q-col-gutter-lg q-mt-sm"
                >
                  <div class="col-12 col-md-6">
                    <q-select
                      v-model="form.agentType"
                      dense
                      options-dense
                      emit-value
                      map-options
                      :disable="!selectedOptionEditable || !form.agent"
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
              <div
                v-show="selectedOption === 'acpi'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.acpi"
                  dense
                  :disable="!selectedOptionEditable"
                  color="primary"
                  :label="gettext('ACPI support')"
                />
              </div>
              <div
                v-show="selectedOption === 'kvm'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.kvm"
                  dense
                  :disable="!selectedOptionEditable"
                  color="primary"
                  :label="gettext('KVM hardware virtualization')"
                />
              </div>
              <div
                v-show="selectedOption === 'tablet'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.tablet"
                  dense
                  :disable="!selectedOptionEditable"
                  color="primary"
                  :label="gettext('USB Tablet')"
                />
              </div>
              <div
                v-show="selectedOption === 'hotplug'"
                class="col-12 col-md-6"
              >
                <div class="column hotplug-options">
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="disk"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable"
                    :label="gettext('Disk')"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="network"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable"
                    :label="gettext('Network')"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="usb"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable"
                    label="USB"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="memory"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable"
                    :label="gettext('Memory')"
                  />
                  <q-checkbox
                    v-model="hotplugFeatures"
                    val="cpu"
                    dense
                    color="primary"
                    :disable="!selectedOptionEditable"
                    :label="gettext('CPU')"
                  />
                </div>
              </div>
              <div
                v-show="selectedOption === 'startup'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.startupOrder"
                  dense
                  :disable="!selectedOptionEditable"
                  :label="gettext('Start/Shutdown order')"
                  :placeholder="gettext('any')"
                />
                <q-input
                  v-model="form.startupUp"
                  dense
                  :disable="!selectedOptionEditable"
                  class="q-mt-sm"
                  :label="gettext('Startup delay')"
                  :placeholder="gettext('default')"
                />
                <q-input
                  v-model="form.startupDown"
                  dense
                  :disable="!selectedOptionEditable"
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
                  :options="availableOsTypeGroups"
                  :disable="!selectedOptionEditable"
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
                  :disable="!selectedOptionEditable"
                  :label="gettext('Version')"
                />
              </div>
              <div
                v-show="selectedOption === 'boot'"
                class="col-12"
              >
                <q-markup-table
                  dense
                  flat
                  bordered
                  class="boot-order-table"
                >
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
                        />
                        {{ index + 1 }}
                      </td>
                      <td>
                        <q-checkbox
                          v-model="row.enabled"
                          dense
                          color="primary"
                          :disable="!selectedOptionEditable"
                        />
                      </td>
                      <td>{{ row.name }}</td>
                      <td class="boot-order-description">
                        <div class="ellipsis">
                          {{ row.description }}
                          <q-tooltip>{{ row.description }}</q-tooltip>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!bootRows.length">
                      <td
                        colspan="4"
                        class="text-center text-grey-7"
                      >
                        {{ gettext('No bootable devices available') }}
                      </td>
                    </tr>
                  </tbody>
                </q-markup-table>
                <div class="text-caption text-grey-7 q-mt-xs">
                  {{ gettext('Use the arrow buttons to reorder devices') }}
                </div>
                <div
                  v-if="bootSelectionWarning"
                  class="option-hint"
                >
                  {{ gettext('Warning: No devices selected, the VM will probably not boot!') }}
                </div>
                <div
                  v-if="bootRngWarning"
                  class="option-hint"
                >
                  {{ gettext('For PXE boot with OVMF, you must add a VirtIO RNG device!') }}
                </div>
              </div>
              <div
                v-show="selectedOption === 'freeze'"
                class="col-12 col-md-6"
              >
                <q-checkbox
                  v-model="form.freeze"
                  dense
                  color="primary"
                  :disable="!selectedOptionEditable"
                  :label="gettext('Freeze CPU at startup')"
                />
              </div>
              <div
                v-show="selectedOption === 'localtime'"
                class="col-12 col-md-6"
              >
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
                  :disable="!selectedOptionEditable"
                />
              </div>
              <div
                v-show="selectedOption === 'startdate'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.startdate"
                  dense
                  :disable="!selectedOptionEditable"
                  :error="Boolean(startdateValidationError)"
                  :error-message="startdateValidationError"
                  :label="gettext('RTC start date')"
                  hint="now or YYYY-MM-DDTHH:MM:SS"
                />
              </div>
              <div
                v-show="selectedOption === 'vmstatestorage'"
                class="col-12 col-md-6"
              >
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
                  :disable="!selectedOptionEditable"
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
                <q-btn
                  v-if="form.vmstatestorage"
                  flat
                  dense
                  no-caps
                  class="q-mt-xs"
                  :disable="!selectedOptionEditable"
                  :label="gettext('Automatic')"
                  @click="form.vmstatestorage = ''"
                />
              </div>
              <div
                v-show="selectedOption === 'spice'"
                class="col-12 col-md-6"
              >
                <q-checkbox
                  v-model="form.spiceFolderSharing"
                  dense
                  color="primary"
                  :disable="!selectedOptionEditable"
                  :label="gettext('SPICE Folder Sharing')"
                />
                <q-select
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
                  :disable="!selectedOptionEditable"
                />
                <div
                  v-if="!spiceDisplayIsQxl"
                  class="option-hint"
                >
                  {{
                    gettext(
                      'To use these features set the display to SPICE in the hardware settings of the VM.'
                    )
                  }}
                </div>
                <div
                  v-if="form.spiceFolderSharing"
                  class="option-hint"
                >
                  {{ gettext('Make sure the SPICE WebDav daemon is installed in the VM.') }}
                </div>
              </div>
              <div
                v-show="selectedOption === 'smbios1'"
                class="col-12"
              >
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosUuid"
                      dense
                      :disable="!selectedOptionEditable"
                      :error="Boolean(smbiosUuidValidationError)"
                      :error-message="smbiosUuidValidationError"
                      label="UUID"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosManufacturer"
                      dense
                      :disable="!selectedOptionEditable"
                      type="textarea"
                      autogrow
                      :label="gettext('Manufacturer')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosProduct"
                      dense
                      :disable="!selectedOptionEditable"
                      type="textarea"
                      autogrow
                      :label="gettext('Product')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosVersion"
                      dense
                      :disable="!selectedOptionEditable"
                      type="textarea"
                      autogrow
                      :label="gettext('Version')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosSerial"
                      dense
                      :disable="!selectedOptionEditable"
                      type="textarea"
                      autogrow
                      :label="gettext('Serial')"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosSku"
                      dense
                      type="textarea"
                      autogrow
                      :disable="!selectedOptionEditable"
                      label="SKU"
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.smbiosFamily"
                      dense
                      :disable="!selectedOptionEditable"
                      type="textarea"
                      autogrow
                      :label="gettext('Family')"
                    />
                  </div>
                </div>
              </div>
              <div
                v-show="selectedOption === 'sev'"
                class="col-12 col-md-6"
              >
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
                <div
                  v-if="form.sevType !== '__default__'"
                  class="q-mt-sm"
                >
                  <div
                    v-if="form.sevType === 'snp'"
                    class="option-hint"
                  >
                    {{ gettext('WARNING: When using SEV-SNP no EFI disk is loaded as pflash.') }}
                  </div>
                  <div
                    v-if="form.sevType === 'snp'"
                    class="option-hint"
                  >
                    {{ gettext('Note: SEV-SNP requires host kernel version 6.11 or higher.') }}
                  </div>
                  <q-checkbox
                    v-model="form.sevDebug"
                    dense
                    color="primary"
                    :disable="!canConfigureHardware"
                    :label="gettext('Allow Debugging')"
                  />
                  <q-checkbox
                    v-if="form.sevType !== 'snp'"
                    v-model="form.sevKeySharing"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :disable="!canConfigureHardware"
                    :label="gettext('Allow Key-Sharing')"
                  />
                  <q-checkbox
                    v-if="form.sevType === 'snp'"
                    v-model="form.sevSmt"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :disable="!canConfigureHardware"
                    :label="gettext('Allow SMT')"
                  />
                  <q-checkbox
                    v-model="form.sevKernelHashes"
                    dense
                    color="primary"
                    class="q-ml-md"
                    :disable="!canConfigureHardware"
                    :label="gettext('Enable Kernel Hashes')"
                  />
                </div>
              </div>
              <div
                v-show="selectedOption === 'tdx'"
                class="col-12 col-md-6"
              >
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
                <div
                  v-if="form.tdxType === 'tdx'"
                  class="q-mt-sm"
                >
                  <div class="option-hint">
                    {{ gettext('WARNING: When using Intel TDX no EFI disk is loaded as pflash.') }}
                  </div>
                  <div class="option-hint">
                    {{
                      gettext(
                        'Note: Intel TDX is only supported by specific recent CPU models and requires host kernel version 6.16 or higher.'
                      )
                    }}
                  </div>
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
                        :error="!tdxCidValid"
                        :error-message="tdxCidError"
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
                        :error="!tdxPortValid"
                        :error-message="tdxPortError"
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
.pending-value {
  margin-top: 2px;
  color: #c05621;
  font-size: 12px;
}
.pending-delete {
  color: #9b2c2c;
  text-decoration: line-through;
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
