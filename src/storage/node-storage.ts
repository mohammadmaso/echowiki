import fs from 'node:fs';
import path from 'node:path';
import type { WikiStorage } from './types.js';

export function createNodeWikiStorage(wikiDir: string): WikiStorage {
  const root = path.resolve(wikiDir);

  function resolveRelative(relativePath: string): string {
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error(`Path escapes wiki root: ${relativePath}`);
    }
    return resolved;
  }

  return {
    async exists(relativePath) {
      return fs.existsSync(resolveRelative(relativePath));
    },

    async readText(relativePath) {
      const fullPath = resolveRelative(relativePath);
      if (!fs.existsSync(fullPath)) {
        return null;
      }
      return fs.readFileSync(fullPath, 'utf-8');
    },

    async writeText(relativePath, content) {
      const fullPath = resolveRelative(relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const tmp = `${fullPath}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, content, 'utf-8');
      fs.renameSync(tmp, fullPath);
    },

    async appendText(relativePath, content) {
      const fullPath = resolveRelative(relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.appendFileSync(fullPath, content, 'utf-8');
    },

    async ensureDir(relativePath) {
      fs.mkdirSync(resolveRelative(relativePath), { recursive: true });
    },

    async list(relativePath) {
      const fullPath = resolveRelative(relativePath);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        return [];
      }
      return fs.readdirSync(fullPath);
    },
  };
}
