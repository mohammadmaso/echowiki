import { compileDocument, type WikiStorage } from '@echowiki/compiler-api';
import type { EchoWikiPluginSettings } from './settings';

export interface CompileDocumentInput {
  docName: string;
  sourceContent: string;
  storage: WikiStorage;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  language?: string;
}

export interface CompileDocumentResult {
  docName: string;
  status: 'compiled';
}

export async function runCompileDocument(input: CompileDocumentInput): Promise<CompileDocumentResult> {
  await compileDocument(input.docName, input.sourceContent, {
    storage: input.storage,
    llmModel: input.llmModel,
    llmApiKey: input.llmApiKey,
    llmBaseUrl: input.llmBaseUrl,
    language: input.language,
  });
  return { docName: input.docName, status: 'compiled' };
}

export async function testLlmConnection(settings: EchoWikiPluginSettings): Promise<string> {
  const { testLlmConnection: test } = await import('@echowiki/llm/client');
  return test({
    model: settings.llmModel.trim(),
    apiKey: settings.llmApiKey.trim(),
    baseUrl: settings.llmBaseUrl.trim() || undefined,
  });
}
