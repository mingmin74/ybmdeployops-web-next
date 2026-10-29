export type NoVncScaling = 'scale' | 'remote' | 'off';
export type NoVncScalingPreference = '__default__' | NoVncScaling;

const noVncScalingKey = 'novnc-scaling';

export function getNoVncScalingPreference(): NoVncScalingPreference {
  const value = localStorage.getItem(noVncScalingKey);
  return value === 'scale' || value === 'remote' || value === 'off' ? value : '__default__';
}

export function setNoVncScalingPreference(value: NoVncScalingPreference): void {
  if (value === '__default__') localStorage.removeItem(noVncScalingKey);
  else localStorage.setItem(noVncScalingKey, value);
}

export function getNoVncScaling(defaultMode: NoVncScaling): NoVncScaling {
  const preference = getNoVncScalingPreference();
  return preference === '__default__' ? defaultMode : preference;
}
