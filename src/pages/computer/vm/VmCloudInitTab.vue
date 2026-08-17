<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, shallowRef, useTemplateRef, watch } from 'vue';
import { Dialog, Notify } from 'quasar';
import { getVmConfig, getVmPendingConfig, updateVmConfig } from '@/api/overview';
import { regenerateVmCloudInitImage } from '@/api/vm';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();

function optionIcon(key: string) {
  if (key === 'ciuser') return 'person';
  if (key === 'cipassword') return 'key';
  if (key === 'sshkeys') return 'vpn_key';
  if (key.startsWith('ipconfig')) return 'lan';
  if (key === 'nameserver') return 'dns';
  if (key === 'searchdomain') return 'travel_explore';
  if (key === 'ciupgrade') return 'archive';
  return 'settings';
}

const loading = shallowRef(false);
const pendingLoading = shallowRef(false);
const pendingRows = shallowRef<PveRecord[]>([]);
const PENDING_UPDATE_INTERVAL = 3000;
let pendingUpdateTimer: number | undefined;

const form = reactive({
  ciuser: '',
  cipassword: '',
  cipasswordHasValue: false,
  sshkeys: '',
  nameserver: '',
  searchdomain: '',
  ciupgrade: true,
});

const original = shallowRef<{
  ciuser: string;
  cipassword: boolean;
  sshkeys: string;
  nameserver: string;
  searchdomain: string;
  ciupgrade: boolean;
}>({
  ciuser: '',
  cipassword: false,
  sshkeys: '',
  nameserver: '',
  searchdomain: '',
  ciupgrade: true,
});

const ipconfigs = reactive<Record<string, string>>({});
const originalIpconfigs = shallowRef<Record<string, string>>({});

const sshKeyFileInput = useTemplateRef<HTMLInputElement>('sshKeyFileInput');
const canLoadSshKeyFile = typeof FileReader !== 'undefined';

function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

const IPV4SEG = '(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])';
const IPV4ADDR = `(?:${IPV4SEG}\\.){3}${IPV4SEG}`;
const IPV6_H16 = '[0-9a-fA-F]{1,4}';
const IPV6_LS32 = `(?:(?:${IPV6_H16}:${IPV6_H16})|${IPV4ADDR})`;
const IPV6ADDR =
  `(?:(?:${IPV6_H16}:){7}${IPV6_LS32})` +
  `|(?:(?:${IPV6_H16}:){1,7}:)` +
  `|(?:(?:${IPV6_H16}:){1,6}:${IPV6_H16})` +
  `|(?:(?:${IPV6_H16}:){1,5}(?::${IPV6_H16}){1,2})` +
  `|(?:(?:${IPV6_H16}:){1,4}(?::${IPV6_H16}){1,3})` +
  `|(?:(?:${IPV6_H16}:){1,3}(?::${IPV6_H16}){1,4})` +
  `|(?:(?:${IPV6_H16}:){1,2}(?::${IPV6_H16}){1,5})` +
  `|(?:${IPV6_H16}:(?::${IPV6_H16}){1,6})` +
  `|(?::(?::${IPV6_H16}){1,7}|:)` +
  `|(?:(?:${IPV6_H16}:){6}${IPV6_LS32})` +
  `|(?:(?:${IPV6_H16}:){1,5}:${IPV6_LS32})` +
  `|(?:(?:${IPV6_H16}:){1,4}:(?:${IPV6_H16}:){1}${IPV6_LS32})` +
  `|(?:(?:${IPV6_H16}:){1,3}:(?:${IPV6_H16}:){1,2}${IPV6_LS32})` +
  `|(?:(?:${IPV6_H16}:){1,2}:(?:${IPV6_H16}:){1,3}${IPV6_LS32})` +
  `|(?:${IPV6_H16}:(?:${IPV6_H16}:){1,4}${IPV6_LS32})` +
  `|(?::(?:${IPV6_H16}:){1,5}${IPV6_LS32})`;

const IPV4_RE = new RegExp(`^${IPV4ADDR}$`);
const IPV6_RE = new RegExp(`^(?:${IPV6ADDR})$`);
const IPV4CIDR_RE = new RegExp(`^${IPV4ADDR}\\/(?:3[0-2]|[12][0-9]|[89])$`);
const IPV6CIDR_RE = new RegExp(`^(?:${IPV6ADDR})\\/(?:12[0-8]|(?:1[01]|[2-9])[0-9]|[89])$`);

function isIpv4Address(value: string): boolean {
  return IPV4_RE.test(value);
}

function isIpv6Address(value: string): boolean {
  return IPV6_RE.test(value);
}

function isIpv4Cidr(value: string): boolean {
  return IPV4CIDR_RE.test(value);
}

