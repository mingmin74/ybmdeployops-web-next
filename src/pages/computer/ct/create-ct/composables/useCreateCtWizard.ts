import { computed, reactive, shallowRef, watch, type Ref } from 'vue';
import { createCt, getCtNextId } from '@/api/vm';
import {
  getClusterResources,
  getNodes,
  getPools,
  type PveNode,
  type PvePool,
  type PveRecord,
} from '@/api/resources';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { getNodeNetwork } from '@/api/host';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { isIpv4Address, isIpv4Cidr, isIpv6Address, isIpv6Cidr } from '@/utils/ipValidation';
import {
  hasValidSshPublicKey,
  isDnsName,
  isValidPveTag,
  isValidSshPublicKeys,
} from '@/utils/pveValidation';
import type {
  CreateCtForm,
  CreateCtStepName,
  CreateCtWizardContext,
  CtManagedMount,
} from '../types/createCtWizard';

type CreateCtWizardEmit = {
  (event: 'completed'): void;
  (event: 'task', payload: { node: string; upid: string; title: string }): void;
};
type PveNodeWithArchitecture = PveNode & { 'host-arch'?: string };

const stepOrder: CreateCtStepName[] = [
  'general',
  'template',
  'hardware',
  'mounts',
  'bindmounts',
  'limits',
  'dns',
  'confirm',
];
const featuresOptions = ['nesting', 'fuse', 'keyctl', 'fscaps', 'mknod'];
const knownTemplateArchitectures = ['amd64', 'arm64', 'i386', 'riscv64'];
const diskSizeMinimum = 0.001;
const diskSizeMaximum = 128 * 1024;
const maximumManagedMountId = 255;

function isValidDiskSize(value: number | null) {
  const size = Number(value);
  const decimalPlaces = String(size).split('.')[1]?.length || 0;
  return (
    Number.isFinite(size) &&
    size >= diskSizeMinimum &&
    size <= diskSizeMaximum &&
    decimalPlaces <= 3
  );
}

function isBlankNumber(value: unknown) {
  return value === null || value === '';
}

function isIntegerInRange(value: unknown, minimum: number, maximum?: number) {
  if (isBlankNumber(value)) return false;
  const number = Number(value);
  return (
    Number.isInteger(number) && number >= minimum && (maximum === undefined || number <= maximum)
  );
}

