import esbuild from 'esbuild';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import builtins from 'builtin-modules';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  banner: {
    js: prod ? '' : '/* EchoWiki dev build */',
  },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', ...builtins],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  platform: 'node',
  alias: {
    '@echowiki': resolve(repoRoot, 'src'),
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
}

await context.watch();
console.log('Watching for changes...');
