/**
 * PVE-equivalent IP address / CIDR validators.
 *
 * Mirrors proxmox-widget-toolkit `src/Toolkit.js` VTypes:
 *   IPAddress        -> IP4_match
 *   IPCIDRAddress    -> IP4_cidr_match, prefix 8..32
 *   IP6Address       -> IP6_match
 *   IP6CIDRAddress   -> IP6_cidr_match, prefix 8..128
 *
 * Prefix limits follow pve-common `PVE/JSONSchema.pm`.
 */

const IPV4_OCTET = '(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])';
const IPV4_REGEXP = `(?:(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET})`;
const IPV6_H16 = '(?:[0-9a-fA-F]{1,4})';
const IPV6_LS32 = `(?:(?:${IPV6_H16}:${IPV6_H16})|${IPV4_REGEXP})`;
const IPV6_REGEXP =
  `(?:` +
  `(?:(?:(?:${IPV6_H16}:){6})${IPV6_LS32})` +
  `|(?:(?:::(?:${IPV6_H16}:){5})${IPV6_LS32})` +
  `|(?:(?:(?:${IPV6_H16})?::(?:${IPV6_H16}:){4})${IPV6_LS32})` +
  `|(?:(?:(?:(?:${IPV6_H16}:){0,1}${IPV6_H16})?::(?:${IPV6_H16}:){3})${IPV6_LS32})` +
  `|(?:(?:(?:(?:${IPV6_H16}:){0,2}${IPV6_H16})?::(?:${IPV6_H16}:){2})${IPV6_LS32})` +
  `|(?:(?:(?:(?:${IPV6_H16}:){0,3}${IPV6_H16})?::(?:${IPV6_H16}:){1})${IPV6_LS32})` +
  `|(?:(?:(?:(?:${IPV6_H16}:){0,4}${IPV6_H16})?::)${IPV6_LS32})` +
  `|(?:(?:(?:(?:${IPV6_H16}:){0,5}${IPV6_H16})?::)${IPV6_H16})` +
  `|(?:(?:(?:(?:${IPV6_H16}:){0,7}${IPV6_H16})?::)` +
  `)` +
  `)`;

const IPV4_RE = new RegExp(`^(?:${IPV4_REGEXP})$`);
const IPV6_RE = new RegExp(`^(?:${IPV6_REGEXP})$`);
const IPV4_CIDR_RE = new RegExp(`^(?:${IPV4_REGEXP})/([0-9]{1,2})$`);
const IPV6_CIDR_RE = new RegExp(`^(?:${IPV6_REGEXP})/([0-9]{1,3})$`);

export function isIpv4Address(value: string): boolean {
  return IPV4_RE.test(value);
}

export function isIpv6Address(value: string): boolean {
  return IPV6_RE.test(value);
}

export function isIpv4Cidr(value: string): boolean {
  const result = IPV4_CIDR_RE.exec(value);
  return result !== null && Number(result[1]) >= 8 && Number(result[1]) <= 32;
}

export function isIpv6Cidr(value: string): boolean {
  const result = IPV6_CIDR_RE.exec(value);
  return result !== null && Number(result[1]) >= 8 && Number(result[1]) <= 128;
}