function isIpv6Cidr(value: string): boolean {
  return IPV6CIDR_RE.test(value);
}

function verifyIp64Address(value: string): boolean {
  return isIpv4Address(value) || isIpv6Address(value);
}

function verifyIp64AddressWithSuffix(value: string): boolean {
  const parts = value.split('%');
  if (parts.length > 2) return false;
  const address = parts[0] || '';
  if (parts.length > 1) {
    if (!address.startsWith('fe80:')) return false;
  }
  return verifyIp64Address(address);
}

function normalizeNameserverList(value: string): string {
  return value
    .trim()
    .split(/[ ,;]+/)
    .filter(Boolean)
    .join(' ');
}

function isValidNameserverList(value: string): boolean {
  const entries = value.split(/[ ,;]+/).filter(Boolean);
  return entries.every((entry) => verifyIp64AddressWithSuffix(entry));
}

const IPV4_MODE_OPTIONS = [
  { value: 'none', label: gettext('No IPv4') },
  { value: 'static', label: gettext('Static') },
  { value: 'dhcp', label: gettext('DHCP') },
] as const;

const IPV6_MODE_OPTIONS = [
  { value: 'none', label: gettext('No IPv6') },
  { value: 'static', label: gettext('Static') },
  { value: 'dhcp', label: gettext('DHCPv6') },
  { value: 'auto', label: gettext('SLAAC') },
] as const;

type Ipv4Mode = (typeof IPV4_MODE_OPTIONS)[number]['value'];
type Ipv6Mode = (typeof IPV6_MODE_OPTIONS)[number]['value'];

type ParsedIpConfig = {
  ipv4Mode: Ipv4Mode;
  ipv4Cidr: string;
  ipv4Gateway: string;
  ipv6Mode: Ipv6Mode;
  ipv6Cidr: string;
  ipv6Gateway: string;
};

const DEFAULT_IPCONFIG: ParsedIpConfig = {
  ipv4Mode: 'none',
  ipv4Cidr: '',
  ipv4Gateway: '',
  ipv6Mode: 'none',
  ipv6Cidr: '',
  ipv6Gateway: '',
};

const ipconfigEditors = reactive<Record<string, ParsedIpConfig>>({});
const selectedIpConfigOriginal = shallowRef<ParsedIpConfig>({ ...DEFAULT_IPCONFIG });

const activeIpConfig = computed<ParsedIpConfig | undefined>(() => {
  const key = selectedOption.value;
  if (!key.startsWith('ipconfig')) return undefined;
  return ipconfigEditors[key];
});

function parseIpConfig(raw: string): ParsedIpConfig {
  const result: ParsedIpConfig = { ...DEFAULT_IPCONFIG };
  const properties: Record<string, string> = {};
  const parts = raw.split(',');
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq >= 0 ? part.substring(0, eq) : part;
    const value = eq >= 0 ? part.substring(eq + 1) : '1';
    properties[key] = value;
  }

  const ip = properties.ip || '';
  if (ip) {
    const lowerIp = ip.toLowerCase();
    if (lowerIp === 'dhcp' || lowerIp === 'dhcp4') {
      result.ipv4Mode = 'dhcp';
    } else if (isIpv4Cidr(ip)) {
      result.ipv4Mode = 'static';
      result.ipv4Cidr = ip;
    }
  }
  const gw = properties.gw || '';
  if (gw && isIpv4Address(gw)) {
    result.ipv4Gateway = gw;
  }

  const ip6 = properties.ip6 || '';
  if (ip6) {
    const lowerIp6 = ip6.toLowerCase();
    if (lowerIp6 === 'dhcp' || lowerIp6 === 'dhcp6') {
      result.ipv6Mode = 'dhcp';
    } else if (lowerIp6 === 'auto' || lowerIp6 === 'slaac') {
      result.ipv6Mode = 'auto';
    } else if (isIpv6Cidr(ip6)) {
      result.ipv6Mode = 'static';
      result.ipv6Cidr = ip6;
    }
  }
  const gw6 = properties.gw6 || '';
  if (gw6 && isIpv6Address(gw6)) {
    result.ipv6Gateway = gw6;
  }

  return result;
}