function isNumberInRange(value: unknown, minimum: number, maximum: number) {
  if (isBlankNumber(value)) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

function isValidIdMapValue(value: string, minimum: number) {
  return /^\d+$/.test(value.trim()) && Number(value) >= minimum;
}

function areIdMapsValid(rows: CreateCtForm['rootfsIdMaps'], passthrough: boolean) {
  return (
    passthrough ||
    rows.every(
      (row) =>
        (row.type === 'u' || row.type === 'g') &&
        isValidIdMapValue(row.ct, 0) &&
        isValidIdMapValue(row.host, 0) &&
        isValidIdMapValue(row.length, 1)
    )
  );
}

function isValidManagedMountId(id: string) {
  const match = /^mp(\d+)$/.exec(id);
  return Boolean(match && Number(match[1]) >= 0 && Number(match[1]) <= maximumManagedMountId);
}

function templateArch(volid: string) {
  const arch = volid.match(/_([a-z][a-z0-9]*)\.tar(?:\.\w+)?$/)?.[1];
  return arch && knownTemplateArchitectures.includes(arch) ? arch : undefined;
}

function defaultForm(): CreateCtForm {
  return {
    node: '',
    vmid: '',
    hostname: '',
    pool: '',
    haManaged: false,
    templateStorage: '',
    ostemplate: '',
    memory: 512,
    swap: 512,
    cores: 1,
    password: '',
    confirmPassword: '',
    netBridge: '',
    netName: 'eth0',
    netHwaddr: '',
    netVlanTag: null,
    netFirewall: true,
    netIpv4Mode: 'static',
    netIp: '',
    netGateway: '',
    netIpv6Mode: 'static',
    netIp6: '',
    netGateway6: '',
    netDisconnect: false,
    netMtu: null,
    netRate: null,
    netHostManaged: false,
    nameserver: '',
    searchdomain: '',
    unprivileged: true,
    features: '',
    rootfsStorage: '',
    rootfsSize: 8,
    rootfsQuota: false,
    rootfsAcl: '__default__',
    rootfsSkipReplication: false,
    rootfsMountOptions: [],
    rootfsIdMapPassthrough: false,
    rootfsIdMaps: [],
    sshkeys: '',
    tags: '',
    featuresChecked: ['nesting'],
    mounts: [],
    bindMounts: [],
    managedMounts: [],
    cpuUnits: null,
    cpuLimit: null,
    cpuset: '',
    iopsRd: '',
    iopsWr: '',
  };
}

export function useCreateCtWizard(
  model: Ref<boolean>,
  emit: CreateCtWizardEmit,
  preferredNode: () => string = () => ''
): CreateCtWizardContext {
  const loading = shallowRef(false);
  const step = shallowRef<CreateCtStepName>('general');
  const advanced = shallowRef(false);
  const networkAdvanced = shallowRef(false);
  const nodes = shallowRef<PveNodeWithArchitecture[]>([]);
  const pools = shallowRef<PvePool[]>([]);
  const storageOptions = shallowRef<PveRecord[]>([]);
  const rootfsStorageOptions = shallowRef<PveRecord[]>([]);
  const bridgeRows = shallowRef<PveRecord[]>([]);
  const allTemplateRows = shallowRef<PveRecord[]>([]);
  const showAllTemplateArchitectures = shallowRef(false);
  const validationError = shallowRef('');
  const validationErrors = shallowRef<Record<string, string>>({});
  const vmidAvailability = shallowRef<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  let vmidValidationRequest = 0;
  const form = reactive<CreateCtForm>(defaultForm());
  const nodeTemplateArchitecture = computed(() => {
    const hostArch = textValue(nodes.value.find((node) => node.node === form.node)?.['host-arch']);
    if (hostArch === 'x86_64') return 'amd64';
    if (hostArch === 'aarch64') return 'arm64';
    return undefined;
  });
  const cgroupMode = computed(() =>
    nodes.value.find((node) => node.node === form.node)?.['cgroup-mode'] === 1 ? 1 : 2
  );
  const cpuUnitsDefault = computed(() => (cgroupMode.value === 1 ? 1024 : 100));
  const cpuUnitsMaximum = computed(() => (cgroupMode.value === 1 ? 500000 : 10000));
  const bridgeValid = computed(
    () =>
      Boolean(form.netBridge) &&
      bridgeRows.value.some((bridge) => textValue(bridge.iface) === form.netBridge)
  );
  const ipv4Valid = computed(
    () => form.netIpv4Mode !== 'static' || !form.netIp.trim() || isIpv4Cidr(form.netIp.trim())
  );
  const ipv4GatewayValid = computed(
    () =>
      form.netIpv4Mode !== 'static' ||
      !form.netGateway.trim() ||
      isIpv4Address(form.netGateway.trim())
  );
  const ipv6Valid = computed(
    () => form.netIpv6Mode !== 'static' || !form.netIp6.trim() || isIpv6Cidr(form.netIp6.trim())
  );
  const ipv6GatewayValid = computed(
    () =>
      form.netIpv6Mode !== 'static' ||
      !form.netGateway6.trim() ||
      isIpv6Address(form.netGateway6.trim())
  );
  const templateRows = computed(() => {
    if (showAllTemplateArchitectures.value || !nodeTemplateArchitecture.value)
      return allTemplateRows.value;
    return allTemplateRows.value.filter((item) => {
      const volid = textValue(item.volid) || textValue(item.filename);
      const arch = templateArch(volid);
      return !arch || arch === nodeTemplateArchitecture.value;
    });
  });
  const validationErrorEntries = computed(() => Object.entries(validationErrors.value));
  const vmidValid = computed(
    () =>
      /^\d+$/.test(form.vmid.trim()) && Number(form.vmid) >= 100 && Number(form.vmid) <= 999999999
  );
  const hostnameValid = computed(() => !form.hostname.trim() || isDnsName(form.hostname.trim()));
  const sshKeysValid = computed(() => !form.sshkeys.trim() || isValidSshPublicKeys(form.sshkeys));
  const tagsValid = computed(() => form.tags.split(/[;, ]/).filter(Boolean).every(isValidPveTag));
  const generalFieldErrors = computed(() => {
    const errors = { ...validationErrors.value };
    if (form.vmid.trim()) {
      if (!vmidValid.value)
        errors.vmid =
          gettext('VM ID') + ': ' + gettext('Value must be an integer between 100 and 999999999.');
      else if (vmidAvailability.value === 'checking')
        errors.vmid = gettext('VM ID is still being validated.');
      else if (vmidAvailability.value === 'unavailable')
        errors.vmid = gettext('VM ID is already in use.');
    }
    if (form.hostname.trim() && !hostnameValid.value)
      errors.hostname = gettext('Hostname') + ': ' + gettext('Invalid DNS name');
    if (form.sshkeys.trim() && !sshKeysValid.value)
      errors.sshkeys = gettext('Failed to recognize ssh key');
    if (!tagsValid.value) errors.tags = gettext('Tags contain invalid characters.');
    return errors;
  });
  const canProceedGeneral = computed(
    () =>
      form.node !== '' &&
      vmidValid.value &&
      vmidAvailability.value === 'available' &&
      hostnameValid.value &&
      sshKeysValid.value &&
      (form.password.trim().length >= 5 || hasValidSshPublicKey(form.sshkeys)) &&
      (!form.password.trim() || form.password === form.confirmPassword) &&
      tagsValid.value
  );

  const canSubmit = computed(() => {
    const basic =
      !loading.value &&
      form.node !== '' &&
      canProceedGeneral.value &&
      (!form.password.trim() || form.password === form.confirmPassword) &&
      form.ostemplate !== '' &&
      isIntegerInRange(form.memory, 16) &&
      isIntegerInRange(form.swap, 0) &&
      (isBlankNumber(form.cores) || isIntegerInRange(form.cores, 1, 8192)) &&
      (isBlankNumber(form.cpuLimit) ||
        (Number.isFinite(Number(form.cpuLimit)) && Number(form.cpuLimit) >= 0)) &&
      (isBlankNumber(form.cpuUnits) || isIntegerInRange(form.cpuUnits, 8, cpuUnitsMaximum.value)) &&
      form.netName.trim() !== '' &&
      bridgeValid.value &&
      ipv4Valid.value &&
      ipv4GatewayValid.value &&
      ipv6Valid.value &&
      ipv6GatewayValid.value &&
      (isBlankNumber(form.netVlanTag) || isIntegerInRange(form.netVlanTag, 1, 4094)) &&
      (isBlankNumber(form.netMtu) || isIntegerInRange(form.netMtu, 576, 65535)) &&
      isNumberInRange(form.netRate, 0, 10240);
    return basic && canProceedHardware.value;
  });
  const canProceedTemplate = computed(() => form.ostemplate !== '');
  const quotaAllowed = (storage: string) => {
    const type = textValue(
      rootfsStorageOptions.value.find((item) => textValue(item.storage) === storage)?.type
    );
    return !form.unprivileged && type !== 'zfs' && type !== 'zfspool';
  };
  const canProceedHardware = computed(
    () =>
      Boolean(form.rootfsStorage) &&
      isValidDiskSize(form.rootfsSize) &&
      areIdMapsValid(form.rootfsIdMaps, form.rootfsIdMapPassthrough) &&
      form.managedMounts.every(
        (mount) =>
          isValidManagedMountId(mount.id) &&
          Boolean(mount.storage) &&
          isValidDiskSize(mount.size) &&
          mount.mountPoint.trim().startsWith('/') &&
          areIdMapsValid(mount.idMaps, mount.idMapPassthrough)
      )
  );
  const summaryRows = computed<[string, string | number][]>(() => [
    ['Node', form.node],
    ['VMID', form.vmid],
    ['Hostname', form.hostname],
    ['Template', form.ostemplate],
    ['Memory', form.memory],
    ['Cores', form.cores],
    ['Net0', `${form.netName}/${form.netBridge}${form.netIp ? ` ${form.netIp}` : ''}`],
  ]);

  function addValidationError(field: string, message: string) {
    validationErrors.value = { ...validationErrors.value, [field]: message };
  }
  function validateStep(stepName: CreateCtStepName) {
    validationErrors.value = {};
    if (stepName === 'general') {
      if (!form.node)
        addValidationError('node', gettext('Node') + ': ' + gettext('This field is required.'));
      if (!form.vmid.trim())
        addValidationError('vmid', gettext('VM ID') + ': ' + gettext('This field is required.'));
      else if (!vmidValid.value)
        addValidationError(
          'vmid',
          gettext('VM ID') + ': ' + gettext('Value must be an integer between 100 and 999999999.')
        );
      else if (vmidAvailability.value === 'checking')
        addValidationError('vmid', gettext('VM ID is still being validated.'));
      else if (vmidAvailability.value !== 'available')
        addValidationError('vmid', gettext('VM ID is already in use.'));
      if (form.hostname.trim() && !hostnameValid.value)
        addValidationError('hostname', gettext('Hostname') + ': ' + gettext('Invalid DNS name'));
      if (form.sshkeys.trim() && !sshKeysValid.value)
        addValidationError('sshkeys', gettext('Failed to recognize ssh key'));
      if (!form.password.trim() && !hasValidSshPublicKey(form.sshkeys))
        addValidationError('password', gettext('Password or SSH public key is required.'));
      if (form.password.trim() && form.password.trim().length < 5)
        addValidationError('password', gettext('Password must contain at least 5 characters.'));
      if (form.password !== form.confirmPassword)
        addValidationError('confirmPassword', gettext('Passwords do not match!'));
      if (!tagsValid.value) addValidationError('tags', gettext('Tags contain invalid characters.'));
    }
    if (stepName === 'template') {
      if (!form.templateStorage)
        addValidationError(
          'templateStorage',
          gettext('Storage') + ': ' + gettext('This field is required.')
        );
      if (!form.ostemplate)
        addValidationError(
          'ostemplate',
          gettext('Template') + ': ' + gettext('This field is required.')
        );
    }
    if (stepName === 'hardware') {
      if (!form.rootfsStorage)
        addValidationError(
          'rootfsStorage',
          gettext('Storage') + ': ' + gettext('This field is required.')
        );
      if (!isValidDiskSize(form.rootfsSize))
        addValidationError(
          'rootfsSize',
          gettext('Disk size') + ': ' + gettext('Value must be between 0.001 and 131072.')
        );
      if (!areIdMapsValid(form.rootfsIdMaps, form.rootfsIdMapPassthrough))
        addValidationError(
          'rootfsIdMaps',
          gettext('ID Mapping') + ': ' + gettext('Invalid value.')
        );
      form.managedMounts.forEach((mount) => {
        if (!mount.storage)
          addValidationError(
            `${mount.id}Storage`,
            `${mount.id}: ${gettext('Storage')} - ${gettext('This field is required.')}`
          );
        if (!isValidDiskSize(mount.size))
          addValidationError(
            `${mount.id}Size`,
            `${mount.id}: ${gettext('Disk size')} - ${gettext('Value must be between 0.001 and 131072.')}`
          );
        if (!mount.mountPoint.trim().startsWith('/'))
          addValidationError(
            `${mount.id}Path`,
            `${mount.id}: ${gettext('Mount Point')} - ${gettext('Path has to start with /')}`
          );
        if (!isValidManagedMountId(mount.id))
          addValidationError(`${mount.id}Id`, `${mount.id}: ${gettext('Invalid value.')}`);
        if (!areIdMapsValid(mount.idMaps, mount.idMapPassthrough))
          addValidationError(
            `${mount.id}IdMaps`,
            `${mount.id}: ${gettext('ID Mapping')} - ${gettext('Invalid value.')}`
          );
      });
    }
    if (stepName === 'mounts') {
      if (!isBlankNumber(form.cores) && !isIntegerInRange(form.cores, 1, 8192)) {
        addValidationError(
          'cores',
          gettext('Cores') + ': ' + gettext('Value must be between 1 and 8192.')
        );
      }
      if (
        !isBlankNumber(form.cpuLimit) &&
        (!Number.isFinite(Number(form.cpuLimit)) || Number(form.cpuLimit) < 0)
      ) {
        addValidationError(
          'cpuLimit',
          gettext('CPU limit') + ': ' + gettext('Value must be at least 0.')
        );
      }
      if (
        !isBlankNumber(form.cpuUnits) &&
        !isIntegerInRange(form.cpuUnits, 8, cpuUnitsMaximum.value)
      ) {
        addValidationError(
          'cpuUnits',
          gettext('CPU units') +
            ': ' +
            gettext(`Value must be between 8 and ${cpuUnitsMaximum.value}.`)
        );
      }
    }
    if (stepName === 'bindmounts') {
      if (!isIntegerInRange(form.memory, 16)) {
        addValidationError(
          'memory',
          gettext('Memory') + ': ' + gettext('Value must be at least 16.')
        );
      }
      if (!isIntegerInRange(form.swap, 0)) {
        addValidationError('swap', gettext('Swap') + ': ' + gettext('Value must be at least 0.'));
      }
    }
    if (stepName === 'limits') {
      if (!form.netName.trim())
        addValidationError('netName', gettext('Name') + ': ' + gettext('This field is required.'));
      if (!bridgeValid.value)
        addValidationError('netBridge', gettext('Bridge') + ': ' + gettext('Invalid value.'));
      if (form.netHwaddr.trim() && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(form.netHwaddr)) {
        addValidationError(
          'netHwaddr',
          gettext('MAC address') + ': ' + gettext('Invalid MAC address')
        );
      }
      if (!isBlankNumber(form.netVlanTag) && !isIntegerInRange(form.netVlanTag, 1, 4094)) {
        addValidationError(
          'netVlanTag',
          gettext('VLAN Tag') + ': ' + gettext('Value must be between 1 and 4094.')
        );
      }
      if (!isBlankNumber(form.netMtu) && !isIntegerInRange(form.netMtu, 576, 65535)) {
        addValidationError('netMtu', 'MTU: ' + gettext('Value must be between 576 and 65535.'));
      }
      if (!isNumberInRange(form.netRate, 0, 10240)) {
        addValidationError(
          'netRate',
          gettext('Rate limit') + ': ' + gettext('Value must be between 0 and 10240.')
        );
      }
      if (!ipv4Valid.value) addValidationError('netIp', 'IPv4/CIDR: ' + gettext('Invalid value.'));
      if (!ipv4GatewayValid.value)
        addValidationError(
          'netGateway',
          gettext('Gateway') + ' (IPv4): ' + gettext('Invalid value.')
        );
      if (!ipv6Valid.value) addValidationError('netIp6', 'IPv6/CIDR: ' + gettext('Invalid value.'));
      if (!ipv6GatewayValid.value)
        addValidationError(
          'netGateway6',
          gettext('Gateway') + ' (IPv6): ' + gettext('Invalid value.')
        );
    }
    return validationErrorEntries.value.length === 0;
  }
  async function moveStep(delta: number) {
    const index = stepOrder.indexOf(step.value);
    if (index === -1) return Promise.resolve();
    if (delta > 0 && !validateStep(step.value)) return Promise.resolve();
    step.value =
      stepOrder[Math.max(0, Math.min(stepOrder.length - 1, index + delta))] || step.value;
    return Promise.resolve();
  }

  async function loadNodes() {
    try {
      const [nodesResponse, resourcesResponse] = await Promise.all([
        getNodes(),
        getClusterResources({ type: 'node' }).catch(() => ({ data: [] })),
      ]);
      const architectures = new Map(
        (resourcesResponse.data || [])
          .filter((resource) => textValue(resource.type) === 'node')
          .map((resource) => [
            textValue(resource.node),
            textValue(resource['host-arch']) || 'x86_64',
          ])
      );
      const cgroupModes = new Map(
        (resourcesResponse.data || [])
          .filter((resource) => textValue(resource.type) === 'node')
          .map((resource) => [textValue(resource.node), Number(resource['cgroup-mode'])])
      );
      nodes.value = (nodesResponse.data || []).map((node) => {
        const hostArch = architectures.get(node.node);
        const cgroupMode = cgroupModes.get(node.node);
        return {
          ...node,
          ...(hostArch ? { 'host-arch': hostArch } : {}),
          ...(cgroupMode === 1 || cgroupMode === 2 ? { 'cgroup-mode': cgroupMode } : {}),
        };
      });
      const preferred = preferredNode();
      if (preferred && nodes.value.some((node) => node.node === preferred)) form.node = preferred;
      else if (!form.node && nodes.value.length) form.node = nodes.value[0]?.node || '';
    } catch {
      nodes.value = [];
    }
  }
  async function loadPools() {
    try {
      const response = await getPools();
      pools.value = (response.data || []).sort((left, right) =>
        left.poolid.localeCompare(right.poolid)
      );
    } catch {
      pools.value = [];
    }
  }
  async function loadNextId() {
    if (!form.node) return;
    try {
      const response = await getCtNextId();
      if (response.data !== undefined && response.data !== null) form.vmid = String(response.data);
    } catch {
      /* ignore */
    }
  }
  async function validateVmidAvailability() {
    const vmid = form.vmid.trim();
    const requestId = ++vmidValidationRequest;
    if (!/^\d+$/.test(vmid) || Number(vmid) < 100 || Number(vmid) > 999999999) {
      vmidAvailability.value = 'idle';
      return;
    }
    vmidAvailability.value = 'checking';
    try {
      const response = await getCtNextId(vmid);
      if (requestId !== vmidValidationRequest) return;
      vmidAvailability.value =
        String(response.data) === String(Number(vmid)) ? 'available' : 'unavailable';
    } catch {
      if (requestId === vmidValidationRequest) vmidAvailability.value = 'unavailable';
    }
  }
  async function loadStorageOptions() {
    if (!form.node) {
      storageOptions.value = [];
      form.templateStorage = '';
      form.ostemplate = '';
      return;
    }
    try {
      const response = await getNodeStorage(form.node, 'vztmpl');
      storageOptions.value = (response.data || [])
        .filter((item: PveRecord) => Boolean(textValue(item.storage)))
        .sort((left: PveRecord, right: PveRecord) =>
          textValue(left.storage).localeCompare(textValue(right.storage))
        );
      form.templateStorage = textValue(storageOptions.value[0]?.storage);
      form.ostemplate = '';
    } catch {
      storageOptions.value = [];
      form.templateStorage = '';
      form.ostemplate = '';
    }
  }
  async function loadRootfsStorageOptions() {
    if (!form.node) {
      rootfsStorageOptions.value = [];
      form.rootfsStorage = '';
      return;
    }
    try {
      const response = await getNodeStorage(form.node, 'rootdir');
      rootfsStorageOptions.value = (response.data || [])
        .filter((item: PveRecord) => Boolean(textValue(item.storage)))
        .sort((left: PveRecord, right: PveRecord) =>
          textValue(left.storage).localeCompare(textValue(right.storage))
        );
      if (
        !rootfsStorageOptions.value.some((item) => textValue(item.storage) === form.rootfsStorage)
      )
        form.rootfsStorage = textValue(rootfsStorageOptions.value[0]?.storage);
    } catch {
      rootfsStorageOptions.value = [];
      form.rootfsStorage = '';
    }
  }
  async function loadTemplates() {
    if (!form.node || !form.templateStorage) {
      allTemplateRows.value = [];
      form.ostemplate = '';
      return;
    }
    try {
      const response = await getStorageContent(form.node, form.templateStorage, 'vztmpl');
      allTemplateRows.value = (response.data || []).filter((item: PveRecord) =>
        Boolean(item.volid || item.filename)
      );
      form.ostemplate = '';
    } catch {
      allTemplateRows.value = [];
      form.ostemplate = '';
    }
  }
  let bridgeLoadRequest = 0;
  async function loadBridges() {
    const request = ++bridgeLoadRequest;
    if (!form.node) {
      bridgeRows.value = [];
      form.netBridge = '';
      return;
    }
    try {
      const response = await getNodeNetwork(form.node, { type: 'any_bridge' });
      if (request !== bridgeLoadRequest) return;
      bridgeRows.value = (response.data || [])
        .filter((bridge) => Boolean(textValue(bridge.iface)))
        .sort((left, right) => textValue(left.iface).localeCompare(textValue(right.iface)));
      if (!bridgeRows.value.some((bridge) => textValue(bridge.iface) === form.netBridge))
        form.netBridge = textValue(bridgeRows.value[0]?.iface);
    } catch {
      if (request !== bridgeLoadRequest) return;
      bridgeRows.value = [];
      form.netBridge = '';
    }
  }
  function resetForm() {
    Object.assign(form, {
      node:
        nodes.value.find((node) => node.node === preferredNode())?.node ||
        nodes.value[0]?.node ||
        '',
      vmid: '',
      hostname: '',
      pool: '',
      haManaged: false,
      templateStorage: '',
      ostemplate: '',
      memory: 512,
      swap: 512,
      cores: 1,
      password: '',
      confirmPassword: '',
      netBridge: '',
      netName: 'eth0',
      netHwaddr: '',
      netVlanTag: null,
      netFirewall: true,
      netIpv4Mode: 'static',
      netIp: '',
      netGateway: '',
      netIpv6Mode: 'static',
      netIp6: '',
      netGateway6: '',
      netDisconnect: false,
      netMtu: null,
      netRate: null,
      netHostManaged: false,
      nameserver: '',
      searchdomain: '',
      unprivileged: true,
      features: '',
      rootfsStorage: textValue(rootfsStorageOptions.value[0]?.storage),
      rootfsSize: 8,
      rootfsQuota: false,
      rootfsAcl: '__default__',
      rootfsSkipReplication: false,
      rootfsMountOptions: [],
      rootfsIdMapPassthrough: false,
      rootfsIdMaps: [],
      sshkeys: '',
      tags: '',
      featuresChecked: ['nesting'],
      managedMounts: [],
      cpuUnits: null,
      cpuLimit: null,
    });
    validationError.value = '';
    validationErrors.value = {};
    advanced.value = false;
    networkAdvanced.value = false;
    allTemplateRows.value = [];
    showAllTemplateArchitectures.value = false;
  }
  async function initialize() {
    await loadNodes();
    await loadBridges();
    await loadPools();
    await loadNextId();
    await loadStorageOptions();
    await loadRootfsStorageOptions();
    await loadTemplates();
    step.value = 'general';
  }
  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      vmid: form.vmid.trim(),
      hostname: form.hostname.trim(),
      ostemplate: form.ostemplate,
      memory: Number(form.memory),
      swap: Number(form.swap),
      net0: [
        form.netName && `name=${form.netName}`,
        form.netBridge && `bridge=${form.netBridge}`,
        form.netHwaddr && `hwaddr=${form.netHwaddr}`,
        !isBlankNumber(form.netVlanTag) && `tag=${form.netVlanTag}`,
        `firewall=${form.netFirewall ? 1 : 0}`,
        form.netIpv4Mode === 'static' ? form.netIp && `ip=${form.netIp}` : `ip=${form.netIpv4Mode}`,
        form.netIpv4Mode === 'static' && form.netGateway && `gw=${form.netGateway}`,
        form.netIpv6Mode === 'static'
          ? form.netIp6 && `ip6=${form.netIp6}`
          : `ip6=${form.netIpv6Mode}`,
        form.netIpv6Mode === 'static' && form.netGateway6 && `gw6=${form.netGateway6}`,
        form.netDisconnect && 'link_down=1',
        !isBlankNumber(form.netMtu) && `mtu=${form.netMtu}`,
        !isBlankNumber(form.netRate) && `rate=${form.netRate}`,
        form.netHostManaged && 'host-managed=1',
      ]
        .filter(Boolean)
        .join(','),
    };
    if (!isBlankNumber(form.cores)) payload.cores = Number(form.cores);
    if (form.password.trim()) payload.password = form.password.trim();
    payload.unprivileged = form.unprivileged ? 1 : 0;
    if (form.pool) payload.pool = form.pool;
    if (form.haManaged) payload['ha-managed'] = 1;
    if (form.tags.trim()) payload.tags = form.tags.trim();
    const featureList = form.features
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    featureList.push(...form.featuresChecked.filter((feature) => !featureList.includes(feature)));
    if (featureList.length)
      payload.features = featureList
        .map((feature) => (feature.includes('=') ? feature : `${feature}=1`))
        .join(',');
    const mountValue = (
      storage: string,
      size: number | null,
      options: Pick<
        CtManagedMount,
        'quota' | 'acl' | 'skipReplication' | 'mountOptions' | 'idMapPassthrough' | 'idMaps'
      > &
        Partial<Pick<CtManagedMount, 'mountPoint' | 'backup' | 'readOnly' | 'keepAttrs'>>
    ) => {
      const values = [`${storage}:${Number(size)}G`];
      if (options.mountPoint) values.push(`mp=${options.mountPoint}`);
      if (options.quota) values.push('quota=1');
      if (options.acl !== '__default__') values.push(`acl=${options.acl}`);
      if (options.skipReplication) values.push('replicate=0');
      if (options.backup === false) values.push('backup=0');
      if (options.readOnly) values.push('ro=1');
      if (options.keepAttrs) values.push('keepattrs=1');
      if (options.mountOptions.length)
        values.push(`mountoptions=${options.mountOptions.join(';')}`);
      if (options.idMapPassthrough) values.push('idmap=passthrough');
      else {
        const idMap = options.idMaps
          .map((row) => `${row.type}:${row.ct}:${row.host}:${row.length}`)
          .join(';');
        if (idMap) values.push(`idmap=${idMap}`);
      }
      return values.join(',');
    };
    if (!canProceedHardware.value) throw new Error(gettext('Please complete all required fields.'));
    if (form.rootfsStorage && isValidDiskSize(form.rootfsSize))
      payload.rootfs = mountValue(form.rootfsStorage, form.rootfsSize, {
        quota: quotaAllowed(form.rootfsStorage) && form.rootfsQuota,
        acl: form.rootfsAcl,
        skipReplication: form.rootfsSkipReplication,
        mountOptions: form.rootfsMountOptions,
        idMapPassthrough: form.rootfsIdMapPassthrough,
        idMaps: form.rootfsIdMaps,
      });
    form.managedMounts.forEach((mount) => {
      payload[mount.id] = mountValue(mount.storage, mount.size, {
        ...mount,
        quota: quotaAllowed(mount.storage) && mount.quota,
      });
    });
    if (form.sshkeys.trim()) payload['ssh-public-keys'] = form.sshkeys.trim();
    let mountIndex = form.managedMounts.reduce(
      (next, mount) => Math.max(next, Number(mount.id.slice(2)) + 1),
      0
    );
    const addMount = (value: string) => {
      if (mountIndex > maximumManagedMountId)
        throw new Error(gettext('Maximum number of mount points reached.'));
      payload[`mp${mountIndex}`] = value;
      mountIndex += 1;
    };
    form.mounts.forEach((mount) => {
      if (mount.hostPath && mount.containerPath)
        addMount(`${mount.hostPath}:${mount.containerPath}${mount.readOnly ? ':ro' : ''}`);
    });
    form.bindMounts.forEach((mount) => {
      if (!mount.hostPath || !mount.containerPath) return;
      const parts = [`${mount.hostPath}:${mount.containerPath}`];
      if (mount.readOnly) parts.push('ro');
      if (mount.createIfMissing) parts.push('create=1');
      if (mount.propagation) parts.push(`prop=${mount.propagation}`);
      addMount(parts.join(':'));
    });
    if (!isBlankNumber(form.cpuUnits)) payload.cpuunits = Number(form.cpuUnits);
    if (!isBlankNumber(form.cpuLimit)) payload.cpulimit = Number(form.cpuLimit);
    if (form.cpuset.trim()) payload.cpuset = form.cpuset.trim();
    if (form.iopsRd.trim()) payload.iops_rd = form.iopsRd.trim();
    if (form.iopsWr.trim()) payload.iops_wr = form.iopsWr.trim();
    if (form.nameserver.trim())
      payload.nameserver = form.nameserver
        .trim()
        .split(/[ ,;]+/)
        .filter(Boolean)
        .join(' ');
    if (form.searchdomain.trim()) payload.searchdomain = form.searchdomain.trim();
    return payload;
  }
  async function submit() {
    validationError.value = '';
    if (!canSubmit.value || !validateStep('hardware')) {
      validationError.value = gettext('Please complete all required fields.');
      return;
    }
    loading.value = true;
    try {
      const response = await createCt(form.node, buildPayload());
      model.value = false;
      emit('completed');
      if (response.data)
        emit('task', {
          node: form.node,
          upid: String(response.data),
          title: `${form.hostname.trim() || form.vmid}: ${gettext('Create')}`,
        });
    } catch (error) {
      validationError.value = String(
        error instanceof Error ? error.message : gettext('Create failed.')
      );
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => form.node,
    async () => {
      await loadStorageOptions();
      await loadRootfsStorageOptions();
      await loadBridges();
      await loadNextId();
    }
  );
  watch(
    () => form.vmid,
    () => void validateVmidAvailability()
  );
  watch(
    () => form.templateStorage,
    async () => {
      await loadTemplates();
    }
  );
  watch(
    () => form.unprivileged,
    (unprivileged) => {
      if (!unprivileged)
        form.featuresChecked = form.featuresChecked.filter((feature) => feature !== 'nesting');
    }
  );
  watch(
    () => [
      form.unprivileged,
      form.rootfsStorage,
      ...form.managedMounts.map((mount) => mount.storage),
    ],
    () => {
      if (!quotaAllowed(form.rootfsStorage)) form.rootfsQuota = false;
      form.managedMounts.forEach((mount) => {
        if (!quotaAllowed(mount.storage)) mount.quota = false;
      });
    }
  );
  watch(model, (visible) => {
    if (visible) void initialize();
    else resetForm();
  });

  return {
    state: { loading, step, advanced, networkAdvanced },
    form,
    resources: {
      nodes,
      pools,
      storageOptions,
      rootfsStorageOptions,
      templateRows,
      bridgeRows,
      showAllTemplateArchitectures,
    },
    errors: { validationError, validationErrors, generalFieldErrors, validationErrorEntries },
    options: { featuresOptions },
    actions: { moveStep, validateStep, submit },
    derived: {
      canSubmit,
      canProceedGeneral,
      canProceedTemplate,
      canProceedHardware,
      cpuUnitsDefault,
      cpuUnitsMaximum,
      quotaAllowed,
      summaryRows,
    },
  };
}
