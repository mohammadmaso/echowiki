import { normalizePath } from 'obsidian';

export function timestampSlug(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

export function docNameFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.(md|txt|markdown)$/i, '');
}

export function isRawFile(path: string, rawFolder: string): boolean {
  const normalized = normalizePath(path);
  const prefix = `${normalizePath(rawFolder)}/`;
  if (!normalized.startsWith(prefix)) {
    return false;
  }
  return /\.(md|txt|markdown)$/i.test(normalized);
}

export function isCompilableRawFile(path: string, rawFolder: string): boolean {
  if (!isRawFile(path, rawFolder)) {
    return false;
  }
  return !/\.wav$/i.test(path);
}

export function joinVaultPath(basePath: string, ...parts: string[]): string {
  return normalizePath([basePath, ...parts].join('/'));
}

export async function ensureFolder(vaultPath: string, adapter: { exists: (p: string) => Promise<boolean>; mkdir: (p: string) => Promise<void> }): Promise<void> {
  if (!(await adapter.exists(vaultPath))) {
    await adapter.mkdir(vaultPath);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
