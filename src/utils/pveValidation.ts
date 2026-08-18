const DNS_NAME_RE =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;
const SSH_KEY_RE =
  /^(?:(?:[^\s"]|"(?:\\.|[^"\\])*")+\s+)?((?:ssh-(?:rsa|dss|ed25519)|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com))\s+([A-Za-z0-9+/]+={0,3})(?:\s+.*)?$/;

export function isDnsName(value: string) {
  return DNS_NAME_RE.test(value);
}

export function isValidSshPublicKeys(value: string) {
  return value
    .split(/\r?\n/)
    .filter((key) => key.trim())
    .every((key) => SSH_KEY_RE.test(key));
}

export function hasValidSshPublicKey(value: string) {
  return value.split(/\r?\n/).some((key) => key.trim() && SSH_KEY_RE.test(key));
}

export function isValidPveTag(value: string) {
  return /^[a-z0-9+_.-]+$/i.test(value);
}
