<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import { createStorage, getStorageConfig, getStorageScan, getStorages, updateStorage } from '@/api/storage';
import { getStorageContent } from '@/api/storageContent';
import { getCephFilesystems, getCephMonitors, getCephPools } from '@/api/ceph';
import type { PveNode, PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type StorageType =
  | 'dir'
  | 'lvm'
  | 'lvmthin'
  | 'btrfs'
  | 'nfs'
  | 'cifs'
  | 'iscsi'
  | 'cephfs'
  | 'rbd'
  | 'zfs'
  | 'zfspool'
  | 'pbs'
  | 'esxi';

const props = defineProps<{
  type: StorageType;
  storage?: string | undefined;
  nodes: PveNode[];
}>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [] }>();

const loading = reactive({ form: false, save: false });
const scanLoading = shallowRef(false);
const scanNode = shallowRef('localhost');
const baseLoading = shallowRef(false);
const baseStorages = shallowRef<string[]>([]);
const baseVolumes = shallowRef<string[]>([]);
const cephLoading = shallowRef(false);
const pveCephPossible = shallowRef(false);
const managedCeph = shallowRef(false);
const managedMonitors = shallowRef('');
const managedPools = shallowRef<string[]>([]);
const managedFilesystems = shallowRef<string[]>([]);
const generatedEncryptionKey = shallowRef('');
const encryptionKeyVisible = shallowRef(false);
const allowEncryptionEdit = shallowRef(false);
const scanOptions = reactive<Record<string, string[]>>({
  vgname: [],
  thinpool: [],
  export: [],
  share: [],
  target: [],
  pool: [],
});
const tab = defineModel<string>('tab', { default: 'general' });
// This mirrors the backend's type-dependent storage schema; each editor exposes a different field set.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const form = reactive<Record<string, any>>({});
const original = shallowRef<PveRecord>({});
const isCreate = computed(() => !props.storage);
const canDoBackups = computed(() =>
  ['dir', 'btrfs', 'nfs', 'cifs', 'cephfs', 'pbs'].includes(props.type),
);
const isPbs = computed(() => props.type === 'pbs');
const hasEncryptionKey = computed(() => Boolean(textValue(original.value['encryption-key'])));
const hasPreallocation = computed(() => ['dir', 'btrfs', 'nfs', 'cifs'].includes(props.type));
const hasVolumeChain = computed(() => ['dir', 'nfs', 'cifs', 'lvm'].includes(props.type));
const title = computed(
  () => `${gettext(isCreate.value ? 'Add' : 'Edit')}: ${storageTypeLabel(props.type)}`,
);
const contentMode = computed<'multi' | 'fixed' | 'hidden'>(() => {
  if (['iscsi', 'zfs', 'esxi'].includes(props.type)) return 'hidden';
  if (props.type === 'pbs') return 'fixed';
  return 'multi';
});
const contentOptions = computed(() => {
  if (['lvm', 'lvmthin', 'rbd', 'zfspool'].includes(props.type)) return ['images', 'rootdir'];
  if (props.type === 'cephfs') return ['backup', 'iso', 'vztmpl', 'snippets', 'import'];
  if (props.type === 'pbs') return ['backup'];
  return ['images', 'rootdir', 'backup', 'iso', 'vztmpl', 'snippets', 'import'];
});
const isCephStorage = computed(() => ['rbd', 'cephfs'].includes(props.type));
const externalCeph = computed(() => isCephStorage.value && !managedCeph.value);
const requires = computed(() => {
  const common = ['storage'];
  const required: Record<StorageType, string[]> = {
    dir: ['path'],
    lvm: ['vgname'],
    lvmthin: ['vgname', 'thinpool'],
    btrfs: ['path'],
    nfs: ['server', 'export'],
    cifs: ['server', 'share'],
    iscsi: ['portal', 'target'],
    cephfs: ['fs-name'],
    rbd: ['pool'],
    zfs: ['portal', 'pool', 'blocksize', 'target', 'iscsiprovider'],
    zfspool: ['pool'],
    pbs: ['server', 'username', 'password', 'datastore'],
    esxi: ['server', 'username', 'password'],
  };
  if (contentMode.value === 'multi') common.push('content');
  if (!isCreate.value)
    return [...common, ...required[props.type].filter((name) => name !== 'password')];
  return [...common, ...required[props.type]];
});

function storageTypeLabel(type: StorageType) {
  return {
    dir: 'Directory',
    lvm: 'LVM',
    lvmthin: 'LVM-Thin',
    btrfs: 'BTRFS',
    nfs: 'NFS',
    cifs: 'SMB/CIFS',
    iscsi: 'iSCSI',
    cephfs: 'CephFS',
    rbd: 'RBD',
    zfs: 'ZFS over iSCSI',
    zfspool: 'ZFS',
    pbs: 'Proxmox Backup Server',
    esxi: 'ESXi',
  }[type];
}
function parseRetention(value: string) {
  return Object.fromEntries(
    value
      .split(',')
      .map((entry) => entry.split('='))
      .filter(([key, setting]) => Boolean(key && setting)),
  ) as Record<string, string>;
}