function printIpConfig(parsed: ParsedIpConfig): string {
  const segments: string[] = [];
  switch (parsed.ipv4Mode) {
    case 'dhcp':
      segments.push('ip=dhcp');
      break;
    case 'static':
      if (parsed.ipv4Cidr && isIpv4Cidr(parsed.ipv4Cidr)) {
        segments.push(`ip=${parsed.ipv4Cidr}`);
      }
      if (parsed.ipv4Gateway && isIpv4Address(parsed.ipv4Gateway)) {
        segments.push(`gw=${parsed.ipv4Gateway}`);
      }
      break;
  }
  switch (parsed.ipv6Mode) {
    case 'dhcp':
      segments.push('ip6=dhcp');
      break;
    case 'auto':
      segments.push('ip6=auto');
      break;
    case 'static':
      if (parsed.ipv6Cidr && isIpv6Cidr(parsed.ipv6Cidr)) {
        segments.push(`ip6=${parsed.ipv6Cidr}`);
      }
      if (parsed.ipv6Gateway && isIpv6Address(parsed.ipv6Gateway)) {
        segments.push(`gw6=${parsed.ipv6Gateway}`);
      }
      break;
  }
  return segments.join(',');
}

function selectedIpConfigPrinted(): string {
  const editor = ipconfigEditors[selectedOption.value];
  if (!editor) return '';
  return printIpConfig(editor);
}

function selectedIpConfigIsDirty(): boolean {
  const printed = selectedIpConfigPrinted();
  const originalValue = originalIpconfigs.value[selectedOption.value] || '';
  return printed !== originalValue;
}

type ParsedSshKey = { options?: string; type: string; key: string; comment?: string };

function parseSshKey(value: string): ParsedSshKey | null {
  const keyMatch = /^(?:((?:[^\s"]|"(?:\\.|[^"\\])*")+)\s+)?(\S+)\s+(\S+)(?:\s+(.*))?$/.exec(value);
  const typePattern =
    /^(?:(?:sk-)?(?:ssh-(?:dss|rsa|ed25519)|ecdsa-sha2-nistp\d+)(?:@(?:[a-z0-9_-]+\.)+[a-z]{2,})?)$/;
  if (!keyMatch || !keyMatch[2]) return null;
  if (keyMatch[1] && typePattern.test(keyMatch[1])) {
    return {
      type: keyMatch[1],
      key: keyMatch[2],
      ...(keyMatch[3] ? { comment: keyMatch[3] } : {}),
    };
  }
  if (typePattern.test(keyMatch[2]) && keyMatch[3]) {
    return {
      ...(keyMatch[1] ? { options: keyMatch[1] } : {}),
      type: keyMatch[2],
      key: keyMatch[3],
      ...(keyMatch[4] ? { comment: keyMatch[4] } : {}),
    };
  }
  return null;
}

const sshKeyDisplayRows = computed(() =>
  form.sshkeys
    .split('\n')
    .filter(Boolean)
    .map((value, index) => {
      const key = parseSshKey(value);
      return {
        id: `${index}-${value}`,
        value: key ? key.comment || '' : value,
        hasOptions: Boolean(key?.options),
      };
    })
);

function openSshKeyFileInput() {
  sshKeyFileInput.value?.click();
}

function readSshKeyFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () =>
      reject(reader.error ? reader.error : new Error('Failed to read SSH key file'));
    reader.readAsText(file);
  });
}

async function appendSshKeyFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  for (const file of files) {
    if (file.size > 8192) {
      Notify.create({
        type: 'negative',
        message: `${gettext('Invalid file size')}: ${file.size} > 8192`,
      });
      continue;
    }
    try {
      form.sshkeys += await readSshKeyFile(file);
    } catch {
      Notify.create({ type: 'negative', message: gettext('Unable to read SSH key file') });
    }
  }
}

const pendingByKey = computed<Record<string, PveRecord>>(() =>
  Object.fromEntries(pendingRows.value.map((row) => [textValue(row.key), row]))
);

function hasPendingChange(key: string): boolean {
  const pending = pendingByKey.value[key];
  if (!pending) return false;
  if (pending.delete) return true;
  const nextValue = textValue(pending.pending);
  return nextValue !== textValue(props.config[key]);
}

function isPendingDelete(key: string): boolean {
  return Boolean(pendingByKey.value[key]?.delete);
}

function currentConfig(key: string): string {
  return textValue(props.config[key]);
}

function currentConfigHas(key: string): boolean {
  const current = props.config[key];
  return current !== undefined && current !== null && current !== '';
}

function pendingConfig(key: string): string {
  const pending = pendingByKey.value[key];
  if (!pending) return '';
  if (pending.delete) return '';
  return textValue(pending.pending);
}

const networkIndexes = computed(() => {
  const indexes = new Set<number>();
  Object.keys(props.config).forEach((key) => {
    const match = key.match(/^net(\d+)$/);
    if (match) indexes.add(Number(match[1]));
  });
  pendingRows.value.forEach((row) => {
    const key = textValue(row.key);
    const match = key.match(/^net(\d+)$/);
    if (match) indexes.add(Number(match[1]));
    const ipMatch = key.match(/^ipconfig(\d+)$/);
    if (ipMatch) indexes.add(Number(ipMatch[1]));
  });
  return [...indexes].sort((left, right) => left - right);
});

