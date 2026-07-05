import path from 'node:path';
import { Agent } from '@mastra/core/agent';
import { loadConfig, resolvePaths } from '../../config.js';
import { compileShortDoc } from '../../wiki/compiler.js';
import { formatTemplate, SYSTEM_TEMPLATE } from '../../wiki/prompts.js';
import { getAgentsMd } from '../../wiki/schema.js';
import { createWikiTools } from '../tools/wiki-tools.js';

export type WikiCompilerModelConfig =
  | string
  | {
      id: `${string}/${string}`;
      url?: string;
      apiKey?: string;
      headers?: Record<string, string>;
    };

export interface WikiCompilerAgentOptions {
  kbDir?: string;
  model?: WikiCompilerModelConfig;
  language?: string;
}

function buildCompilerInstructions(wikiDir: string, language: string): string {
  const schemaMd = getAgentsMd(wikiDir);
  return formatTemplate(SYSTEM_TEMPLATE, { schema_md: schemaMd, language });
}

export function buildWikiCompilerAgent(options: WikiCompilerAgentOptions = {}): Agent {
  const config = loadConfig({
    kbDir: options.kbDir,
    llmModel: typeof options.model === 'string' ? options.model : undefined,
    language: options.language,
  });
  const { wikiDir, kbDir } = resolvePaths(config);
  const tools = createWikiTools({ kbRoot: kbDir, wikiRoot: wikiDir });
  const model = options.model ?? config.llmModel;

  return new Agent({
    id: 'wiki-compiler',
    name: 'Wiki Compiler',
    instructions: buildCompilerInstructions(wikiDir, config.language),
    model,
    tools,
  });
}

const defaultAgent = buildWikiCompilerAgent();

export const wikiCompilerAgent = defaultAgent;

export async function compileDocument(
  docName: string,
  sourcePath: string,
  agent: Agent = defaultAgent,
): Promise<void> {
  await compileShortDoc(agent, { docName, sourcePath });
}

export function getWikiDir(): string {
  return resolvePaths(loadConfig()).wikiDir;
}

export function getRawDir(): string {
  return resolvePaths(loadConfig()).rawDir;
}

export function getProjectRoot(): string {
  return resolvePaths(loadConfig()).kbDir;
}

export { compileShortDoc };
