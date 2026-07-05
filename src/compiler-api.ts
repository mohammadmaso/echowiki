import { loadConfig, resolvePaths, type EchoWikiConfig } from './config.js';
import { createLlmClient } from './llm/client.js';
import { compileShortDoc } from './wiki/compiler.js';

export interface CompileDocumentOptions {
  kbDir?: string;
  llmModel?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  language?: string;
  config?: Partial<EchoWikiConfig>;
}

export async function compileDocument(
  docName: string,
  sourcePath: string,
  options: CompileDocumentOptions = {},
): Promise<void> {
  const config = loadConfig({
    ...(options.kbDir ? { kbDir: options.kbDir } : {}),
    ...(options.language ? { language: options.language } : {}),
    ...options.config,
  });

  const apiKey = options.llmApiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim() ?? '';
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
    baseUrl: options.llmBaseUrl?.trim() || process.env.OPENAI_BASE_URL?.trim() || undefined,
  });

  await compileShortDoc(client, {
    docName,
    sourcePath,
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