const canConfigureCloudInit = computed(() => {
  const caps = (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {};
  return Boolean(caps['VM.Config.Cloudinit'] || caps['VM.Config.Network']);
});

const cloudInitDriveRegex = computed(() => new RegExp(`vm-${props.vmid}-cloudinit`));

const hasCloudInitDrive = computed(() => {
  const checks: Array<[string, unknown]> = Object.entries(props.config);
  pendingRows.value.forEach((row) => {
    const key = textValue(row.key);
    if (/^(ide|scsi|sata)\d+$/.test(key) && row.pending !== undefined && !row.delete) {
      checks.push([key, row.pending]);
    }
  });
  return checks.some(
    ([key, value]) =>
      /^(ide|scsi|sata)\d+$/.test(key) && cloudInitDriveRegex.value.test(String(value))
  );
});

const canRegenerateImage = computed(
  () =>
    Boolean(
      (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Cloudinit']
    ) && hasCloudInitDrive.value
);

function hasFormChanges(): boolean {
  if (form.ciuser !== original.value.ciuser) return true;
  if (form.cipasswordHasValue !== original.value.cipassword) {
    if (original.value.cipassword === true && form.cipasswordHasValue === false) return true;
    if (form.cipassword) return true;
  }
  if (original.value.cipassword === false && form.cipassword) return true;
  if (form.sshkeys !== original.value.sshkeys) return true;
  if (form.nameserver !== original.value.nameserver) return true;
  if (form.searchdomain !== original.value.searchdomain) return true;
  if (form.ciupgrade !== original.value.ciupgrade) return true;
  return false;
}

function hasIpconfigChanges(): boolean {
  if (selectedOption.value.startsWith('ipconfig')) {
    if (selectedIpConfigIsDirty()) return true;
  }
  for (const key of Object.keys(ipconfigs)) {
    if (key === selectedOption.value) continue;
    if (ipconfigs[key] !== originalIpconfigs.value[key]) return true;
  }
  return false;
}

const canSave = computed(
  () =>
    hasCloudInitDrive.value &&
    canConfigureCloudInit.value &&
    (hasFormChanges() || hasIpconfigChanges())
);

const selectedOption = shallowRef('ciuser');

function rowDisplayValue(key: string): string {
  const current = currentConfig(key);
  return current || '-';
}

function rowHasPassword(): boolean {
  return (
    props.config.cipassword !== undefined &&
    props.config.cipassword !== null &&
    props.config.cipassword !== ''
  );
}

function rowPendingValueDisplay(key: string): string {
  const pending = pendingByKey.value[key];
  if (!pending) return '';
  if (key === 'cipassword') {
    if (pending.delete) return gettext('Deleted');
    return '********';
  }
  if (pending.delete) return gettext('Deleted');
  if (key === 'ciupgrade')
    return textValue(pending.pending) === '0' ? gettext('No') : gettext('Yes');
  return textValue(pending.pending);
}

const cloudInitRows = computed(() => [
  {
    key: 'ciuser',
    label: gettext('User'),
    value: rowDisplayValue('ciuser'),
    pending: hasPendingChange('ciuser'),
    pendingDelete: isPendingDelete('ciuser'),
    pendingValue: rowPendingValueDisplay('ciuser'),
  },
  {
    key: 'cipassword',
    label: gettext('Password'),
    value: rowHasPassword() ? '********' : '-',
    pending: hasPendingChange('cipassword'),
    pendingDelete: isPendingDelete('cipassword'),
    pendingValue: rowPendingValueDisplay('cipassword'),
  },
  {
    key: 'sshkeys',
    label: gettext('SSH public key'),
    value: '',
    pending: hasPendingChange('sshkeys'),
    pendingDelete: isPendingDelete('sshkeys'),
    pendingValue: rowPendingValueDisplay('sshkeys'),
  },
  ...networkIndexes.value.map((index) => {
    const key = `ipconfig${index}`;
    const current = currentConfig(key);
    return {
      key,
      label: `${gettext('IP Config')} (net${index})`,
      value: current || '-',
      pending: hasPendingChange(key),
      pendingDelete: isPendingDelete(key),
      pendingValue: rowPendingValueDisplay(key),
    };
  }),
  {
    key: 'nameserver',
    label: gettext('DNS Server'),
    value: rowDisplayValue('nameserver'),
    pending: hasPendingChange('nameserver'),
    pendingDelete: isPendingDelete('nameserver'),
    pendingValue: rowPendingValueDisplay('nameserver'),
  },
  {
    key: 'searchdomain',
    label: gettext('DNS Search Domain'),
    value: rowDisplayValue('searchdomain'),
    pending: hasPendingChange('searchdomain'),
    pendingDelete: isPendingDelete('searchdomain'),
    pendingValue: rowPendingValueDisplay('searchdomain'),
  },
  {
    key: 'ciupgrade',
    label: gettext('Upgrade packages'),
    value: textValue(props.config.ciupgrade) === '0' ? gettext('No') : gettext('Yes'),
    pending: hasPendingChange('ciupgrade'),
    pendingDelete: isPendingDelete('ciupgrade'),
    pendingValue: rowPendingValueDisplay('ciupgrade'),
  },
]);

const selectedOptionLabel = computed(
  () =>
    cloudInitRows.value.find((row) => row.key === selectedOption.value)?.label ||
    selectedOption.value
);

const canRemoveSelected = computed(() => {
  if (!hasCloudInitDrive.value || !canConfigureCloudInit.value) return false;
  if (['ciuser', 'searchdomain', 'nameserver', 'sshkeys'].includes(selectedOption.value))
    return false;
  if (selectedOption.value === 'cipassword') return rowHasPassword();
  return selectedOption.value === 'ciupgrade' || selectedOption.value.startsWith('ipconfig');
});

function decodeSshKeys(value: unknown) {
  const text = textValue(value);
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function syncEditorFromConfig() {
  const hasPassword =
    props.config.cipassword !== undefined &&
    props.config.cipassword !== null &&
    props.config.cipassword !== '';
  const pendingCiupgrade = pendingByKey.value.ciupgrade;
  const ciupgradeCurrent =
    pendingCiupgrade && !pendingCiupgrade.delete
      ? textValue(pendingCiupgrade.pending)
      : textValue(props.config.ciupgrade);
  const sshKeyCurrent = decodeSshKeys(currentConfigHas('sshkeys') ? props.config.sshkeys : '');
  const sshKeyEffective = isPendingDelete('sshkeys')
    ? ''
    : pendingByKey.value.sshkeys && !pendingByKey.value.sshkeys.delete
      ? decodeSshKeys(pendingByKey.value.sshkeys.pending)
      : sshKeyCurrent;

  const next = {
    ciuser: isPendingDelete('ciuser') ? '' : pendingConfig('ciuser') || currentConfig('ciuser'),
    sshkeys: sshKeyEffective,
    nameserver: isPendingDelete('nameserver')
      ? ''
      : pendingConfig('nameserver') || currentConfig('nameserver'),
    searchdomain: isPendingDelete('searchdomain')
      ? ''
      : pendingConfig('searchdomain') || currentConfig('searchdomain'),
    ciupgrade: ciupgradeCurrent === '0' ? false : true,
  };

  form.ciuser = next.ciuser;
  form.cipassword = '';
  form.cipasswordHasValue = isPendingDelete('cipassword') ? false : hasPassword;
  form.sshkeys = next.sshkeys;
  form.nameserver = next.nameserver;
  form.searchdomain = next.searchdomain;
  form.ciupgrade = next.ciupgrade;

  original.value = {
    ciuser: next.ciuser,
    cipassword: isPendingDelete('cipassword') ? false : hasPassword,
    sshkeys: next.sshkeys,
    nameserver: next.nameserver,
    searchdomain: next.searchdomain,
    ciupgrade: next.ciupgrade,
  };

  const nextIpconfigs: Record<string, string> = {};
  networkIndexes.value.forEach((index) => {
    const key = `ipconfig${index}`;
    nextIpconfigs[key] = isPendingDelete(key) ? '' : pendingConfig(key) || currentConfig(key);
  });

  Object.keys(ipconfigs).forEach((key) => delete ipconfigs[key]);
  Object.assign(ipconfigs, nextIpconfigs);
  originalIpconfigs.value = { ...nextIpconfigs };

  Object.keys(ipconfigEditors).forEach((key) => delete ipconfigEditors[key]);
  Object.entries(nextIpconfigs).forEach(([key, value]) => {
    ipconfigEditors[key] = parseIpConfig(value);
  });
}

async function loadPendingForDisplay() {
  pendingLoading.value = true;
  try {
    const response = await getVmPendingConfig(props.node, props.vmid, 'qemu');
    pendingRows.value = response.data || [];
  } catch (error) {
    void error;
  } finally {
    pendingLoading.value = false;
  }
}

async function loadPendingAndSyncEditor() {
  await loadPendingForDisplay();
  syncEditorFromConfig();
}

function startPendingUpdates() {
  stopPendingUpdates();
  pendingUpdateTimer = window.setInterval(() => {
    void loadPendingForDisplay();
  }, PENDING_UPDATE_INTERVAL);
}

function stopPendingUpdates() {
  if (pendingUpdateTimer !== undefined) {
    window.clearInterval(pendingUpdateTimer);
    pendingUpdateTimer = undefined;
  }
}

onBeforeUnmount(() => stopPendingUpdates());

async function removeSelected() {
  if (!canRemoveSelected.value) return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      delete: selectedOption.value,
    });
    emit('updated');
    await loadPendingAndSyncEditor();
  } catch (error) {
    void error;
  } finally {
    loading.value = false;
  }
}

