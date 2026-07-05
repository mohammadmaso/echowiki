import { App, TFile, normalizePath } from 'obsidian';
import type { WikiStorage } from '@echowiki/storage/types';
import { joinWikiPath } from '@echowiki/storage/types';

function vaultPath(wikiFolder: string, relativePath: string): string {
  return normalizePath(joinWikiPath(wikiFolder, relativePath));
}

async function ensureVaultDir(app: App, wikiFolder: string, relativePath: string): Promise<void> {
  const fullPath = vaultPath(wikiFolder, relativePath);
  const adapter = app.vault.adapter;
  if (await adapter.exists(fullPath)) {
    return;
  }
  const parts = fullPath.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await adapter.exists(current))) {
      await adapter.mkdir(current);
    }
  }
}

export function createVaultWikiStorage(app: App, wikiFolder: string): WikiStorage {
  const normalizedWikiFolder = normalizePath(wikiFolder);

  return {
    async exists(relativePath) {
      return app.vault.adapter.exists(vaultPath(normalizedWikiFolder, relativePath));
    },

    async readText(relativePath) {
      const fullPath = vaultPath(normalizedWikiFolder, relativePath);
      const file = app.vault.getAbstractFileByPath(fullPath);
      if (!(file instanceof TFile)) {
        return null;
      }
      return app.vault.read(file);
    },

    async writeText(relativePath, content) {
      const fullPath = vaultPath(normalizedWikiFolder, relativePath);
      const existing = app.vault.getAbstractFileByPath(fullPath);
      if (existing instanceof TFile) {
        await app.vault.modify(existing, content);
        return;
      }
      const dir = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
      if (dir) {
        await ensureVaultDir(app, normalizedWikiFolder, dir);
      }
      await app.vault.create(fullPath, content);
    },

    async appendText(relativePath, content) {
      const fullPath = vaultPath(normalizedWikiFolder, relativePath);
      const existing = app.vault.getAbstractFileByPath(fullPath);
      if (existing instanceof TFile) {
        const current = await app.vault.read(existing);
        await app.vault.modify(existing, current + content);
        return;
      }
      const dir = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
      if (dir) {
        await ensureVaultDir(app, normalizedWikiFolder, dir);
      }
      await app.vault.create(fullPath, content);
    },

    async ensureDir(relativePath) {
      await ensureVaultDir(app, normalizedWikiFolder, relativePath);
    },

    async list(relativePath) {
      const fullPath = vaultPath(normalizedWikiFolder, relativePath);
      if (!(await app.vault.adapter.exists(fullPath))) {
        return [];
      }
      const listed = await app.vault.adapter.list(fullPath);
      return listed.files.map((filePath) => filePath.slice(filePath.lastIndexOf('/') + 1));
    },
  };
}
