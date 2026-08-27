import { gettext } from '@/locale';

export function timestampToTime(value?: number | string) {
  const numeric = Number(value);
  if (!numeric) return '-';
  const date = new Date(numeric);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function textValue(value: unknown, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  return fallback;
}

export function formatBytes(value?: number | string) {
  const numeric = Number(value);
  if (!numeric) return '0B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)}${units[unitIndex]}`;
}

export function formatStorageType(type?: unknown, monhost?: unknown, statusView = false) {
  const value = textValue(type);
  const labels: Record<string, string> = {
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
  };
  const label = labels[value] || value;
  return !statusView && (value === 'rbd' || value === 'cephfs') && !textValue(monhost)
    ? `${label} (PVE)`
    : label || '-';
}

export function formatStorageContent(value?: unknown) {
  const volid = textValue(value);
  if (!volid) return '-';
  const separator = volid.indexOf(':');
  return separator >= 0 ? volid.slice(separator + 1) : volid;
}

export function formatContentSize(row: Record<string, unknown>) {
  if (row.size !== undefined && row.size !== null && row.size !== '')
    return formatBytes(row.size as number);
  if (row['approximate-size'] !== undefined && row['approximate-size'] !== null) {
    return `~${formatBytes(row['approximate-size'] as number)}`;
  }
  return gettext('unknown');
}

export function formatContentDate(row: Record<string, unknown>) {
  if (textValue(row.content) === 'backup') {
    const volid = textValue(row.volid);
    const match = volid.match(/(\d{4})_(\d{2})_(\d{2})-(\d{2})_(\d{2})_(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
  }
  return row.ctime ? timestampToTime(Number(row.ctime) * 1000) : '-';
}

export function usedPercent(used?: number | string, total?: number | string) {
  const usedNumber = Number(used);
  const totalNumber = Number(total);
  if (!usedNumber || !totalNumber) return 0;
  return Math.min(100, Math.max(0, (usedNumber / totalNumber) * 100));
}

const contentLabels: Record<string, string> = {
  iso: 'ISO Image',
  images: 'Disk Image',
  vztmpl: 'CT Templates',
  backup: 'Backup File',
  rootdir: 'Container',
  snippets: 'Snippets',
  import: 'Import',
};

export function formatContent(content?: unknown) {
  const values = Array.isArray(content) ? content : textValue(content).split(',');
  return values
    .map((item) => textValue(item).trim())
    .filter(Boolean)
    .map((item) => gettext(contentLabels[item] || item))
    .join(' / ');
}

export function objectToText(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .map(([key, item]) => `${key}=${String(item)}`)
    .join(',');
}

type TaskDescription = [subject: string, action: string];

// Mirrors Proxmox.Utils.format_task_description for the task types exposed by
// the cluster task API. Keep the raw type/id as the fallback for new types.
const taskDescriptions: Record<string, TaskDescription> = {
  acmedeactivate: ['ACME Account', gettext('Deactivate')],
  acmenewcert: ['SRV', gettext('Order Certificate')],
  acmerefresh: ['ACME Account', gettext('Refresh')],
  acmeregister: ['ACME Account', gettext('Register')],
  acmerenew: ['SRV', gettext('Renew Certificate')],
  acmerevoke: ['SRV', gettext('Revoke Certificate')],
  acmeupdate: ['ACME Account', gettext('Update')],
  'auth-realm-sync': [gettext('Realm'), gettext('Sync')],
  'auth-realm-sync-test': [gettext('Realm'), gettext('Sync Preview')],
  'bulk-migrate': ['', gettext('Bulk migrate VMs and Containers')],
  'bulk-shutdown': ['', gettext('Bulk shutdown VMs and Containers')],
  'bulk-start': ['', gettext('Bulk start VMs and Containers')],
  'bulk-suspend': ['', gettext('Bulk shutdown VMs and Containers')],
  cephcreatemds: ['Ceph Metadata Server', gettext('Create')],
  cephcreatemgr: ['Ceph Manager', gettext('Create')],
  cephcreatemon: ['Ceph Monitor', gettext('Create')],
  cephcreateosd: ['Ceph OSD', gettext('Create')],
  cephcreatepool: ['Ceph Pool', gettext('Create')],
  cephdestroymds: ['Ceph Metadata Server', gettext('Destroy')],
  cephdestroymgr: ['Ceph Manager', gettext('Destroy')],
  cephdestroymon: ['Ceph Monitor', gettext('Destroy')],
  cephdestroyosd: ['Ceph OSD', gettext('Destroy')],
  cephdestroyfs: ['CephFS', gettext('Destroy')],
  cephdestroypool: ['Ceph Pool', gettext('Destroy')],
  cephfscreate: ['CephFS', gettext('Create')],
  cephsetflags: ['', gettext('Change global Ceph flags')],
  cephsetpool: ['Ceph Pool', gettext('Edit')],
  clustercreate: ['', gettext('Create Cluster')],
  clusterjoin: ['', gettext('Join Cluster')],
  dircreate: [gettext('Directory Storage'), gettext('Create')],
  dirremove: [gettext('Directory'), gettext('Remove')],
  download: [gettext('File'), gettext('Download')],
  hamigrate: ['HA', gettext('Migrate')],
  hashutdown: ['HA', gettext('Shutdown')],
  hastart: ['HA', gettext('Start')],
  hastop: ['HA', gettext('Stop')],
  imgcopy: ['', gettext('Copy data')],
  imgdel: ['', gettext('Erase data')],
  lvmcreate: [gettext('LVM Storage'), gettext('Create')],
  lvmremove: ['Volume Group', gettext('Remove')],
  lvmthincreate: ['LVM-Thin Storage', gettext('Create')],
  lvmthinremove: ['Thinpool', gettext('Remove')],
  migrateall: ['', gettext('Bulk migrate VMs and Containers')],
  move_volume: ['CT', gettext('Move Volume')],
  'pbs-download': ['VM/CT', gettext('File Restore Download')],
  pull_file: ['CT', gettext('Pull file')],
  push_file: ['CT', gettext('Push file')],
  qmclone: ['VM', gettext('Clone')],
  qmconfig: ['VM', gettext('Configure')],
  qmcreate: ['VM', gettext('Create')],
  qmdelsnapshot: ['VM', gettext('Delete Snapshot')],
  qmdestroy: ['VM', gettext('Destroy')],
  qmigrate: ['VM', gettext('Migrate')],
  qmmove: ['VM', gettext('Move disk')],
  qmpause: ['VM', gettext('Pause')],
  qmreboot: ['VM', gettext('Reboot')],
  qmreset: ['VM', gettext('Reset')],
  qmrestore: ['VM', gettext('Restore')],
  qmresume: ['VM', gettext('Resume')],
  qmrollback: ['VM', gettext('Rollback')],
  qmshutdown: ['VM', gettext('Shutdown')],
  qmsnapshot: ['VM', gettext('Snapshot')],
  qmstart: ['VM', gettext('Start')],
  qmstop: ['VM', gettext('Stop')],
  qmsuspend: ['VM', gettext('Hibernate')],
  qmtemplate: ['VM', gettext('Convert to template')],
  reloadnetworkall: ['', gettext('Reload network configuration on all nodes')],
  resize: ['VM/CT', gettext('Resize')],
  spiceproxy: ['VM/CT', `${gettext('Console')} (Spice)`],
  spiceshell: ['', `${gettext('Shell')} (Spice)`],
  srvreload: ['', gettext('Reload')],
  srvrestart: ['', gettext('Restart')],
  srvstart: ['', gettext('Start')],
  srvstop: ['', gettext('Stop')],
  startall: ['', gettext('Bulk start VMs and Containers')],
  stopall: ['', gettext('Bulk shutdown VMs and Containers')],
  suspendall: ['', gettext('Suspend all VMs')],
  termproxy: ['', `${gettext('Console')} (xterm.js)`],
  unknownimgdel: ['', gettext('Destroy image from unknown guest')],
  vncproxy: ['VM/CT', gettext('Console')],
  vncshell: ['', gettext('Shell')],
  vzclone: ['CT', gettext('Clone')],
  vzcreate: ['CT', gettext('Create')],
  vzdelsnapshot: ['CT', gettext('Delete Snapshot')],
  vzdestroy: ['CT', gettext('Destroy')],
  vzmigrate: ['CT', gettext('Migrate')],
  vzmount: ['CT', gettext('Mount')],
  vzreboot: ['CT', gettext('Reboot')],
  vzrestore: ['CT', gettext('Restore')],
  vzresume: ['CT', gettext('Resume')],
  vzrollback: ['CT', gettext('Rollback')],
  vzshutdown: ['CT', gettext('Shutdown')],
  vzsnapshot: ['CT', gettext('Snapshot')],
  vzstart: ['CT', gettext('Start')],
  vzstop: ['CT', gettext('Stop')],
  vzsuspend: ['CT', gettext('Suspend')],
  vztemplate: ['CT', gettext('Convert to template')],
  vzumount: ['CT', gettext('Unmount')],
  wipedisk: ['Device', gettext('Wipe Disk')],
  zfscreate: [gettext('ZFS Storage'), gettext('Create')],
  zfsremove: ['ZFS Pool', gettext('Remove')],
};

export function formatTaskDescription(type?: unknown, id?: unknown) {
  const typeText = textValue(type);
  const idText = textValue(id);
  if (typeText === 'vzdump')
    return idText ? `VM/CT ${idText} - ${gettext('Backup')}` : gettext('Backup Job');
  const description = taskDescriptions[typeText];
  if (description) {
    const [subject, action] = description;
    return subject ? `${subject}${idText ? ` ${idText}` : ''} - ${action}` : action;
  }
  return [typeText, idText].filter(Boolean).join(' ') || '-';
}

export function formatTaskStatus(status?: unknown) {
  const value = textValue(status);
  if (value === 'unknown') return gettext('unknown');
  if (value.startsWith('WARNINGS:')) return value.replace('WARNINGS', gettext('Warnings'));
  if (value && value !== 'OK') return `${gettext('Error')}: ${value}`;
  return value || '-';
}

export function taskStatusColor(status?: unknown) {
  const value = textValue(status);
  if (value === 'OK') return 'text-positive';
  if (value === 'unknown') return 'text-grey';
  if (value.startsWith('WARNINGS:')) return 'text-warning';
  return 'text-negative';
}

export const severityMap: Record<number, string> = {
  0: 'Panic',
  1: 'Alert',
  2: 'Critical',
  3: 'Error',
  4: 'Warning',
  5: 'Notice',
  6: 'Info',
  7: 'Debug',
};

export const severityColor: Record<number, string> = {
  0: 'negative',
  1: 'warning',
  2: 'negative',
  3: 'negative',
  4: 'warning',
  5: 'info',
  6: 'primary',
  7: 'grey',
};