function confirmRemoveSelected() {
  if (!canRemoveSelected.value) return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure you want to remove entry {0}').replace(
      '{0}',
      `'${selectedOptionLabel.value}'`
    ),
    cancel: true,
    persistent: true,
  }).onOk(() => void removeSelected());
}

async function fetchLatestConfigAndDigest(): Promise<PveRecord | null> {
  try {
    const response = await getVmConfig(props.node, props.vmid, 'qemu');
    return response.data || null;
  } catch {
    Notify.create({
      type: 'negative',
      message: gettext('Unable to load the current VM configuration'),
    });
    return null;
  }
}

function flushSelectedIpConfigToStore() {
  if (!selectedOption.value.startsWith('ipconfig')) return;
  const key = selectedOption.value;
  const printed = selectedIpConfigPrinted();
  ipconfigs[key] = printed;
}

async function save() {
  if (!canConfigureCloudInit.value || !canSave.value) return;
  flushSelectedIpConfigToStore();

  const latest = await fetchLatestConfigAndDigest();
  if (!latest) return;

  const data: PveRecord = { digest: latest.digest };
  const deletedKeys: string[] = [];

  const originalHasPassword = original.value.cipassword;

  if (form.ciuser !== original.value.ciuser) {
    if (form.ciuser.trim()) data.ciuser = form.ciuser.trim();
    else deletedKeys.push('ciuser');
  }

  if (form.cipasswordHasValue !== originalHasPassword || form.cipassword !== '') {
    if (form.cipassword) {
      data.cipassword = form.cipassword;
    } else if (originalHasPassword && !form.cipasswordHasValue) {
      deletedKeys.push('cipassword');
    }
  }

  if (form.sshkeys !== original.value.sshkeys) {
    if (String(form.sshkeys).trim()) data.sshkeys = encodeURIComponent(String(form.sshkeys).trim());
    else deletedKeys.push('sshkeys');
  }

  if (form.nameserver !== original.value.nameserver) {
    const nameservers = normalizeNameserverList(String(form.nameserver));
    if (nameservers) data.nameserver = nameservers;
    else deletedKeys.push('nameserver');
  }

  if (form.searchdomain !== original.value.searchdomain) {
    if (form.searchdomain.trim()) data.searchdomain = form.searchdomain.trim();
    else deletedKeys.push('searchdomain');
  }

  if (form.ciupgrade !== original.value.ciupgrade) {
    data.ciupgrade = form.ciupgrade ? 1 : 0;
  }

  Object.entries(ipconfigs).forEach(([key, value]) => {
    if (value === originalIpconfigs.value[key]) return;
    if (value.trim()) data[key] = value.trim();
    else deletedKeys.push(key);
  });

  if (deletedKeys.length) data.delete = deletedKeys.join(',');

  if (Object.keys(data).length === 1) return;

  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data);
    emit('updated');
    await loadPendingAndSyncEditor();
  } catch (error) {
    void error;
  } finally {
    loading.value = false;
  }
}

