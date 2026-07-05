import path from 'node:path';

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

export function loadConfig(overrides: Partial<EchoWikiConfig> = {}): EchoWikiConfig {
  const kbDir = overrides.kbDir ?? process.cwd();
  return {
    kbDir,
    rawFolder: overrides.rawFolder ?? 'raw',
    wikiFolder: overrides.wikiFolder ?? 'wiki',
    language: overrides.language ?? 'en',
    entityTypes: overrides.entityTypes ?? [...DEFAULT_ENTITY_TYPES],
    llmModel: overrides.llmModel ?? process.env.LLM_MODEL ?? 'openai/gpt-5-mini',
    compileConcurrency: overrides.compileConcurrency ?? 5,
  };
}

export function resolvePaths(config: EchoWikiConfig) {
  return {
    kbDir: path.resolve(config.kbDir),
    rawDir: path.resolve(config.kbDir, config.rawFolder),
    wikiDir: path.resolve(config.kbDir, config.wikiFolder),
  };
}
