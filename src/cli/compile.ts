import path from 'node:path';
import { compileDocument } from '../compiler-api.js';
import { docNameFromPath } from '../utils.js';

function printUsage(): void {
  console.log('Usage: npm run compile -- <path-to-raw-file> [--kb-dir <vault-root>]');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith('--'));
  if (!fileArg) {
    printUsage();
    process.exit(1);
  }

  const kbDirIndex = args.indexOf('--kb-dir');
  const kbDir = kbDirIndex >= 0 ? args[kbDirIndex + 1] : process.cwd();
  const sourcePath = path.resolve(kbDir, fileArg);
  const docName = docNameFromPath(path.basename(sourcePath));

  await compileDocument(docName, sourcePath, { kbDir });
  console.log(`Compiled ${docName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
