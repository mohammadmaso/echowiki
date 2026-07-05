import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, '..');
const repoRoot = resolve(pluginRoot, '..');
const source = join(repoRoot, '.mastra', 'output');
const target = join(pluginRoot, 'mastra-server');

if (!existsSync(source)) {
  console.error('Mastra build output not found. Run `npm run build` in the repo root first.');
  process.exit(1);
}

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
}

cpSync(source, target, { recursive: true });
console.log(`Copied Mastra server to ${target}`);