async function regenerateImage() {
  if (!canRegenerateImage.value) return;
  loading.value = true;
  try {
    await regenerateVmCloudInitImage(props.node, props.vmid);
    emit('updated');
    await loadPendingAndSyncEditor();
  } catch (error) {
    void error;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.node, props.vmid, textValue(props.config.digest)],
  () => {
    void loadPendingAndSyncEditor();
    startPendingUpdates();
  },
  { immediate: true }
);

watch(
  () => selectedOption.value,
  (nextKey, prevKey) => {
    if (prevKey && prevKey.startsWith('ipconfig')) {
      ipconfigs[prevKey] = printIpConfig(ipconfigEditors[prevKey] || DEFAULT_IPCONFIG);
    }
    if (nextKey && nextKey.startsWith('ipconfig')) {
      if (!ipconfigEditors[nextKey]) {
        ipconfigEditors[nextKey] = parseIpConfig(ipconfigs[nextKey] || '');
      }
      selectedIpConfigOriginal.value = { ...ipconfigEditors[nextKey] };
    }
  },
  { immediate: true }
);
</script>
<template>
  <q-form
    class="vm-config-legacy vm-cloud-init-tab u-hidden-error"
    @submit.prevent="save"
  >
    <div class="row q-gutter-sm q-py-sm options-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRemoveSelected ? 'primary' : 'grey'"
        :disable="!canRemoveSelected"
        :loading="loading"
        :label="gettext('Remove')"
        @click="confirmRemoveSelected"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRegenerateImage ? 'primary' : 'grey'"
        :disable="!canRegenerateImage"
        :loading="loading"
        :label="gettext('Regenerate Image')"
        @click="regenerateImage"
      />
    </div>
    <div class="row">
      <div class="col-7 options-list-column">
        <div class="u-border q-pa-sm options-scroll options-list-panel">
          <div
            v-for="row in cloudInitRows"
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
              <template v-if="row.key === 'sshkeys'">
                <template v-if="sshKeyDisplayRows.length">
                  <div
                    v-for="entry in sshKeyDisplayRows"
                    :key="entry.id"
                  >
                    {{ entry.value }}
                    <span
                      v-if="entry.hasOptions"
                      class="ssh-key-options"
                    >
                      ({{ gettext('with options') }})
                    </span>
                  </div>
                </template>
                <template v-else>-</template>
              </template>
              <template v-else>
                <div class="row items-center q-gutter-xs no-wrap">
                  <span class="col">
                    {{ row.value }}
                  </span>
                  <q-badge
                    v-if="row.pending"
                    outline
                    color="orange"
                    text-color="orange"
                    class="pending-badge"
                    label="Pending"
                  />
                </div>
                <div
                  v-if="row.pending && row.pendingValue"
                  class="pending-value text-orange-9 text-sm"
                >
                  {{ gettext('Next value') }}: {{ row.pendingValue }}
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div class="col-5 options-editor-column">
        <div class="u-border q-pa-sm u-hidden-error options-scroll options-editor">
          <div class="q-pa-sm">
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">
                {{ cloudInitRows.find((row) => row.key === selectedOption)?.label }}
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
            <div class="row q-col-gutter-lg">
              <div
                v-show="selectedOption === 'ciuser'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.ciuser"
                  dense
                  :label="gettext('User')"
                />
              </div>
              <div
                v-show="selectedOption === 'cipassword'"
                class="col-12"
              >
                <div class="row q-col-gutter-lg">
                  <div class="col-12 col-md-6">
                    <q-input
                      v-model="form.cipassword"
                      dense
                      type="password"
                      :label="gettext('Password')"
                      :hint="
                        form.cipasswordHasValue
                          ? gettext(
                              'Leave empty and check remove below to delete existing password'
                            )
                          : gettext('Enter a new password or leave empty to keep unchanged')
                      "
                    />
                  </div>
                  <div
                    v-if="form.cipasswordHasValue"
                    class="col-12 col-md-6 row items-center"
                  >
                    <q-checkbox
                      v-model="form.cipasswordHasValue"
                      color="primary"
                      :label="gettext('Password is set')"
                    />
                    <q-tooltip>
                      {{
                        gettext('Uncheck to delete the existing password when saving (deleteEmpty)')
                      }}
                    </q-tooltip>
                  </div>
                </div>
              </div>
              <div
                v-show="selectedOption === 'sshkeys'"
                class="col-12"
              >
                <q-input
                  v-model="form.sshkeys"
                  dense
                  type="textarea"
                  autogrow
                  :label="gettext('SSH public key')"
                />
                <input
                  v-if="canLoadSshKeyFile"
                  ref="sshKeyFileInput"
                  class="hidden"
                  type="file"
                  multiple
                  @change="appendSshKeyFiles"
                />
                <q-btn
                  v-if="canLoadSshKeyFile"
                  no-caps
                  outline
                  type="button"
                  size="12px"
                  color="primary"
                  class="u-button q-mt-sm"
                  :label="gettext('Load SSH Key File')"
                  @click="openSshKeyFileInput"
                />
              </div>
              <template v-if="activeIpConfig">
                <div class="col-12">
                  <div class="row q-col-gutter-lg q-gutter-y-sm">
                    <div class="col-12 col-md-6">
                      <div class="q-mb-sm text-grey-10 text-sm font-semibold">
                        {{ gettext('IPv4') }}
                      </div>
                      <q-select
                        v-model="activeIpConfig.ipv4Mode"
                        dense
                        :options="IPV4_MODE_OPTIONS"
                        emit-value
                        map-options
                        :label="gettext('IPv4 mode')"
                      />
                      <q-input
                        v-if="activeIpConfig.ipv4Mode === 'static'"
                        v-model="activeIpConfig.ipv4Cidr"
                        dense
                        class="q-mt-sm"
                        :label="gettext('IPv4/CIDR')"
                        :rules="[
                          (value) =>
                            isIpv4Cidr(value) ||
                            gettext('Enter a valid IPv4 CIDR (e.g. 192.168.1.10/24)'),
                        ]"
                      />
                      <q-input
                        v-if="activeIpConfig.ipv4Mode === 'static'"
                        v-model="activeIpConfig.ipv4Gateway"
                        dense
                        class="q-mt-sm"
                        :label="gettext('Gateway IPv4')"
                        :rules="[
                          (value) =>
                            !value || isIpv4Address(value) || gettext('Enter a valid IPv4 gateway'),
                        ]"
                      />
                    </div>
                    <div class="col-12 col-md-6">
                      <div class="q-mb-sm text-grey-10 text-sm font-semibold">
                        {{ gettext('IPv6') }}
                      </div>
                      <q-select
                        v-model="activeIpConfig.ipv6Mode"
                        dense
                        :options="IPV6_MODE_OPTIONS"
                        emit-value
                        map-options
                        :label="gettext('IPv6 mode')"
                      />
                      <q-input
                        v-if="activeIpConfig.ipv6Mode === 'static'"
                        v-model="activeIpConfig.ipv6Cidr"
                        dense
                        class="q-mt-sm"
                        :label="gettext('IPv6/CIDR')"
                        :rules="[
                          (value) =>
                            isIpv6Cidr(value) ||
                            gettext('Enter a valid IPv6 CIDR (e.g. 2001:db8::1/64)'),
                        ]"
                      />
                      <q-input
                        v-if="activeIpConfig.ipv6Mode === 'static'"
                        v-model="activeIpConfig.ipv6Gateway"
                        dense
                        class="q-mt-sm"
                        :label="gettext('Gateway IPv6')"
                        :rules="[
                          (value) =>
                            !value || isIpv6Address(value) || gettext('Enter a valid IPv6 gateway'),
                        ]"
                      />
                    </div>
                    <div class="col-12">
                      <div class="q-pa-xs text-grey-8 text-sm bg-grey-1 rounded q-mt-xs">
                        <div class="raw-ipconfig-label text-grey-10 mb-1">
                          {{ gettext('Raw ipconfig value') }}:
                        </div>
                        <code class="text-sm">{{ selectedIpConfigPrinted() || '—' }}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <div
                v-show="selectedOption === 'nameserver'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.nameserver"
                  dense
                  :label="gettext('DNS Server')"
                  :hint="gettext('Space/comma/semicolon separated list of IPv4 or IPv6 addresses')"
                  :rules="[
                    (value) =>
                      isValidNameserverList(value) ||
                      gettext('Enter a valid IPv4 or IPv6 address list'),
                  ]"
                />
              </div>
              <div
                v-show="selectedOption === 'searchdomain'"
                class="col-12 col-md-6"
              >
                <q-input
                  v-model="form.searchdomain"
                  dense
                  :label="gettext('DNS Search Domain')"
                />
              </div>
              <div
                v-show="selectedOption === 'ciupgrade'"
                class="col-12"
              >
                <q-checkbox
                  v-model="form.ciupgrade"
                  dense
                  color="primary"
                  :label="gettext('Upgrade packages')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <q-inner-loading
      :showing="!hasCloudInitDrive && !pendingLoading"
      class="cloud-init-drive-mask"
    >
      <div class="cloud-init-drive-mask__content row items-center no-wrap">
        <q-icon
          name="cloud_off"
          size="22px"
          class="q-mr-sm"
        />
        <span>{{ gettext('No CloudInit Drive found') }}</span>
      </div>
    </q-inner-loading>
  </q-form>
