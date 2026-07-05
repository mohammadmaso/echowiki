import { loadConfig, resolvePaths, type EchoWikiConfig } from './config.js';
import { createLlmClient } from './llm/client.js';
import type { WikiStorage } from './storage/types.js';
import { compileShortDoc } from './wiki/compiler.js';

export interface CompileDocumentOptions {
  storage: WikiStorage;
  kbDir?: string;
  llmModel?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  language?: string;
  config?: Partial<EchoWikiConfig>;
}

export async function compileDocument(
  docName: string,
  sourceContent: string,
  options: CompileDocumentOptions,
): Promise<void> {
  const config = loadConfig({
    ...(options.kbDir ? { kbDir: options.kbDir } : {}),
    ...(options.language ? { language: options.language } : {}),
    ...options.config,
  });

  const env =
    typeof process !== 'undefined' && process.env ? process.env : ({} as NodeJS.ProcessEnv);

  const apiKey = options.llmApiKey?.trim() ?? env.OPENAI_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new Error('LLM API key is not set.');
  }

  const model = options.llmModel?.trim() ?? config.llmModel;
  if (!model) {
    throw new Error('LLM model is not set.');
  }

  const client = createLlmClient({
    model,
    apiKey,
    baseUrl: options.llmBaseUrl?.trim() || env.OPENAI_BASE_URL?.trim() || undefined,
  });

  await compileShortDoc(client, {
    docName,
    sourceContent,
    storage: options.storage,
    config: {
      ...options.config,
      ...(options.kbDir ? { kbDir: options.kbDir } : {}),
      ...(options.language ? { language: options.language } : {}),
    },
  });
}

export function getWikiDir(kbDir?: string): string {
  return resolvePaths(loadConfig(kbDir ? { kbDir } : {})).wikiDir;
}

export function getRawDir(kbDir?: string): string {
  return resolvePaths(loadConfig(kbDir ? { kbDir } : {})).rawDir;
}

export type { WikiStorage } from './storage/types.js';
