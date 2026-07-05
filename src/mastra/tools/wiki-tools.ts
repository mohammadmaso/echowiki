import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getWikiPageContent,
  listWikiFiles,
  readKbFile,
  readWikiFile,
  readWikiImage,
  writeKbFile,
  writeWikiFile,
} from '../../wiki/tools.js';

export interface WikiToolsOptions {
  kbRoot: string;
  wikiRoot: string;
}

export function createWikiTools({ kbRoot, wikiRoot }: WikiToolsOptions) {
  const listWikiFilesTool = createTool({
    id: 'list-wiki-files',
    description:
      'List all Markdown files in a wiki subdirectory (e.g. "sources", "concepts", "summaries").',
    inputSchema: z.object({
      directory: z.string().describe('Subdirectory relative to wiki root, e.g. "concepts"'),
    }),
    outputSchema: z.object({
      result: z.string(),
    }),
    execute: async ({ directory }) => ({
      result: listWikiFiles(directory, wikiRoot),
    }),
  });

  const readWikiFileTool = createTool({
    id: 'read-wiki-file',
    description: 'Read a Markdown file from the wiki by relative path.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to wiki root, e.g. "summaries/paper.md"'),
    }),
    outputSchema: z.object({
      content: z.string(),
    }),
    execute: async ({ path: filePath }) => ({
      content: readWikiFile(filePath, wikiRoot),
    }),
  });

  const writeWikiFileTool = createTool({
    id: 'write-wiki-file',
    description:
      'Write or overwrite a Markdown file in the wiki. Parent directories are created automatically.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to wiki root, e.g. "concepts/attention.md"'),
      content: z.string().describe('Markdown content to write'),
    }),
    outputSchema: z.object({
      result: z.string(),
    }),
    execute: async ({ path: filePath, content }) => ({
      result: writeWikiFile(filePath, content, wikiRoot),
    }),
  });

  const getWikiPageContentTool = createTool({
    id: 'get-wiki-page-content',
    description:
      'Get text content of specific pages from a PageIndex (long) document. Only use for documents with doc_type: pageindex. For short documents, use read-wiki-file instead.',
    inputSchema: z.object({
      docName: z.string().describe('Document name without extension, e.g. "attention-is-all-you-need"'),
      pages: z.string().describe('Page specification, e.g. "3-5,7,10-12"'),
    }),
    outputSchema: z.object({
      content: z.string(),
    }),
    execute: async ({ docName, pages }) => ({
      content: getWikiPageContent(docName, pages, wikiRoot),
    }),
  });

  const readWikiImageTool = createTool({
    id: 'read-wiki-image',
    description:
      'View an image from the wiki. Use when a question asks about a specific figure, chart, or diagram.',
    inputSchema: z.object({
      imagePath: z
        .string()
        .describe('Image path relative to wiki root, e.g. "sources/images/doc/p1_img1.png"'),
    }),
    outputSchema: z.discriminatedUnion('type', [
      z.object({ type: z.literal('image'), imageUrl: z.string() }),
      z.object({ type: z.literal('text'), text: z.string() }),
    ]),
    execute: async ({ imagePath }) => readWikiImage(imagePath, wikiRoot),
    toModelOutput: (output) => {
      if (output.type === 'image') {
        return {
          type: 'content',
          value: [{ type: 'image-url', url: output.imageUrl }],
        };
      }
      return { type: 'text', value: output.text };
    },
  });

  const readKbFileTool = createTool({
    id: 'read-kb-file',
    description:
      'Read a text file from the knowledge base. Allowed paths: wiki/**, output/**, skills/** (relative to KB root).',
    inputSchema: z.object({
      path: z.string().describe('File path relative to KB root, e.g. "wiki/index.md"'),
    }),
    outputSchema: z.object({
      content: z.string(),
    }),
    execute: async ({ path: filePath }) => ({
      content: readKbFile(filePath, kbRoot),
    }),
  });

  const writeKbFileTool = createTool({
    id: 'write-kb-file',
    description:
      'Write a text file under the KB. Allowed paths: wiki/explorations/** and output/** (relative to KB root).',
    inputSchema: z.object({
      path: z
        .string()
        .describe('File path relative to KB root, e.g. "wiki/explorations/my-analysis.md"'),
      content: z.string().describe('Full text content to write (overwrites if file exists)'),
    }),
    outputSchema: z.object({
      result: z.string(),
    }),
    execute: async ({ path: filePath, content }) => ({
      result: writeKbFile(filePath, content, kbRoot),
    }),
  });

  return {
    listWikiFilesTool,
    readWikiFileTool,
    writeWikiFileTool,
    getWikiPageContentTool,
    readWikiImageTool,
    readKbFileTool,
    writeKbFileTool,
  };
}

export type WikiTools = ReturnType<typeof createWikiTools>;
