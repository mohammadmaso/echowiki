import fs from 'node:fs';
import path from 'node:path';
import * as frontmatter from './frontmatter.js';
import { sanitizeSlug } from './wikilink.js';
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

export function writeSummary(
  wikiDir: string,
  docName: string,
  summary: string,
  options: { docType?: string; description?: string } = {},
): void {
  const { docType = 'short', description = '' } = options;
  const parts = frontmatter.split(summary);
  const body = (parts ? parts.body : summary).replace(/^\n+/, '');

  const summariesDir = path.join(wikiDir, 'summaries');
  fs.mkdirSync(summariesDir, { recursive: true });
  const ext = docType === 'short' ? 'md' : 'json';
  const fmLines = [frontmatter.kvLine('type', 'Summary')];
  if (description) {
    fmLines.push(frontmatter.kvLine('description', description));
  }
  fmLines.push(`doc_type: ${docType}`);
  fmLines.push(frontmatter.kvLine('full_text', `sources/${docName}.${ext}`));
  frontmatter.atomicWriteText(
    path.join(summariesDir, `${docName}.md`),
    frontmatter.block(fmLines) + body,
  );
}

export function writeConcept(
  wikiDir: string,
  name: string,
  content: string,
  sourceFile: string,
  isUpdate: boolean,
  brief = '',
): void {
  const conceptsDir = path.join(wikiDir, 'concepts');
  fs.mkdirSync(conceptsDir, { recursive: true });
  const safeName = sanitizeSlug(name);
  const filePath = path.join(conceptsDir, `${safeName}.md`);

  const cleanParts = frontmatter.split(content);
  const cleanBody = (cleanParts ? cleanParts.body : content).replace(/^\n+/, '');

  if (isUpdate && fs.existsSync(filePath)) {
    let existing = fs.readFileSync(filePath, 'utf-8');
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
      frontmatter.atomicWriteText(filePath, fmBlock + '\n' + cleanBody);
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
  frontmatter.atomicWriteText(filePath, frontmatter.block(fmLines) + cleanBody);
}

export function writeEntity(
  wikiDir: string,
  name: string,
  content: string,
  sourceFile: string,
  isUpdate: boolean,
  brief = '',
  type = 'other',
): void {
  const entitiesDir = path.join(wikiDir, 'entities');
  fs.mkdirSync(entitiesDir, { recursive: true });
  const safeName = sanitizeSlug(name);
  const filePath = path.join(entitiesDir, `${safeName}.md`);

  const cleanParts = frontmatter.split(content);
  const cleanBody = (cleanParts ? cleanParts.body : content).replace(/^\n+/, '');

  const buildEntityFrontmatter = (sources: string[]) =>
    frontmatter.block([
      frontmatter.listLine('sources', sources),
      frontmatter.kvLine('type', (type || 'other').replace(/^\w/, (c) => c.toUpperCase())),
      ...(brief ? [frontmatter.kvLine('description', brief)] : []),
    ]);

  if (isUpdate && fs.existsSync(filePath)) {
    let existing = fs.readFileSync(filePath, 'utf-8');
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
      frontmatter.atomicWriteText(filePath, fmBlock + '\n' + cleanBody);
      return;
    }
  }

  frontmatter.atomicWriteText(filePath, buildEntityFrontmatter([sourceFile]) + cleanBody);
}

export function addRelatedLink(
  wikiDir: string,
  slug: string,
  docName: string,
  sourceFile: string,
  pageDir: 'concepts' | 'entities' = 'concepts',
): boolean {
  const filePath = path.join(wikiDir, pageDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const link = `[[summaries/${docName}]]`;
  let text = fs.readFileSync(filePath, 'utf-8');
  if (text.includes(link)) {
    return true;
  }
  if (!text.includes(sourceFile)) {
    text = prependSourceToFrontmatter(text, sourceFile);
  }
  text += `\n\nSee also: ${link}`;
  frontmatter.atomicWriteText(filePath, text);
  return true;
}

function backlinkSummaryPages(
  wikiDir: string,
  docName: string,
  slugs: string[],
  pageDir: 'concepts' | 'entities',
  section: string,
): void {
  const summaryPath = path.join(wikiDir, 'summaries', `${docName}.md`);
  if (!fs.existsSync(summaryPath)) {
    return;
  }
  const text = fs.readFileSync(summaryPath, 'utf-8');
  const missing = slugs.filter((slug) => !text.includes(`[[${pageDir}/${slug}]]`));
  if (!missing.length) {
    return;
  }
  const lines = text.split('\n');
  ensureH2Section(lines, section, true);
  for (const slug of [...missing].reverse()) {
    insertSectionEntry(lines, section, `- [[${pageDir}/${slug}]]`);
  }
  frontmatter.atomicWriteText(summaryPath, lines.join('\n'));
}

function backlinkPages(
  wikiDir: string,
  docName: string,
  slugs: string[],
  pageDir: 'concepts' | 'entities',
): void {
  const link = `[[summaries/${docName}]]`;
  const pagesDir = path.join(wikiDir, pageDir);
  for (const slug of slugs) {
    const filePath = path.join(pagesDir, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf-8');
    if (text.includes(link)) {
      continue;
    }
    const lines = text.split('\n');
    ensureH2Section(lines, '## Related Documents', true);
    insertSectionEntry(lines, '## Related Documents', `- ${link}`);
    frontmatter.atomicWriteText(filePath, lines.join('\n'));
  }
}

export function backlinkSummary(wikiDir: string, docName: string, conceptSlugs: string[]): void {
  backlinkSummaryPages(wikiDir, docName, conceptSlugs, 'concepts', '## Related Concepts');
}

export function backlinkConcepts(wikiDir: string, docName: string, conceptSlugs: string[]): void {
  backlinkPages(wikiDir, docName, conceptSlugs, 'concepts');
}

export function backlinkSummaryEntities(wikiDir: string, docName: string, entitySlugs: string[]): void {
  backlinkSummaryPages(wikiDir, docName, entitySlugs, 'entities', '## Related Entities');
}

export function backlinkEntities(wikiDir: string, docName: string, entitySlugs: string[]): void {
  backlinkPages(wikiDir, docName, entitySlugs, 'entities');
}
