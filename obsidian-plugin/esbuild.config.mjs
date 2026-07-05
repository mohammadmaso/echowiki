import esbuild from 'esbuild';
import process from 'node:process';
import builtins from 'builtin-modules';

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
});

if (prod) {
  await context.rebuild();
  process.exit(0);
}

await context.watch();
console.log('Watching for changes...');
