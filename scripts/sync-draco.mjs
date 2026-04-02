import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'node_modules/three/examples/jsm/libs/draco');
const targetDir = resolve(rootDir, 'public/draco');

await mkdir(targetDir, { recursive: true });

if (!existsSync(sourceDir)) {
  console.warn('Skipping Draco sync because three/examples/jsm/libs/draco was not found.');
  process.exit(0);
}

await cp(sourceDir, targetDir, {
  recursive: true,
  force: true
});

console.log('Synced Draco decoder files to public/draco.');

