// Loads the engine source files into this Node process, in manifest order,
// exactly as the build step concatenates them for the browser.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'engine', 'manifest.json'), 'utf8'));
for (const file of manifest.files) {
  const path = join(ROOT, 'engine', file);
  vm.runInThisContext(readFileSync(path, 'utf8'), { filename: path });
}

export const RE = globalThis.RepEngine;
export { ROOT };
