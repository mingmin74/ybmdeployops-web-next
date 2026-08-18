const DNS_NAME_RE =
  /^(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\.)*(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?))$/;
const SSH_KEY_RE = /^(?:((?:[^\s"]|"(?:\\.|[^"\\])*")+)\s+)?(\S+)\s+(\S+)(?:\s+(.*))?$/;
const SSH_KEY_TYPE_RE =
  /^(?:(?:sk-)?(?:ssh-(?:dss|rsa|ed25519)|ecdsa-sha2-nistp\d+)(?:@(?:[a-z0-9_-]+\.)+[a-z]{2,})?)$/;

export function isDnsName(value: string) {
  return DNS_NAME_RE.test(value);
}

export function isValidSshPublicKeys(value: string) {
  return value
    .split(/\r?\n/)
    .filter((key) => key.trim())
    .every((key) => isValidSshPublicKey(key));
}

export function hasValidSshPublicKey(value: string) {
  return value.split(/\r?\n/).some((key) => key.trim() && isValidSshPublicKey(key));
}

function isValidSshPublicKey(value: string) {
  const match = value.match(SSH_KEY_RE);
  if (!match || match.length < 3 || !match[2]) return false;
  return Boolean(match[1] && SSH_KEY_TYPE_RE.test(match[1])) || SSH_KEY_TYPE_RE.test(match[2]);
}

export function isValidPveTag(value: string) {
  return /^[a-z0-9+_.-]+$/i.test(value);
}
