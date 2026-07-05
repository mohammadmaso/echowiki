import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { buildWikiCompilerAgent, type WikiCompilerModelConfig } from '../agents/wiki-compiler.js';
import { compileShortDoc } from '../../wiki/compiler.js';

const compileInputSchema = z.object({
  docName: z.string(),
  sourcePath: z.string(),
  kbDir: z.string().optional(),
  llmModel: z.string().optional(),
  llmApiKey: z.string().optional(),
  llmBaseUrl: z.string().optional(),
  language: z.string().optional(),
});

function buildModelConfig(input: z.infer<typeof compileInputSchema>): WikiCompilerModelConfig | undefined {
  const modelId = input.llmModel?.trim();
  if (!modelId) {
    return undefined;
  }

  const apiKey = input.llmApiKey?.trim();
  const baseUrl = input.llmBaseUrl?.trim();
  if (apiKey || baseUrl) {
    return {
      id: modelId as `${string}/${string}`,
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { url: baseUrl } : {}),
    };
  }

  return modelId;
}

const compileStep = createStep({
  id: 'compile-document',
  inputSchema: compileInputSchema,
  outputSchema: z.object({
    docName: z.string(),
    status: z.literal('compiled'),
  }),
  execute: async ({ inputData }) => {
    const agent = buildWikiCompilerAgent({
      kbDir: inputData.kbDir,
      model: buildModelConfig(inputData),
      language: inputData.language,
    });

    await compileShortDoc(agent, {
      docName: inputData.docName,
      sourcePath: inputData.sourcePath,
      config: {
        ...(inputData.kbDir ? { kbDir: inputData.kbDir } : {}),
        ...(inputData.language ? { language: inputData.language } : {}),
      },
    });

    return { docName: inputData.docName, status: 'compiled' as const };
  },
});

export const compileDocumentWorkflow = createWorkflow({
  id: 'compile-document',
  inputSchema: compileInputSchema,
  outputSchema: z.object({
    docName: z.string(),
    status: z.literal('compiled'),
  }),
})
  .then(compileStep)
  .commit();
