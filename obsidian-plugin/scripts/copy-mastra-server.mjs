import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, '..');
const repoRoot = resolve(pluginRoot, '..');
const source = join(repoRoot, '.mastra', 'output');
const target = join(pluginRoot, 'mastra-server');

const RUNTIME_ARTIFACT = /\.(db|db-shm|db-wal|duckdb|duckdb\.wal)$/;

function removeRuntimeArtifacts(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      removeRuntimeArtifacts(fullPath);
      continue;
    }
    if (RUNTIME_ARTIFACT.test(entry)) {
      rmSync(fullPath, { force: true });
    }
  }
}

if (!existsSync(source)) {
  console.error('Mastra build output not found. Run `npm run build` in the repo root first.');
  process.exit(1);
}

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
}

cpSync(source, target, { recursive: true });
removeRuntimeArtifacts(target);
console.log(`Copied Mastra server to ${target}`);
