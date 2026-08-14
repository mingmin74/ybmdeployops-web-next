import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/pages/computer/vm/hardware/vmHardwareUtils.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const utils = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

assert.deepEqual(utils.parseVmHardwarePropertyString('std,memory=16,clipboard=vnc', 'type'), {
  type: 'std',
  memory: '16',
  clipboard: 'vnc',
});
assert.equal(
  utils.printVmHardwarePropertyString({ type: 'std', memory: 16, clipboard: 'vnc' }, 'type'),
  'std,memory=16,clipboard=vnc',
);
assert.deepEqual(utils.parseVmHardwarePropertyString('pc-q35-9.0,viommu=virtio', 'type'), {
  type: 'pc-q35-9.0',
  viommu: 'virtio',
});
assert.equal(
  utils.printVmHardwarePropertyString({ type: 'pc', viommu: 'virtio' }, 'type'),
  'pc,viommu=virtio',
);
assert.equal(utils.getGuestArchitecture({}), 'x86_64');
assert.equal(utils.getGuestArchitecture({ arch: 'aarch64' }), 'aarch64');
assert.deepEqual(utils.parseQemuDrive('cdrom,media=cdrom,cache=unsafe'), {
  file: 'cdrom',
  media: 'cdrom',
  cache: 'unsafe',
});
assert.equal(
  utils.printQemuDrive({ file: 'local:iso/new.iso', media: 'cdrom', cache: 'unsafe' }),
  'local:iso/new.iso,media=cdrom,cache=unsafe',
);
console.log('VM hardware property-string regression checks passed');
