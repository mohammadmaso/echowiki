export const DEFAULT_ENTITY_TYPES = [
  'person',
  'organization',
  'place',
  'product',
  'work',
  'event',
  'other',
] as const;

export type EntityType = (typeof DEFAULT_ENTITY_TYPES)[number];

export interface EchoWikiConfig {
  kbDir: string;
  rawFolder: string;
  wikiFolder: string;
  language: string;
  entityTypes: EntityType[];
  llmModel: string;
  compileConcurrency: number;
}

function defaultKbDir(): string {
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return process.cwd();
  }
  return '.';
}

function readEnv(key: string): string | undefined {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const value = env?.[key]?.trim();
  return value || undefined;
}

function joinPath(...segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/\\/g, '/'))
    .join('/')
    .replace(/\/+/g, '/');
}

function resolvePath(base: string, ...segments: string[]): string {
  const parts = joinPath(base, ...segments).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
      continue;
    }
    if (part === '.' || part === '') {
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/') || '.';
}

export function loadConfig(overrides: Partial<EchoWikiConfig> = {}): EchoWikiConfig {
  const kbDir = overrides.kbDir ?? defaultKbDir();
  return {
    kbDir,
    rawFolder: overrides.rawFolder ?? 'raw',
    wikiFolder: overrides.wikiFolder ?? 'wiki',
    language: overrides.language ?? 'en',
    entityTypes: overrides.entityTypes ?? [...DEFAULT_ENTITY_TYPES],
    llmModel: overrides.llmModel ?? readEnv('LLM_MODEL') ?? 'openai/gpt-5-mini',
    compileConcurrency: overrides.compileConcurrency ?? 5,
  };
}

export function resolvePaths(config: EchoWikiConfig) {
  return {
    kbDir: resolvePath(config.kbDir),
    rawDir: resolvePath(config.kbDir, config.rawFolder),
    wikiDir: resolvePath(config.kbDir, config.wikiFolder),
  };
}