function pruneBackups() {
  if (form.keepAll) return 'keep-all=1';
  return [
    ['keep-last', form.keepLast],
    ['keep-hourly', form.keepHourly],
    ['keep-daily', form.keepDaily],
    ['keep-weekly', form.keepWeekly],
    ['keep-monthly', form.keepMonthly],
    ['keep-yearly', form.keepYearly],
  ]
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .map(([name, value]) => `${name}=${value}`)
    .join(',');
}

async function readEncryptionKey(file: File | null) {
  form.encryptionUpload = '';
  if (!file) return;
  try {
    const value = await file.text();
    const parsed = JSON.parse(value) as PveRecord;
    if (!textValue(parsed.data)) throw new Error('missing data');
    form.encryptionUpload = value;
  } catch {
    Notify.create({ type: 'negative', message: gettext('The encryption key must be a valid JSON file.') });
  }
}

function copyEncryptionKey() {
  void navigator.clipboard?.writeText(generatedEncryptionKey.value);
}

function downloadEncryptionKey() {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([generatedEncryptionKey.value], { type: 'application/json' }));
  link.href = url;
  link.download = `${textValue(form.storage) || 'pbs'}-encryption-key.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function printEncryptionKey() {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) return;
  printWindow.document.write(
    `<pre>-----BEGIN PROXMOX BACKUP KEY-----\n${generatedEncryptionKey.value}\n-----END PROXMOX BACKUP KEY-----</pre>`,
  );
  printWindow.document.close();
  printWindow.print();
}

function reset(values: PveRecord = {}) {
  const defaultContent: Record<StorageType, string[]> = {
    dir: ['images'],
    lvm: ['images', 'rootdir'],
    lvmthin: ['images', 'rootdir'],
    btrfs: ['images', 'rootdir'],
    nfs: ['images'],
    cifs: ['images'],
    iscsi: [],
    cephfs: ['backup'],
    rbd: ['images'],
    zfs: [],
    zfspool: ['images', 'rootdir'],
    pbs: ['backup'],
    esxi: [],
  };
  const content = textValue(values.content).split(',').filter(Boolean);
  const nfsOptions = textValue(values.options).split(',').filter(Boolean);
  const nfsVersion =
    nfsOptions.find((option) => option.startsWith('vers='))?.replace(/^vers=/, '') || '__default__';
  const retention = parseRetention(textValue(values['prune-backups']));
  Object.keys(form).forEach((key) => delete form[key]);
  const defaults = {
    storage: '',
    nodes: [],
    enable: true,
    content: defaultContent[props.type],
    shared: false,
    saferemove: false,
    sparse: false,
    krbd: false,
    luns: true,
    preallocation: '__default__',
    'snapshot-as-volume-chain': false,
    nfsversion: '__default__',
    options: '',
    blocksize: props.type === 'zfs' ? '4k' : '',
    iscsiprovider: 'comstar',
    writecache: true,
    port: '',
    basesel: '',
    namespace: '',
    fingerprint: '',
    keepAll: isCreate.value,
    keepLast: '',
    keepHourly: '',
    keepDaily: '',
    keepWeekly: '',
    keepMonthly: '',
    keepYearly: '',
    maxProtectedBackups: '',
    cryptMode: 'none',
    encryptionUpload: '',
  };
  Object.assign(form, defaults, values, {
    nodes: textValue(values.nodes).split(',').filter(Boolean),
    content: content.length ? content : defaultContent[props.type],
    options: nfsOptions.filter((option) => !option.startsWith('vers=')).join(','),
    nfsversion: nfsVersion,
    luns: textValue(values.content).split(',').includes('images'),
    writecache: Number(values.nowritecache || 0) === 0,
    shared: Number(values.shared || 0) !== 0,
    saferemove: Number(values.saferemove || 0) !== 0,
    sparse: Number(values.sparse || 0) !== 0,
    krbd: Number(values.krbd || 0) !== 0,
    'snapshot-as-volume-chain': Number(values['snapshot-as-volume-chain'] || 0) !== 0,
    'skip-cert-verification': Number(values['skip-cert-verification'] || 0) !== 0,
    enable: Number(values.disable || 0) === 0,
    keepAll:
      retention['keep-all'] !== undefined
        ? retention['keep-all'] === '1'
        : isCreate.value,
    keepLast: retention['keep-last'] || '',
    keepHourly: retention['keep-hourly'] || '',
    keepDaily: retention['keep-daily'] || '',
    keepWeekly: retention['keep-weekly'] || '',
    keepMonthly: retention['keep-monthly'] || '',
    keepYearly: retention['keep-yearly'] || '',
    maxProtectedBackups: textValue(values['max-protected-backups']),
    cryptMode: textValue(values['encryption-key']) ? 'keep' : 'none',
  });
  generatedEncryptionKey.value = '';
  encryptionKeyVisible.value = false;
  allowEncryptionEdit.value = false;
  managedCeph.value = isCephStorage.value && !textValue(values.monhost);
}
async function loadManagedCeph() {
  if (!isCephStorage.value || !managedCeph.value) return;
  cephLoading.value = true;
  try {
    const monitors = await getCephMonitors();
    managedMonitors.value = (monitors.data || [])
      .map((monitor) => textValue(monitor.name))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .join(',');
    pveCephPossible.value = Boolean(managedMonitors.value);
    if (!pveCephPossible.value) {
      managedCeph.value = false;
      return;
    }
    const selector = props.type === 'rbd' ? getCephPools() : getCephFilesystems();
    const [result] = await Promise.allSettled([selector]);
    if (result.status === 'fulfilled') {
      if (props.type === 'rbd')
        managedPools.value = (result.value.data || [])
          .map((pool) => textValue(pool.pool_name || pool.pool))
          .filter(Boolean);
      else
        managedFilesystems.value = (result.value.data || [])
          .map((filesystem) => textValue(filesystem.name))
          .filter(Boolean);
    }
  } catch {
    pveCephPossible.value = false;
    managedCeph.value = false;
  } finally {
    cephLoading.value = false;
  }
}
async function loadBaseStorages() {
  if (props.type !== 'lvm' || !isCreate.value) return;
  const response = await getStorages();
  baseStorages.value = (response.data || [])
    .filter((storage) => textValue(storage.type) === 'iscsi')
    .map((storage) => textValue(storage.storage))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
async function loadBaseVolumes() {
  if (!form.basesel) return;
  baseLoading.value = true;
  try {
    const response = await getStorageContent(scanNode.value, textValue(form.basesel), 'images');
    baseVolumes.value = (response.data || [])
      .map((volume) => textValue(volume.volid))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    baseLoading.value = false;
  }
}
function isFixed(name: string) {
  if (isCreate.value) return false;
  if (name === 'storage') return true;
  return (
    {
      dir: ['path'],
      btrfs: ['path'],
      nfs: ['server', 'export'],
      cifs: ['server', 'username', 'password', 'share', 'domain', 'subdir'],
      iscsi: ['portal', 'target'],
      cephfs: ['fs-name', 'username', 'keyring'],
      rbd: ['pool', 'username', 'keyring', 'namespace'],
      zfs: [
        'portal',
        'pool',
        'target',
        'blocksize',
        'iscsiprovider',
        'comstar_tg',
        'comstar_hg',
        'lio_tpg',
      ],
      zfspool: ['pool'],
      pbs: ['server', 'port', 'username', 'password', 'datastore', 'namespace'],
      esxi: ['server', 'port'],
      lvm: ['vgname', 'base'],
      lvmthin: ['vgname', 'thinpool'],
    }[props.type]?.includes(name) || false
  );
}
function fieldVisible(name: string) {
  const fields: Record<StorageType, string[]> = {
    dir: ['path'],
    lvm: ['vgname', 'base', 'saferemove'],
    lvmthin: ['vgname', 'thinpool'],
    btrfs: ['path'],
    nfs: ['server', 'export', 'nfsversion'],
    cifs: ['server', 'username', 'password', 'share', 'domain', 'subdir'],
    iscsi: ['portal', 'target', 'luns'],
    cephfs: ['fs-name', 'monhost', 'username', 'keyring'],
    rbd: ['pool', 'monhost', 'username', 'keyring', 'krbd', 'namespace'],
    zfs: [
      'portal',
      'pool',
      'blocksize',
      'target',
      'iscsiprovider',
      'comstar_tg',
      'comstar_hg',
      'lio_tpg',
      'sparse',
      'writecache',
    ],
    zfspool: ['pool', 'sparse', 'blocksize'],
    pbs: ['server', 'port', 'username', 'password', 'datastore', 'namespace', 'fingerprint'],
    esxi: ['server', 'port', 'username', 'password', 'skip-cert-verification'],
  };
  if (!fields[props.type].includes(name)) return false;
  if (props.type !== 'zfs') return true;
  if (['comstar_tg', 'comstar_hg'].includes(name)) return form.iscsiprovider === 'comstar';
  if (name === 'lio_tpg') return form.iscsiprovider === 'LIO';
  if (name === 'writecache') return ['comstar', 'istgt'].includes(textValue(form.iscsiprovider));
  return true;
}
function label(name: string) {
  return (
    (
      {
        storage: 'ID',
        nodes: 'Nodes',
        content: 'Content',
        path: 'Path',
        vgname: 'Volume group',
        thinpool: 'Thin Pool',
        base: 'Base volume',
        server: 'Server',
        export: 'Export',
        share: 'Share',
        portal: 'Portal',
        target: 'Target',
        pool: 'Pool',
        'fs-name': 'FS Name',
        monhost: 'Monitor(s)',
        username: 'Username',
        password: 'Password',
        keyring: 'Keyring',
        namespace: 'Namespace',
        datastore: 'Datastore',
        fingerprint: 'Fingerprint',
        domain: 'Domain',
        subdir: 'Subdirectory',
        blocksize: 'Block Size',
        iscsiprovider: 'iSCSI Provider',
        comstar_tg: 'Target group',
        comstar_hg: 'Host group',
        lio_tpg: 'Target portal group',
        port: 'Port',
        nfsversion: 'NFS Version',
      } as Record<string, string>
    )[name] || name
  );
}
function valid() {
  const required = [...requires.value];
  if (props.type === 'lvm' && form.basesel) required.push('base');
  if (props.type === 'zfs' && form.iscsiprovider === 'LIO') required.push('lio_tpg');
  if (externalCeph.value) required.push('monhost', 'keyring');
  const requiredValid = required.every((name) => {
    if (!isCreate.value && isFixed(name)) return true;
    const value = form[name];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  const hasValidEncryptionUpload =
    !isPbs.value || form.cryptMode !== 'upload' || Boolean(form.encryptionUpload);
  return requiredValid && hasValidEncryptionUpload && validZfsBlockSize(textValue(form.blocksize), props.type === 'zfs');
}

function validZfsBlockSize(value: string, required: boolean) {
  if (!value) return !required;
  const match = value.match(/^([1-9][0-9]*)([km])?$/i);
  if (!match) return false;
  let bytes = Number(match[1]);
  if (match[2]?.toLowerCase() === 'k') bytes *= 1024;
  if (match[2]?.toLowerCase() === 'm') bytes *= 1024 * 1024;
  return bytes >= 512 && bytes <= 16 * 1024 * 1024 && (bytes & (bytes - 1)) === 0;
}
function scanSpec(field: string) {
  const specs: Record<
    string,
    {
      kind: 'lvm' | 'lvmthin' | 'nfs' | 'cifs' | 'iscsi' | 'zfs';
      params?: PveRecord;
      value: string;
    }
  > = {
    vgname: { kind: 'lvm', value: 'vg' },
    thinpool: { kind: 'lvmthin', params: { vg: form.vgname }, value: 'lv' },
    export: { kind: 'nfs', params: { server: form.server }, value: 'path' },
    share: {
      kind: 'cifs',
      params: {
        server: form.server,
        username: form.username,
        password: form.password,
        domain: form.domain,
      },
      value: 'share',
    },
    target: { kind: 'iscsi', params: { portal: form.portal }, value: 'target' },
    pool: { kind: 'zfs', value: 'pool' },
  };
  return specs[field];
}
function isScannable(field: string) {
  if (props.type === 'lvm' && field === 'vgname' && form.basesel) return false;
  return (
    (isCreate.value && ['vgname', 'thinpool', 'export', 'share', 'target'].includes(field)) ||
    (isCreate.value && props.type === 'zfspool' && field === 'pool')
  );
}
function scanAllowsCustomValue(field: string) {
  return ['export', 'share', 'target'].includes(field);
}
function scanDisabled(field: string) {
  return (
    (field === 'thinpool' && !form.vgname) ||
    (field === 'export' && !form.server) ||
    (field === 'share' && !form.server) ||
    (field === 'target' && !form.portal)
  );
}
async function scan(field: string) {
  const spec = scanSpec(field);
  if (!spec || (spec.kind === 'lvmthin' && !spec.params?.vg)) return;
  scanLoading.value = true;
  try {
    const node = ['nfs', 'cifs'].includes(props.type) ? 'localhost' : scanNode.value;
    const response = await getStorageScan(node, spec.kind, spec.params);
    scanOptions[field] = (response.data || [])
      .map((item) => textValue(item[spec.value]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    scanLoading.value = false;
  }
}
function payload() {
  const fields: Record<StorageType, string[]> = {
    dir: [
      'storage',
      'nodes',
      'content',
      'disable',
      'path',
      'shared',
      'preallocation',
      'snapshot-as-volume-chain',
    ],
    lvm: [
      'storage',
      'nodes',
      'content',
      'disable',
      'vgname',
      'base',
      'shared',
      'saferemove',
      'snapshot-as-volume-chain',
    ],
    lvmthin: ['storage', 'nodes', 'content', 'disable', 'vgname', 'thinpool'],
    btrfs: ['storage', 'nodes', 'content', 'disable', 'path', 'preallocation', 'prune-backups'],
    nfs: [
      'storage',
      'nodes',
      'content',
      'disable',
      'server',
      'export',
      'options',
      'preallocation',
      'snapshot-as-volume-chain',
      'prune-backups',
    ],
    cifs: [
      'storage',
      'nodes',
      'content',
      'disable',
      'server',
      'username',
      'password',
      'share',
      'domain',
      'subdir',
      'preallocation',
      'snapshot-as-volume-chain',
      'prune-backups',
    ],
    iscsi: ['storage', 'nodes', 'disable', 'portal', 'target', 'content'],
    cephfs: ['storage', 'nodes', 'content', 'disable', 'fs-name', 'monhost', 'username', 'keyring'],
    rbd: [
      'storage',
      'nodes',
      'content',
      'disable',
      'pool',
      'monhost',
      'username',
      'keyring',
      'krbd',
      'namespace',
    ],
    zfs: [
      'storage',
      'nodes',
      'disable',
      'portal',
      'pool',
      'blocksize',
      'target',
      'iscsiprovider',
      'comstar_tg',
      'comstar_hg',
      'lio_tpg',
      'sparse',
      'nowritecache',
      'content',
    ],
    zfspool: ['storage', 'nodes', 'content', 'disable', 'pool', 'sparse', 'blocksize'],
    pbs: [
      'storage',
      'nodes',
      'content',
      'disable',
      'server',
      'port',
      'username',
      'password',
      'datastore',
      'namespace',
      'fingerprint',
      'prune-backups',
    ],
    esxi: [
      'storage',
      'nodes',
      'disable',
      'server',
      'port',
      'username',
      'password',
      'skip-cert-verification',
    ],
  };
  const data: PveRecord = {};
  const deletes: string[] = [];
  const add = (name: string, value: unknown) => {
    if (value !== '' && value !== undefined && value !== null) data[name] = value;
    else if (!isCreate.value && original.value[name] !== undefined) deletes.push(name);
  };
  fields[props.type].forEach((name) => {
    if (managedCeph.value && ['monhost', 'username', 'keyring'].includes(name)) return;
    if (
      !isCreate.value &&
      (isFixed(name) || (name === 'snapshot-as-volume-chain' && props.type !== 'lvm'))
    )
      return;
    if (name === 'preallocation' && form.preallocation === '__default__') {
      if (!isCreate.value && original.value.preallocation !== undefined) deletes.push(name);
      return;
    }
    if (name === 'snapshot-as-volume-chain' && !form[name]) {
      if (!isCreate.value && original.value[name] !== undefined) deletes.push(name);
      return;
    }
    if (name === 'skip-cert-verification' && !form[name]) {
      if (!isCreate.value && original.value[name] !== undefined) deletes.push(name);
      return;
    }
    if (name === 'disable') return add(name, form.enable ? 0 : 1);
    if (['shared', 'saferemove', 'sparse', 'krbd'].includes(name))
      return add(name, form[name] ? 1 : 0);
    if (name === 'nodes' || name === 'content')
      return add(name, Array.isArray(form[name]) ? form[name].join(',') : form[name]);
    if (name === 'password' && !isCreate.value && !form.password) return;
    if (name === 'nowritecache') return add(name, form.writecache ? 0 : 1);
    add(name, form[name]);
  });
  if (props.type === 'iscsi') data.content = form.luns ? 'images' : 'none';
  if (props.type === 'zfs') data.content = 'images';
  if (props.type === 'nfs') {
    const options = [
      textValue(form.options),
      form.nfsversion === '__default__' ? '' : `vers=${form.nfsversion}`,
    ]
      .filter(Boolean)
      .join(',');
    if (options) data.options = options;
    else if (!isCreate.value && original.value.options !== undefined) deletes.push('options');
  }
  if (canDoBackups.value) {
    const retention = pruneBackups();
    if (retention) data['prune-backups'] = retention;
    else if (!isCreate.value && original.value['prune-backups'] !== undefined) deletes.push('prune-backups');
    if (form.maxProtectedBackups !== '') data['max-protected-backups'] = form.maxProtectedBackups;
    else if (!isCreate.value && original.value['max-protected-backups'] !== undefined)
      deletes.push('max-protected-backups');
  }
  if (isPbs.value) {
    if (form.cryptMode === 'autogenerate') data['encryption-key'] = 'autogen';
    else if (form.cryptMode === 'upload') data['encryption-key'] = form.encryptionUpload;
    else if (
      !isCreate.value &&
      allowEncryptionEdit.value &&
      form.cryptMode === 'none' &&
      hasEncryptionKey.value
    )
      deletes.push('encryption-key');
  }
  if (isCreate.value) data.type = props.type;
  else {
    delete data.storage;
    delete data.type;
  }
  if (deletes.length) data.delete = [...new Set(deletes)];
  return data;
}
async function load() {
  if (!visible.value) return;
  tab.value = 'general';
  if (!props.storage) {
    original.value = {};
    reset();
    if (props.type === 'lvm') {
      void scan('vgname');
      void loadBaseStorages();
    }
    if (props.type === 'zfspool') void scan('pool');
    if (isCephStorage.value) void loadManagedCeph();
    return;
  }
  loading.form = true;
  try {
    original.value = (await getStorageConfig(props.storage)).data || {};
    reset(original.value);
    if (isCephStorage.value && managedCeph.value) void loadManagedCeph();
  } finally {
    loading.form = false;
  }
}
async function save() {
  if (!valid()) return;
  loading.save = true;
  try {
    const response = isCreate.value ? await createStorage(payload()) : await updateStorage(props.storage!, payload());
    const result = response.data || {};
    const config = (result.config || {}) as PveRecord;
    const key = textValue(config['encryption-key']);
    if (isPbs.value && form.cryptMode === 'autogenerate' && key) {
      generatedEncryptionKey.value = key;
      encryptionKeyVisible.value = true;
    }
    Notify.create({ type: 'positive', message: gettext('Storage saved successfully') });
    visible.value = false;
    emit('saved');
  } finally {
    loading.save = false;
  }
}
watch([visible, () => props.storage, () => props.type], load, { immediate: true });
watch(scanNode, (node) => {
  if (
    isCreate.value &&
    ['lvm', 'lvmthin', 'iscsi', 'zfspool'].includes(props.type)
  ) {
    form.nodes = node ? [node] : [];
  }
  if (isCreate.value && props.type === 'lvm' && form.basesel) void loadBaseVolumes();
});
watch(() => form.vgname, (value) => {
  if (props.type === 'lvmthin' && isCreate.value) {
    form.thinpool = '';
    scanOptions.thinpool = [];
    if (value) void scan('thinpool');
  }
});
watch(() => form.basesel, (storage) => {
  if (props.type !== 'lvm' || !isCreate.value) return;
  form.base = '';
  form.vgname = '';
  baseVolumes.value = [];
  if (storage) void loadBaseVolumes();
  else void scan('vgname');
});
watch(() => form.server, () => {
  if (props.type === 'nfs' && isCreate.value) {
    form.export = '';
    scanOptions.export = [];
  }
  if (props.type === 'cifs' && isCreate.value) scanOptions.share = [];
});
watch(() => [form.username, form.password, form.domain], () => {
  if (props.type === 'cifs' && isCreate.value) scanOptions.share = [];
});
watch(() => form.portal, (value) => {
  if (props.type === 'iscsi' && isCreate.value) {
    form.target = '';
    scanOptions.target = [];
    if (value) void scan('target');
  }
});
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="title" width="720px" :loading="loading.form">
      <q-form class="storage-editor" @submit="save">
        <q-tabs v-model="tab" dense align="justify" active-color="primary" indicator-color="primary">
          <q-tab no-caps name="general" :label="gettext('General')" />
          <q-tab v-if="canDoBackups" no-caps name="retention" :label="gettext('Backup Retention')" />
          <q-tab v-if="isPbs" no-caps name="encryption" :label="gettext('Encryption')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated>
          <q-tab-panel name="general">
            <div class="row q-col-gutter-lg">
              <div class="col-12 col-sm-6">
                <q-input v-model="form.storage" dense :label="gettext('ID')" :disable="isFixed('storage')" />
                <q-select v-if="contentMode === 'multi'" v-model="form.content" dense multiple options-dense
                  :options="contentOptions" :label="gettext('Content')" />
                <q-input v-else-if="contentMode === 'fixed'" :model-value="gettext('backup')" dense readonly
                  :label="gettext('Content')" />
                <q-checkbox v-model="form.enable" dense :label="gettext('Enable')" />
                <q-checkbox v-if="['dir', 'lvm'].includes(type)" v-model="form.shared" dense
                  :label="gettext('Shared')" />
                <q-checkbox v-if="fieldVisible('saferemove')" v-model="form.saferemove" dense
                  :label="gettext('Wipe Removed Volumes')" />
                <q-checkbox v-if="fieldVisible('luns')" v-model="form.luns" dense
                  :label="gettext('Use LUNs directly')" />
                <q-checkbox v-if="fieldVisible('krbd')" v-model="form.krbd" dense label="KRBD" />
                <q-checkbox v-if="fieldVisible('sparse')" v-model="form.sparse" dense
                  :label="gettext('Thin provision')" />
                <q-checkbox v-if="fieldVisible('writecache')" v-model="form.writecache" dense
                  :label="gettext('Write cache')" />
              </div>
              <div class="col-12 col-sm-6">
                <q-select v-model="form.nodes" dense multiple options-dense emit-value map-options option-value="node"
                  option-label="node" :options="nodes" :disable="storage === 'local'" :label="gettext('Nodes')" />
                <q-checkbox
                  v-if="isCreate && isCephStorage"
                  v-model="managedCeph"
                  dense
                  :loading="cephLoading"
                  :disable="!pveCephPossible"
                  :label="gettext(type === 'rbd' ? 'Use Proxmox VE managed hyper-converged ceph pool' : 'Use Proxmox VE managed hyper-converged cephFS')"
                />
                <q-select
                  v-if="isCreate && type === 'rbd' && managedCeph"
                  v-model="form.pool"
                  dense
                  :options="managedPools"
                  :label="gettext('Pool')"
                />
                <q-select
                  v-if="isCreate && type === 'cephfs' && managedCeph"
                  v-model="form['fs-name']"
                  dense
                  :options="managedFilesystems"
                  :label="gettext('FS Name')"
                />
                <q-input
                  v-if="isCephStorage && managedCeph"
                  :model-value="managedMonitors"
                  dense
                  readonly
                  :label="gettext('Monitor(s)')"
                />
                <q-input
                  v-if="!isCreate && type === 'rbd' && managedCeph"
                  :model-value="form.pool"
                  dense
                  readonly
                  :label="gettext('Pool')"
                />
                <q-input
                  v-if="!isCreate && type === 'cephfs' && managedCeph"
                  :model-value="form['fs-name']"
                  dense
                  readonly
                  :label="gettext('FS Name')"
                />
                <q-select v-if="
                  isCreate && ['lvm', 'lvmthin', 'iscsi', 'zfspool'].includes(type)
                " v-model="scanNode" dense emit-value map-options option-value="node" option-label="node"
                  :options="nodes" :label="gettext('Node to scan')" />
                <q-select
                  v-if="isCreate && type === 'lvm'"
                  v-model="form.basesel"
                  dense
                  clearable
                  :options="baseStorages"
                  :label="gettext('Base storage')"
                />
                <q-select
                  v-if="isCreate && type === 'lvm' && form.basesel"
                  v-model="form.base"
                  dense
                  use-input
                  new-value-mode="add-unique"
                  :loading="baseLoading"
                  :options="baseVolumes"
                  :label="gettext('Base volume')"
                  @popup-show="loadBaseVolumes"
                />
                <q-select v-for="name in ['vgname', 'thinpool', 'export', 'share', 'target', 'pool']"
                  v-show="fieldVisible(name) && isScannable(name)" :key="`scan-${name}`" v-model="form[name]" dense
                  :use-input="scanAllowsCustomValue(name)" :new-value-mode="scanAllowsCustomValue(name) ? 'add-unique' : undefined"
                  :disable="scanDisabled(name)" :options="scanOptions[name]" :label="gettext(label(name))" @popup-show="scan(name)">
                  <template #append>
                    <q-btn flat round dense icon="refresh" :loading="scanLoading" :aria-label="gettext('Refresh')"
                      @click.stop="scan(name)" />
                  </template>
                </q-select>
                <q-input v-for="name in [
                  'path',
                  'vgname',
                  'thinpool',
                  'base',
                  'server',
                  'export',
                  'share',
                  'portal',
                  'target',
                  'pool',
                  'fs-name',
                  'monhost',
                  'username',
                  'password',
                  'keyring',
                  'namespace',
                  'datastore',
                  'fingerprint',
                  'domain',
                  'subdir',
                  'blocksize',
                  'comstar_tg',
                  'comstar_hg',
                  'lio_tpg',
                  'port',
                ]" :key="name" v-show="fieldVisible(name) && !isScannable(name) && !(name === 'base' && isCreate && type === 'lvm') && !(isCephStorage && managedCeph && ['pool', 'fs-name', 'monhost', 'username', 'keyring'].includes(name))" v-model="form[name]" dense
                  :type="['password', 'keyring'].includes(name) ? 'password' : 'text'" :label="gettext(label(name))"
                  :disable="isFixed(name)" />
                <q-select v-if="fieldVisible('iscsiprovider')" v-model="form.iscsiprovider" dense emit-value map-options
                  :options="[
                    { label: 'LIO', value: 'LIO' },
                    { label: 'COMSTAR', value: 'comstar' },
                    { label: 'istgt', value: 'istgt' },
                  ]" :label="gettext('iSCSI Provider')" :disable="isFixed('iscsiprovider')" />
                <q-select v-if="fieldVisible('nfsversion')" v-model="form.nfsversion" dense
                  :options="['__default__', '3', '4', '4.1', '4.2']" :label="gettext('NFS Version')" />
                <q-checkbox v-if="fieldVisible('skip-cert-verification')" v-model="form['skip-cert-verification']" dense
                  :label="gettext('Skip Certificate Verification')" />
              </div>
            </div>
            <q-expansion-item v-if="hasPreallocation || hasVolumeChain" dense :label="gettext('Advanced')">
              <q-select v-if="hasPreallocation" v-model="form.preallocation" dense
                :options="['__default__', 'off', 'metadata', 'falloc', 'full']" :label="gettext('Preallocation')" />
              <q-checkbox v-if="hasVolumeChain" v-model="form['snapshot-as-volume-chain']" dense
                :disable="!isCreate && type !== 'lvm'" :label="gettext('Allow Snapshots as Volume-Chain')" />
              <div v-if="hasVolumeChain" class="text-caption text-grey-7">
                {{ gettext('Snapshots as Volume-Chain are a technology preview.') }}
              </div>
              <div v-if="type === 'lvm' && hasVolumeChain" class="text-caption text-grey-7">
                {{ gettext('Keep Snapshots as Volume - Chain enabled if qcow2 images exist!') }}
              </div>
            </q-expansion-item>
            <div v-if="type === 'btrfs'" class="text-caption text-grey-7 q-mt-sm">
              {{ gettext('BTRFS integration is currently a technology preview.') }}
            </div>
            <div v-if="type === 'rbd' && form.namespace" class="text-caption text-grey-7 q-mt-sm">
              {{ gettext('RBD namespaces must be created manually!') }}
            </div>
          </q-tab-panel>
          <q-tab-panel v-if="canDoBackups" name="retention">
            <q-checkbox v-model="form.keepAll" dense :label="gettext('Keep all backups')" />
            <div v-if="!form.keepAll" class="row q-col-gutter-lg q-mt-xs">
              <div class="col-12 col-sm-6">
                <q-input v-model="form.keepLast" dense type="number" min="0" :label="gettext('Keep last')" />
                <q-input v-model="form.keepHourly" dense type="number" min="0" :label="gettext('Keep hourly')" />
                <q-input v-model="form.keepDaily" dense type="number" min="0" :label="gettext('Keep daily')" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="form.keepWeekly" dense type="number" min="0" :label="gettext('Keep weekly')" />
                <q-input v-model="form.keepMonthly" dense type="number" min="0" :label="gettext('Keep monthly')" />
                <q-input v-model="form.keepYearly" dense type="number" min="0" :label="gettext('Keep yearly')" />
              </div>
            </div>
            <q-input v-model="form.maxProtectedBackups" dense type="number" min="0" class="q-mt-sm"
              :label="gettext('Max protected backups')" />
            <div v-if="isPbs" class="text-caption text-grey-7 q-mt-sm">
              {{ gettext('Retention settings are used when pruning backups on this server.') }}
            </div>
          </q-tab-panel>
          <q-tab-panel v-if="isPbs" name="encryption">
            <q-checkbox
              v-if="!isCreate && hasEncryptionKey"
              v-model="allowEncryptionEdit"
              dense
              :label="gettext('Edit existing encryption key (dangerous!)')"
            />
            <div v-if="!isCreate && hasEncryptionKey && allowEncryptionEdit" class="text-negative q-mt-sm">
              {{ gettext('Deleting or replacing the encryption key will break restoring backups created with it!') }}
            </div>
            <q-option-group
              v-model="form.cryptMode"
              type="radio"
              :options="[
                { label: gettext('Do not encrypt backups'), value: 'none', disable: !isCreate && hasEncryptionKey && !allowEncryptionEdit },
                { label: gettext('Keep encryption key'), value: 'keep', disable: isCreate || !hasEncryptionKey },
                { label: gettext('Auto-generate a client encryption key'), value: 'autogenerate', disable: !isCreate || (!allowEncryptionEdit && hasEncryptionKey) },
                { label: gettext('Upload an existing client encryption key'), value: 'upload', disable: !isCreate || (!allowEncryptionEdit && hasEncryptionKey) },
              ]"
            />
            <q-file
              v-if="form.cryptMode === 'upload'"
              dense
              clearable
              accept="application/json,.json"
              class="q-mt-md"
              :label="gettext('Encryption key')"
              @update:model-value="readEncryptionKey"
            />
            <div class="text-caption text-grey-7 q-mt-sm">
              {{ gettext('The client encryption key is required to restore encrypted backups.') }}
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-form>
      <template #foot>
        <q-btn v-close-popup no-caps flat :label="gettext('Cancel')" />
        <q-btn no-caps flat color="primary" :disable="!valid() || loading.save" :loading="loading.save"
          :label="gettext(isCreate ? 'Add' : 'Save')" @click="save" />
      </template>
    </UWindow>
  </q-dialog>
  <q-dialog v-model="encryptionKeyVisible" persistent>
    <q-card style="width: 560px; max-width: 90vw">
      <q-card-section>
        <div class="text-h6">{{ gettext('Important: Save your Encryption Key') }}</div>
        <div class="q-mt-sm">{{ gettext('This key is required to restore encrypted backups.') }}</div>
      </q-card-section>
      <q-card-section>
        <q-input :model-value="generatedEncryptionKey" type="textarea" readonly autogrow />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn no-caps flat :label="gettext('Copy Key')" @click="copyEncryptionKey" />
        <q-btn no-caps flat :label="gettext('Download')" @click="downloadEncryptionKey" />
        <q-btn no-caps flat :label="gettext('Print Key')" @click="printEncryptionKey" />
        <q-btn no-caps color="primary" :label="gettext('I have saved the key')" @click="encryptionKeyVisible = false" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.storage-editor :deep(.q-tab-panel) {
  min-height: 420px;
}

.storage-editor :deep(.q-field) {
  padding-bottom: 10px;
}
</style>
