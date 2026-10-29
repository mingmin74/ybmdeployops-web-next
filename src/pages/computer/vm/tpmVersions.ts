export function allowedTpmVersions(architecture: string): string[] {
  return architecture === 'aarch64' ? ['v2.0'] : ['v1.2', 'v2.0'];
}
