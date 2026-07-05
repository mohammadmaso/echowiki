import esbuild from 'esbuild';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const prod = process.argv[2] === 'production';

const processShim = `if (typeof globalThis.process === "undefined") {
  globalThis.process = { env: {} };
}`;

const context = await esbuild.context({
  banner: {
    js: prod ? processShim : `${processShim}\n/* EchoWiki dev build */`,
  },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  platform: 'browser',
  alias: {
    '@echowiki': resolve(repoRoot, 'src'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
}

await context.watch();
console.log('Watching for changes...');