</template>

<style scoped lang="scss">
.vm-config-legacy {
  padding: 8px;
  font-size: 13px;
}
.vm-cloud-init-tab {
  position: relative;
  min-height: 160px;
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
  overflow: hidden;
}
.options-editor-column {
  display: flex;
  overflow: hidden;
  background: #fff;
}
.options-list-panel {
  border-right: 0;
}
.options-editor {
  flex: 1;
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
.ssh-key-options {
  color: #6b7280;
}
.pending-badge {
  flex-shrink: 0;
  line-height: 14px;
  font-size: 11px;
  padding: 1px 6px;
}
.pending-value {
  margin-top: 4px;
  line-height: 16px;
  font-size: 12px;
  word-break: break-all;
  white-space: normal;
}
.raw-ipconfig-label {
  font-size: 12px;
  line-height: 16px;
  color: #6b7280;
}
.cloud-init-drive-mask {
  background: rgba(241, 245, 249, 0.8);
  backdrop-filter: blur(1px);
}
.cloud-init-drive-mask__content {
  padding: 12px 18px;
  color: #52606d;
  font-size: 13px;
  font-weight: 500;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(51, 65, 85, 0.14);
}
@media (prefers-reduced-motion: reduce) {
  .options-list-row {
    transition: none;
  }
}
</style>
