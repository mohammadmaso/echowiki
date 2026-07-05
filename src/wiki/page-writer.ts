import type { WikiStorage } from '../storage/types.js';
import { joinWikiPath } from '../storage/types.js';
import * as frontmatter from './frontmatter.js';
import { conceptPath, entityPath, sanitizeSlug } from './wikilink.js';
import { ensureH2Section, insertSectionEntry } from './index-writer.js';

function prependSourceToFrontmatter(text: string, sourceFile: string): string {
  const parts = frontmatter.split(text);
  if (!parts) {
    return frontmatter.block([
      frontmatter.kvLine('type', 'Concept'),
      frontmatter.listLine('sources', [sourceFile]),
    ]) + text;
  }
  const fm = frontmatter.parse(text);
  const sources = Array.isArray(fm.sources) ? [...fm.sources] : [];
  if (!sources.includes(sourceFile)) {
    sources.unshift(sourceFile);
  }
  const lines = parts.frontmatter
    .split('\n')
    .filter((line) => !line.startsWith('sources:'));
  const closing = lines.lastIndexOf('---');
  lines.splice(closing, 0, frontmatter.listLine('sources', sources));
  return lines.join('\n') + parts.body;
}

export async function writeSummary(
  storage: WikiStorage,
  docName: string,
  summary: string,
  options: { docType?: string; description?: string } = {},
): Promise<void> {
  const { docType = 'short', description = '' } = options;
  const parts = frontmatter.split(summary);
  const body = (parts ? parts.body : summary).replace(/^\n+/, '');

  await storage.ensureDir('summaries');
  const ext = docType === 'short' ? 'md' : 'json';
  const fmLines = [frontmatter.kvLine('type', 'Summary')];
  if (description) {
    fmLines.push(frontmatter.kvLine('description', description));
  }
  fmLines.push(`doc_type: ${docType}`);
  fmLines.push(frontmatter.kvLine('full_text', `sources/${docName}.${ext}`));
  await frontmatter.atomicWriteText(
    storage,
    joinWikiPath('summaries', `${docName}.md`),
    frontmatter.block(fmLines) + body,
  );
}

export async function writeConcept(
  storage: WikiStorage,
  name: string,
  content: string,
  sourceFile: string,
  isUpdate: boolean,
  brief = '',
): Promise<void> {
  await storage.ensureDir('concepts');
  const safeName = sanitizeSlug(name);
  const relativePath = conceptPath(safeName);

  const cleanParts = frontmatter.split(content);
  const cleanBody = (cleanParts ? cleanParts.body : content).replace(/^\n+/, '');

  if (isUpdate && (await storage.exists(relativePath))) {
    let existing = (await storage.readText(relativePath)) ?? '';
    if (!existing.includes(sourceFile)) {
      existing = prependSourceToFrontmatter(existing, sourceFile);
    }
    const exParts = frontmatter.split(existing);
    if (exParts) {
      let fmBlock = frontmatter.setLine(exParts.frontmatter, 'type', 'Concept');
      if (brief) {
        fmBlock = frontmatter.setLine(fmBlock, 'description', brief);
      }
      fmBlock = frontmatter.dropLine(fmBlock, 'brief');
      await frontmatter.atomicWriteText(storage, relativePath, fmBlock + '\n' + cleanBody);
      return;
    }
  }

  const fmLines = [
    frontmatter.kvLine('type', 'Concept'),
    frontmatter.listLine('sources', [sourceFile]),
  ];
  if (brief) {
    fmLines.push(frontmatter.kvLine('description', brief));
  }
  await frontmatter.atomicWriteText(storage, relativePath, frontmatter.block(fmLines) + cleanBody);
}

