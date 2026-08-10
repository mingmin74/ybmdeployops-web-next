import { computed, reactive, shallowRef, watch, type Ref } from 'vue';
import { createCt, getCtNextId } from '@/api/vm';
import { getNodes, getPools, type PveNode, type PvePool, type PveRecord } from '@/api/resources';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
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
    netBridge: 'vmbr0',
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
    rootfsSize: 8192,
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
): CreateCtWizardContext {
  const loading = shallowRef(false);
  const step = shallowRef<CreateCtStepName>('general');
  const advanced = shallowRef(false);
  const networkAdvanced = shallowRef(false);
  const nodes = shallowRef<PveNode[]>([]);
  const pools = shallowRef<PvePool[]>([]);
  const storageOptions = shallowRef<string[]>([]);
  const rootfsStorageOptions = shallowRef<string[]>([]);
  const templateOptions = shallowRef<string[]>([]);
  const templateRows = shallowRef<PveRecord[]>([]);
  const validationError = shallowRef('');
  const validationErrors = shallowRef<Record<string, string>>({});
  const form = reactive<CreateCtForm>(defaultForm());
  const validationErrorEntries = computed(() => Object.entries(validationErrors.value));

  const canSubmit = computed(() => {
    const basic =
      !loading.value &&
      form.node !== '' &&
      form.vmid.trim() !== '' &&
      form.hostname.trim() !== '' &&
      (form.password.trim().length >= 5 || form.sshkeys.trim() !== '') &&
      (!form.password.trim() || form.password === form.confirmPassword) &&
      form.ostemplate !== '' &&
      Number.isFinite(Number(form.memory)) &&
      Number(form.memory) >= 16 &&
      Number.isFinite(Number(form.swap)) &&
      Number(form.swap) >= 0 &&
      Number.isFinite(Number(form.cores)) &&
      Number(form.cores) >= 1 &&
      Number(form.cores) <= 8192 &&
      (form.cpuLimit === null ||
        (Number.isFinite(Number(form.cpuLimit)) && Number(form.cpuLimit) >= 0)) &&
      (form.cpuUnits === null ||
        (Number.isFinite(Number(form.cpuUnits)) &&
          Number(form.cpuUnits) >= 8 &&
          Number(form.cpuUnits) <= 10000)) &&
      form.netName.trim() !== '' &&
      form.netBridge.trim() !== '' &&
      (form.netVlanTag === null ||
        (Number.isFinite(Number(form.netVlanTag)) &&
          Number(form.netVlanTag) >= 1 &&
          Number(form.netVlanTag) <= 4094)) &&
      (form.netMtu === null ||
        (Number.isFinite(Number(form.netMtu)) &&
          Number(form.netMtu) >= 576 &&
          Number(form.netMtu) <= 65535)) &&
      (form.netRate === null ||
        (Number.isFinite(Number(form.netRate)) &&
          Number(form.netRate) >= 0 &&
          Number(form.netRate) <= 10240));
    const rootfsOk = !(
      form.rootfsStorage &&
      (form.rootfsSize === null || Number(form.rootfsSize) <= 0)
    );
    const managedMountsOk = form.managedMounts.every(
      (mount) => mount.storage && Number(mount.size) > 0 && mount.mountPoint.trim().startsWith('/'),
    );
    return basic && rootfsOk && managedMountsOk;
  });
  const canProceedGeneral = computed(
    () =>
      form.node !== '' &&
      form.vmid.trim() !== '' &&
      form.hostname.trim() !== '' &&
      (form.password.trim().length >= 5 || form.sshkeys.trim() !== '') &&
      (!form.password.trim() || form.password === form.confirmPassword),
  );
  const canProceedTemplate = computed(() => form.ostemplate !== '');
  const canProceedHardware = computed(() => true);
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
      if (!form.hostname.trim())
        addValidationError(
          'hostname',
          gettext('Hostname') + ': ' + gettext('This field is required.'),
        );
      if (!form.password.trim() && !form.sshkeys.trim())
        addValidationError('password', gettext('Password or SSH public key is required.'));
      if (form.password.trim() && form.password.trim().length < 5)
        addValidationError('password', gettext('Password must contain at least 5 characters.'));
      if (form.password !== form.confirmPassword)
        addValidationError('confirmPassword', gettext('Passwords do not match!'));
    }
    if (stepName === 'template') {
      if (!form.templateStorage)
        addValidationError(
          'templateStorage',
          gettext('Storage') + ': ' + gettext('This field is required.'),
        );
      if (!form.ostemplate)
        addValidationError(
          'ostemplate',
          gettext('Template') + ': ' + gettext('This field is required.'),
        );
    }
    if (stepName === 'hardware') {
      if (!form.rootfsStorage)
        addValidationError(
          'rootfsStorage',
          gettext('Storage') + ': ' + gettext('This field is required.'),
        );
      if (!Number.isFinite(Number(form.rootfsSize)) || Number(form.rootfsSize) < 1)
        addValidationError(
          'rootfsSize',
          gettext('Disk size') + ': ' + gettext('Value must be at least 1.'),
        );
      form.managedMounts.forEach((mount, index) => {
        if (!mount.storage)
          addValidationError(
            `mp${index}Storage`,
            `${mount.id}: ${gettext('Storage')} - ${gettext('This field is required.')}`,
          );
        if (!Number.isFinite(Number(mount.size)) || Number(mount.size) < 1)
          addValidationError(
            `mp${index}Size`,
            `${mount.id}: ${gettext('Disk size')} - ${gettext('Value must be at least 1.')}`,
          );
        if (!mount.mountPoint.trim().startsWith('/'))
          addValidationError(
            `mp${index}Path`,
            `${mount.id}: ${gettext('Mount Point')} - ${gettext('Path has to start with /')}`,
          );
      });
    }
    if (stepName === 'mounts') {
      if (
        !Number.isFinite(Number(form.cores)) ||
        Number(form.cores) < 1 ||
        Number(form.cores) > 8192
      ) {
        addValidationError(
          'cores',
          gettext('Cores') + ': ' + gettext('Value must be between 1 and 8192.'),
        );
      }
      if (
        form.cpuLimit !== null &&
        (!Number.isFinite(Number(form.cpuLimit)) || Number(form.cpuLimit) < 0)
      ) {
        addValidationError(
          'cpuLimit',
          gettext('CPU limit') + ': ' + gettext('Value must be at least 0.'),
        );
      }
      if (
        form.cpuUnits !== null &&
        (!Number.isFinite(Number(form.cpuUnits)) ||
          Number(form.cpuUnits) < 8 ||
          Number(form.cpuUnits) > 10000)
      ) {
        addValidationError(
          'cpuUnits',
          gettext('CPU units') + ': ' + gettext('Value must be between 8 and 10000.'),
        );
      }
    }
    if (stepName === 'bindmounts') {
      if (!Number.isFinite(Number(form.memory)) || Number(form.memory) < 16) {
        addValidationError(
          'memory',
          gettext('Memory') + ': ' + gettext('Value must be at least 16.'),
        );
      }
      if (!Number.isFinite(Number(form.swap)) || Number(form.swap) < 0) {
        addValidationError('swap', gettext('Swap') + ': ' + gettext('Value must be at least 0.'));
      }
    }
    if (stepName === 'limits') {
      if (!form.netName.trim())
        addValidationError('netName', gettext('Name') + ': ' + gettext('This field is required.'));
      if (!form.netBridge.trim())
        addValidationError(
          'netBridge',
          gettext('Bridge') + ': ' + gettext('This field is required.'),
        );
      if (form.netHwaddr.trim() && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(form.netHwaddr)) {
        addValidationError(
          'netHwaddr',
          gettext('MAC address') + ': ' + gettext('Invalid MAC address'),
        );
      }
      if (
        form.netVlanTag !== null &&
        (!Number.isFinite(Number(form.netVlanTag)) ||
          Number(form.netVlanTag) < 1 ||
          Number(form.netVlanTag) > 4094)
      ) {
        addValidationError(
          'netVlanTag',
          gettext('VLAN Tag') + ': ' + gettext('Value must be between 1 and 4094.'),
        );
      }
      if (
        form.netMtu !== null &&
        (!Number.isFinite(Number(form.netMtu)) ||
          Number(form.netMtu) < 576 ||
          Number(form.netMtu) > 65535)
      ) {
        addValidationError('netMtu', 'MTU: ' + gettext('Value must be between 576 and 65535.'));
      }
      if (
        form.netRate !== null &&
        (!Number.isFinite(Number(form.netRate)) ||
          Number(form.netRate) < 0 ||
          Number(form.netRate) > 10240)
      ) {
        addValidationError(
          'netRate',
          gettext('Rate limit') + ': ' + gettext('Value must be between 0 and 10240.'),
        );
      }
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
      const response = await getNodes();
      nodes.value = response.data || [];
      if (!form.node && nodes.value.length) form.node = nodes.value[0]?.node || '';
    } catch {
      nodes.value = [];
    }
  }
  async function loadPools() {
    try {
      const response = await getPools();
      pools.value = (response.data || []).sort((left, right) =>
        left.poolid.localeCompare(right.poolid),
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
  async function loadStorageOptions() {
    if (!form.node) {
      storageOptions.value = [];
      form.templateStorage = '';
      return;
    }
    try {
      const response = await getNodeStorage(form.node, 'vztmpl');
      storageOptions.value = (response.data || [])
        .map((item: PveRecord) => textValue(item.storage))
        .filter(Boolean);
      form.templateStorage = storageOptions.value[0] || '';
    } catch {
      storageOptions.value = [];
      form.templateStorage = '';
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
        .map((item: PveRecord) => textValue(item.storage))
        .filter(Boolean);
      if (!rootfsStorageOptions.value.includes(form.rootfsStorage))
        form.rootfsStorage = rootfsStorageOptions.value[0] || '';
    } catch {
      rootfsStorageOptions.value = [];
      form.rootfsStorage = '';
    }
  }
  async function loadTemplates() {
    if (!form.node || !form.templateStorage) {
      templateOptions.value = [];
      templateRows.value = [];
      form.ostemplate = '';
      return;
    }
    try {
      const response = await getStorageContent(form.node, form.templateStorage, 'vztmpl');
      templateRows.value = (response.data || []).filter((item: PveRecord) =>
        Boolean(item.volid || item.filename),
      );
      templateOptions.value = templateRows.value.map(
        (item) => textValue(item.volid) || textValue(item.filename),
      );
      form.ostemplate = templateOptions.value[0] || '';
    } catch {
      templateOptions.value = [];
      templateRows.value = [];
      form.ostemplate = '';
    }
  }
  function resetForm() {
    Object.assign(form, {
      node: nodes.value[0]?.node || '',
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
      netBridge: 'vmbr0',
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
      rootfsStorage: rootfsStorageOptions.value[0] || '',
      rootfsSize: 8192,
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
    });
    validationError.value = '';
    validationErrors.value = {};
    advanced.value = false;
    networkAdvanced.value = false;
    templateOptions.value = [];
    templateRows.value = [];
  }
  async function initialize() {
    await loadNodes();
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
      memory: form.memory,
      swap: form.swap,
      cores: form.cores,
      net0: [
        form.netName && `name=${form.netName}`,
        form.netBridge && `bridge=${form.netBridge}`,
        form.netHwaddr && `hwaddr=${form.netHwaddr}`,
        form.netVlanTag !== null && `tag=${form.netVlanTag}`,
        `firewall=${form.netFirewall ? 1 : 0}`,
        form.netIpv4Mode === 'static' ? form.netIp && `ip=${form.netIp}` : `ip=${form.netIpv4Mode}`,
        form.netIpv4Mode === 'static' && form.netGateway && `gw=${form.netGateway}`,
        form.netIpv6Mode === 'static'
          ? form.netIp6 && `ip6=${form.netIp6}`
          : `ip6=${form.netIpv6Mode}`,
        form.netIpv6Mode === 'static' && form.netGateway6 && `gw6=${form.netGateway6}`,
        form.netDisconnect && 'link_down=1',
        form.netMtu !== null && `mtu=${form.netMtu}`,
        form.netRate !== null && `rate=${form.netRate}`,
        form.netHostManaged && 'host-managed=1',
      ]
        .filter(Boolean)
        .join(','),
    };
    if (form.password.trim()) payload.password = form.password.trim();
    if (form.unprivileged) payload.unprivileged = 1;
    if (form.pool) payload.pool = form.pool;
    if (form.haManaged) payload['ha-managed'] = 1;
    if (form.tags.trim()) payload.tags = form.tags.trim();
    const featureList = form.features
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    featureList.push(...form.featuresChecked.filter((feature) => !featureList.includes(feature)));
    if (featureList.length) payload.features = featureList.join(',');
    const mountValue = (
      storage: string,
      size: number | null,
      options: Pick<
        CtManagedMount,
        'quota' | 'acl' | 'skipReplication' | 'mountOptions' | 'idMapPassthrough' | 'idMaps'
      > &
        Partial<Pick<CtManagedMount, 'mountPoint' | 'backup' | 'readOnly'>>,
    ) => {
      const values = [`${storage}:${Number(size)}M`];
      if (options.mountPoint) values.push(`mp=${options.mountPoint}`);
      if (options.quota) values.push('quota=1');
      if (options.acl !== '__default__') values.push(`acl=${options.acl}`);
      if (options.skipReplication) values.push('replicate=0');
      if (options.backup === false) values.push('backup=0');
      if (options.readOnly) values.push('ro=1');
      if (options.mountOptions.length)
        values.push(`mountoptions=${options.mountOptions.join(';')}`);
      if (options.idMapPassthrough) values.push('idmap=passthrough');
      else {
        const idMap = options.idMaps
          .filter((row) => row.ct && row.host && row.length)
          .map((row) => `${row.type}:${row.ct}:${row.host}:${row.length}`)
          .join(';');
        if (idMap) values.push(`idmap=${idMap}`);
      }
      return values.join(',');
    };
    if (form.rootfsStorage && Number(form.rootfsSize))
      payload.rootfs = mountValue(form.rootfsStorage, form.rootfsSize, {
        quota: form.rootfsQuota,
        acl: form.rootfsAcl,
        skipReplication: form.rootfsSkipReplication,
        mountOptions: form.rootfsMountOptions,
        idMapPassthrough: form.rootfsIdMapPassthrough,
        idMaps: form.rootfsIdMaps,
      });
    form.managedMounts.forEach((mount) => {
      if (mount.storage && Number(mount.size) > 0 && mount.mountPoint.trim())
        payload[mount.id] = mountValue(mount.storage, mount.size, mount);
    });
    if (form.sshkeys.trim()) payload['ssh-public-keys'] = form.sshkeys.trim();
    let mountIndex = form.managedMounts.reduce(
      (next, mount) => Math.max(next, Number(mount.id.slice(2)) + 1),
      0,
    );
    const addMount = (value: string) => {
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
    if (form.cpuUnits) payload.cpuunits = Number(form.cpuUnits);
    if (form.cpuLimit) payload.cpulimit = Number(form.cpuLimit);
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
    if (!canSubmit.value) {
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
        error instanceof Error ? error.message : gettext('Create failed.'),
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
      await loadNextId();
    },
  );
  watch(
    () => form.templateStorage,
    async () => {
      await loadTemplates();
    },
  );
  watch(
    () => form.unprivileged,
    (unprivileged) => {
      if (!unprivileged)
        form.featuresChecked = form.featuresChecked.filter((feature) => feature !== 'nesting');
    },
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
      templateOptions,
      templateRows,
    },
    errors: { validationError, validationErrors, validationErrorEntries },
    options: { featuresOptions },
    actions: { moveStep, validateStep, submit },
    derived: { canSubmit, canProceedGeneral, canProceedTemplate, canProceedHardware, summaryRows },
  };
}
