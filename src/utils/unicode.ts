export function toUnicode(value: string) {
  return encodeURI(value).replace(/%/g, 'A---');
}

export function toChineseStr(value: string) {
  return decodeURI(value.replace(/A---/g, '%'));
}