export async function writeEntity(
  storage: WikiStorage,
  name: string,
  content: string,
  sourceFile: string,
  isUpdate: boolean,
  brief = '',
  type = 'other',
): Promise<void> {
  await storage.ensureDir('entities');
  const safeName = sanitizeSlug(name);
  const relativePath = entityPath(safeName);

  const cleanParts = frontmatter.split(content);
  const cleanBody = (cleanParts ? cleanParts.body : content).replace(/^\n+/, '');

  const buildEntityFrontmatter = (sources: string[]) =>
    frontmatter.block([
      frontmatter.listLine('sources', sources),
      frontmatter.kvLine('type', (type || 'other').replace(/^\w/, (c) => c.toUpperCase())),
      ...(brief ? [frontmatter.kvLine('description', brief)] : []),
    ]);

  if (isUpdate && (await storage.exists(relativePath))) {
    let existing = (await storage.readText(relativePath)) ?? '';
    if (!existing.includes(sourceFile)) {
      existing = prependSourceToFrontmatter(existing, sourceFile);
    }
    const exParts = frontmatter.split(existing);
    if (exParts) {
      let fmBlock = exParts.frontmatter;
      if (brief) {
        fmBlock = frontmatter.setLine(fmBlock, 'description', brief);
      }
      if (type) {
        fmBlock = frontmatter.setLine(fmBlock, 'type', type.replace(/^\w/, (c) => c.toUpperCase()));
      }
      fmBlock = frontmatter.dropLine(fmBlock, 'brief');
      await frontmatter.atomicWriteText(storage, relativePath, fmBlock + '\n' + cleanBody);
      return;
    }
  }

  await frontmatter.atomicWriteText(storage, relativePath, buildEntityFrontmatter([sourceFile]) + cleanBody);
}

export async function addRelatedLink(
  storage: WikiStorage,
  slug: string,
  docName: string,
  sourceFile: string,
  pageDir: 'concepts' | 'entities' = 'concepts',
): Promise<boolean> {
  const relativePath = joinWikiPath(pageDir, `${slug}.md`);
  if (!(await storage.exists(relativePath))) {
    return false;
  }
  const link = `[[summaries/${docName}]]`;
  let text = (await storage.readText(relativePath)) ?? '';
  if (text.includes(link)) {
    return true;
  }
  if (!text.includes(sourceFile)) {
    text = prependSourceToFrontmatter(text, sourceFile);
  }
  text += `\n\nSee also: ${link}`;
  await frontmatter.atomicWriteText(storage, relativePath, text);
  return true;
}

async function backlinkSummaryPages(
  storage: WikiStorage,
  docName: string,
  slugs: string[],
  pageDir: 'concepts' | 'entities',
  section: string,
): Promise<void> {
  const summaryPath = joinWikiPath('summaries', `${docName}.md`);
  if (!(await storage.exists(summaryPath))) {
    return;
  }
  const text = (await storage.readText(summaryPath)) ?? '';
  const missing = slugs.filter((slug) => !text.includes(`[[${pageDir}/${slug}]]`));
  if (!missing.length) {
    return;
  }
  const lines = text.split('\n');
  ensureH2Section(lines, section, true);
  for (const slug of [...missing].reverse()) {
    insertSectionEntry(lines, section, `- [[${pageDir}/${slug}]]`);
  }
  await frontmatter.atomicWriteText(storage, summaryPath, lines.join('\n'));
}

async function backlinkPages(
  storage: WikiStorage,
  docName: string,
  slugs: string[],
  pageDir: 'concepts' | 'entities',
): Promise<void> {
  const link = `[[summaries/${docName}]]`;
  for (const slug of slugs) {
    const relativePath = joinWikiPath(pageDir, `${slug}.md`);
    if (!(await storage.exists(relativePath))) {
      continue;
    }
    const text = (await storage.readText(relativePath)) ?? '';
    if (text.includes(link)) {
      continue;
    }
    const lines = text.split('\n');
    ensureH2Section(lines, '## Related Documents', true);
    insertSectionEntry(lines, '## Related Documents', `- ${link}`);
    await frontmatter.atomicWriteText(storage, relativePath, lines.join('\n'));
  }
}

export async function backlinkSummary(storage: WikiStorage, docName: string, conceptSlugs: string[]): Promise<void> {
  await backlinkSummaryPages(storage, docName, conceptSlugs, 'concepts', '## Related Concepts');
}

export async function backlinkConcepts(storage: WikiStorage, docName: string, conceptSlugs: string[]): Promise<void> {
  await backlinkPages(storage, docName, conceptSlugs, 'concepts');
}

export async function backlinkSummaryEntities(
  storage: WikiStorage,
  docName: string,
  entitySlugs: string[],
): Promise<void> {
  await backlinkSummaryPages(storage, docName, entitySlugs, 'entities', '## Related Entities');
}

export async function backlinkEntities(storage: WikiStorage, docName: string, entitySlugs: string[]): Promise<void> {
  await backlinkPages(storage, docName, entitySlugs, 'entities');
}
