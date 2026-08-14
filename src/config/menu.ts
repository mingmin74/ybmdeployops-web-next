export type MenuItem = {
  titleKey: string;
  path?: string;
  icon: string;
  children?: MenuItem[];
  requiresDcCap?: string;
};

export const menuItems: MenuItem[] = [
  { titleKey: 'Dashboard', path: '/dashboard', icon: 'insights' },
  {
    titleKey: 'Computer',
    icon: 'dvr',
    children: [
      { titleKey: 'Overview', path: '/computer/overview', icon: 'dashboard' },
      { titleKey: 'Virtual Machine', path: '/computer/list', icon: 'desktop_windows' },
      { titleKey: 'Ct Container', path: '/computer/ct-container', icon: 'inventory_2' },
      { titleKey: 'ISO Image', path: '/computer/iso', icon: 'album' },
      { titleKey: 'Backup File', path: '/computer/backup', icon: 'backup' },
      { titleKey: 'Disk Image', path: '/computer/images', icon: 'storage' },
      { titleKey: 'HA', path: '/computer/ha', icon: 'hub' },
    ],
  },
  {
    titleKey: 'Storage',
    icon: 'dns',
    children: [
      // 暂不开放存储概览模块。
      // { titleKey: 'Overview', path: '/storage/overview', icon: 'dashboard' },
      { titleKey: 'Disks Management', path: '/storage/disks', icon: 'storage' },
      { titleKey: 'Cluster Storage', path: '/storage/udos', icon: 'cloud_queue' },
      { titleKey: 'Storage Services', path: '/storage/list', icon: 'view_list' },
    ],
  },
  {
    titleKey: 'Host',
    icon: 'view_carousel',
    children: [
      { titleKey: 'Overview', path: '/host/overview', icon: 'dashboard' },
      { titleKey: 'Nodes', path: '/host/nodes', icon: 'account_tree' },
      { titleKey: 'Cluster', path: '/host/cluster', icon: 'lan' },
    ],
  },
  {
    titleKey: 'System',
    icon: 'settings',
    children: [
      {
        titleKey: 'Permissions',
        path: '/system/permissions',
        icon: 'admin_panel_settings',
        requiresDcCap: 'Sys.Audit',
      },
      { titleKey: 'Service', path: '/system/service', icon: 'miscellaneous_services' },
      { titleKey: 'Firewall', path: '/system/firewall', icon: 'security' },
      {
        titleKey: 'SDN',
        path: '/system/sdn',
        icon: 'account_tree',
        children: [
          { titleKey: 'Status', path: '/system/sdn', icon: 'monitoring' },
          { titleKey: 'SDN Zones', path: '/system/sdn/zones', icon: 'public' },
          { titleKey: 'Fabrics', path: '/system/sdn/fabrics', icon: 'account_tree' },
          { titleKey: 'SDN VNets', path: '/system/sdn/vnets', icon: 'hub' },
          { titleKey: 'Prefix Lists', path: '/system/sdn/prefix-lists', icon: 'filter_list' },
          { titleKey: 'Route Maps', path: '/system/sdn/route-maps', icon: 'alt_route' },
          { titleKey: 'VNet Firewall', path: '/system/sdn/firewall', icon: 'security' },
          { titleKey: 'SDN IPAM', path: '/system/sdn/ipam', icon: 'lan' },
          { titleKey: 'SDN Options', path: '/system/sdn/options', icon: 'tune' },
        ],
      },
      { titleKey: 'Options', path: '/system/options', icon: 'tune' },
      { titleKey: 'Resource Mappings', path: '/system/resource-mappings', icon: 'device_hub' },
      { titleKey: 'Directory Mappings', path: '/system/directory-mappings', icon: 'folder' },
      { titleKey: 'CPU Types', path: '/system/cpu-types', icon: 'memory' },
      { titleKey: 'Metric Server', path: '/system/metric-server', icon: 'monitor_heart' },
    ],
  },
  {
    titleKey: 'Maintenance',
    icon: 'build',
    children: [
      { titleKey: 'Tasks', path: '/maintenance/tasks', icon: 'task_alt' },
      { titleKey: 'Logs', path: '/maintenance/logs', icon: 'article' },
    ],
  },
];
