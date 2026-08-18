import type { ComputedRef, Ref } from 'vue';
import type { PveNode, PvePool, PveRecord } from '@/api/resources';

export type CreateCtStepName =
  'general' | 'template' | 'hardware' | 'mounts' | 'bindmounts' | 'limits' | 'dns' | 'confirm';

export type CtMount = {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
};

export type CtBindMount = CtMount & {
  createIfMissing: boolean;
  propagation: string;
};

export type CtManagedMount = {
  id: string;
  mountPoint: string;
  storage: string;
  size: number | null;
  quota: boolean;
  acl: '__default__' | '0' | '1';
  backup: boolean;
  readOnly: boolean;
  keepAttrs: boolean;
  skipReplication: boolean;
  mountOptions: string[];
  idMapPassthrough: boolean;
  idMaps: CtIdMap[];
};

export type CtIdMap = {
  type: 'u' | 'g';
  ct: string;
  host: string;
  length: string;
};

export type CreateCtForm = {
  node: string;
  vmid: string;
  hostname: string;
  pool: string;
  haManaged: boolean;
  templateStorage: string;
  ostemplate: string;
  memory: number | '';
  swap: number | '';
  cores: number | '';
  password: string;
  confirmPassword: string;
  netBridge: string;
  netName: string;
  netHwaddr: string;
  netVlanTag: number | null | '';
  netFirewall: boolean;
  netIpv4Mode: 'static' | 'dhcp';
  netIp: string;
  netGateway: string;
  netIpv6Mode: 'static' | 'dhcp' | 'auto';
  netIp6: string;
  netGateway6: string;
  netDisconnect: boolean;
  netMtu: number | null | '';
  netRate: number | null | '';
  netHostManaged: boolean;
  nameserver: string;
  searchdomain: string;
  unprivileged: boolean;
  features: string;
  rootfsStorage: string;
  rootfsSize: number | null;
  rootfsQuota: boolean;
  rootfsAcl: '__default__' | '0' | '1';
  rootfsSkipReplication: boolean;
  rootfsMountOptions: string[];
  rootfsIdMapPassthrough: boolean;
  rootfsIdMaps: CtIdMap[];
  sshkeys: string;
  tags: string;
  featuresChecked: string[];
  mounts: CtMount[];
  bindMounts: CtBindMount[];
  managedMounts: CtManagedMount[];
  cpuUnits: number | null | '';
  cpuLimit: number | null | '';
  cpuset: string;
  iopsRd: string;
  iopsWr: string;
};

export type CreateCtWizardContext = {
  state: {
    loading: Ref<boolean>;
    step: Ref<CreateCtStepName>;
    advanced: Ref<boolean>;
    networkAdvanced: Ref<boolean>;
  };
  form: CreateCtForm;
  resources: {
    nodes: Ref<PveNode[]>;
    pools: Ref<PvePool[]>;
    storageOptions: Ref<PveRecord[]>;
    rootfsStorageOptions: Ref<PveRecord[]>;
    templateRows: Ref<PveRecord[]>;
    bridgeRows: Ref<PveRecord[]>;
    showAllTemplateArchitectures: Ref<boolean>;
  };
  errors: {
    validationError: Ref<string>;
    validationErrors: Ref<Record<string, string>>;
    generalFieldErrors: ComputedRef<Record<string, string>>;
    validationErrorEntries: ComputedRef<[string, string][]>;
  };
  options: {
    featuresOptions: string[];
  };
  actions: {
    moveStep: (delta: number) => Promise<void>;
    validateStep: (stepName: CreateCtStepName) => boolean;
    submit: () => Promise<void>;
  };
  derived: {
    canSubmit: ComputedRef<boolean>;
    canProceedGeneral: ComputedRef<boolean>;
    canProceedTemplate: ComputedRef<boolean>;
    canProceedHardware: ComputedRef<boolean>;
    canProceedDns: ComputedRef<boolean>;
    nameserverValid: ComputedRef<boolean>;
    cpuUnitsDefault: ComputedRef<number>;
    cpuUnitsMaximum: ComputedRef<number>;
    quotaAllowed: (storage: string) => boolean;
    summaryRows: ComputedRef<[string, string | number][]>;
  };
};
