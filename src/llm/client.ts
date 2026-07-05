import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';
import type { LlmMessage } from '../wiki/llm.js';

export interface LlmClientOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface LlmClient {
  generate(messages: LlmMessage[], stepName: string): Promise<string>;
}

export function parseModelId(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}

function createModel({ model, apiKey, baseUrl }: LlmClientOptions): LanguageModel {
  const trimmedBaseUrl = baseUrl?.trim();
  const openai = createOpenAI({
    apiKey,
    ...(trimmedBaseUrl ? { baseURL: trimmedBaseUrl } : {}),
  });
  return openai.chat(parseModelId(model));
}

export function createLlmClient(options: LlmClientOptions): LlmClient {
  const model = createModel(options);

  return {
    async generate(messages: LlmMessage[], stepName: string): Promise<string> {
      console.log(`  ${stepName}...`);
      const { text } = await generateText({ model, messages });
      const trimmed = text.trim();
      if (!trimmed) {
        console.warn(`  [WARN] ${stepName} returned empty response`);
      }
      return trimmed;
    },
  };
}

export async function testLlmConnection(options: LlmClientOptions): Promise<string> {
  const client = createLlmClient(options);
  return client.generate([{ role: 'user', content: 'Reply with exactly: OK' }], 'connection-test');
}
