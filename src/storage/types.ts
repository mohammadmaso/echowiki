/** Paths are relative to the wiki root (e.g. `concepts/foo.md`). */
export interface WikiStorage {
  exists(relativePath: string): Promise<boolean>;
  readText(relativePath: string): Promise<string | null>;
  writeText(relativePath: string, content: string): Promise<void>;
  appendText(relativePath: string, content: string): Promise<void>;
  ensureDir(relativePath: string): Promise<void>;
  list(relativePath: string): Promise<string[]>;
}

export function joinWikiPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
}
