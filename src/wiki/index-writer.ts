import fs from 'node:fs';
import path from 'node:path';
import { INDEX_SEED } from './schema.js';
import { atomicWriteText } from './frontmatter.js';

function iterH2Headings(lines: string[]): Array<{ index: number; heading: string }> {
  return lines
    .map((line, index) => ({ index, heading: line.startsWith('## ') ? line.trimEnd() : null }))
    .filter((entry): entry is { index: number; heading: string } => entry.heading !== null);
}

function getSectionBounds(lines: string[], heading: string): [number, number] | null {
  const headings = iterH2Headings(lines);
  for (let i = 0; i < headings.length; i += 1) {
    if (headings[i].heading === heading) {
      const start = headings[i].index + 1;
      const end = i + 1 < headings.length ? headings[i + 1].index : lines.length;
      return [start, end];
    }
  }
  return null;
}

function ensureH2Section(lines: string[], heading: string, quiet = false): void {
  if (getSectionBounds(lines, heading)) {
    return;
  }
  if (!quiet) {
    console.warn(`Wiki page is missing ${heading} section; appending it.`);
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }
  if (lines.length) {
    lines.push('');
  }
  lines.push(heading, '');
}

function ensureH2SectionBefore(lines: string[], heading: string, before: string): void {
  if (getSectionBounds(lines, heading)) {
    return;
  }
  const beforeBounds = getSectionBounds(lines, before);
  if (!beforeBounds) {
    ensureH2Section(lines, heading);
    return;
  }
  const insertAt = beforeBounds[0] - 1;
  lines.splice(insertAt, 0, heading, '');
}

function sectionContainsLink(lines: string[], heading: string, link: string): boolean {
  const bounds = getSectionBounds(lines, heading);
  if (!bounds) {
    return false;
  }
  const [start, end] = bounds;
  const prefix = `- ${link}`;
  return lines.slice(start, end).some((line) => line.startsWith(prefix));
}

function replaceSectionEntry(lines: string[], heading: string, link: string, entry: string): boolean {
  const bounds = getSectionBounds(lines, heading);
  if (!bounds) {
    return false;
  }
  const [start, end] = bounds;
  const prefix = `- ${link}`;
  for (let i = start; i < end; i += 1) {
    if (lines[i].startsWith(prefix)) {
      lines[i] = entry;
      return true;
    }
  }
  return false;
}

function insertSectionEntry(lines: string[], heading: string, entry: string): boolean {
  const bounds = getSectionBounds(lines, heading);
  if (!bounds) {
    return false;
  }
  lines.splice(bounds[0], 0, entry);
  return true;
}

export function updateIndex(
  wikiDir: string,
  docName: string,
  conceptNames: string[],
  options: {
    docBrief?: string;
    conceptBriefs?: Record<string, string>;
    docType?: string;
    entityNames?: string[];
    entityMeta?: Record<string, { type: string; brief: string }>;
  } = {},
): void {
  const {
    docBrief = '',
    conceptBriefs = {},
    docType = 'short',
    entityNames = [],
    entityMeta = {},
  } = options;

  const indexPath = path.join(wikiDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    atomicWriteText(indexPath, INDEX_SEED);
  }

  const lines = fs.readFileSync(indexPath, 'utf-8').split('\n');
  ensureH2Section(lines, '## Documents');
  if (conceptNames.length) {
    ensureH2Section(lines, '## Concepts');
  }

  const docLink = `[[summaries/${docName}]]`;
  if (!sectionContainsLink(lines, '## Documents', docLink)) {
    let docEntry = `- ${docLink} (${docType})`;
    if (docBrief) {
      docEntry += ` — ${docBrief}`;
    }
    insertSectionEntry(lines, '## Documents', docEntry);
  }

  for (const name of conceptNames) {
    const conceptLink = `[[concepts/${name}]]`;
    let conceptEntry = `- ${conceptLink}`;
    if (conceptBriefs[name]) {
      conceptEntry += ` — ${conceptBriefs[name]}`;
    }
    if (sectionContainsLink(lines, '## Concepts', conceptLink)) {
      if (conceptBriefs[name]) {
        replaceSectionEntry(lines, '## Concepts', conceptLink, conceptEntry);
      }
    } else {
      insertSectionEntry(lines, '## Concepts', conceptEntry);
    }
  }

  if (entityNames.length) {
    ensureH2SectionBefore(lines, '## Entities', '## Explorations');
    for (const name of entityNames) {
      const link = `[[entities/${name}]]`;
      const meta = entityMeta[name] ?? { type: 'other', brief: '' };
      let entry = `- ${link} (${meta.type})`;
      if (meta.brief) {
        entry += ` — ${meta.brief}`;
      }
      if (sectionContainsLink(lines, '## Entities', link)) {
        replaceSectionEntry(lines, '## Entities', link, entry);
      } else {
        insertSectionEntry(lines, '## Entities', entry);
      }
    }
  }

  atomicWriteText(indexPath, lines.join('\n'));
}

export function appendLog(wikiDir: string, operation: string, description: string): void {
  const logPath = path.join(wikiDir, 'log.md');
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const entry = `\n## [${timestamp}] ${operation} | ${description}\n`;
  if (fs.existsSync(logPath)) {
    fs.appendFileSync(logPath, entry, 'utf-8');
  } else {
    atomicWriteText(logPath, `# Operations Log${entry}`);
  }
}

export { ensureH2Section, insertSectionEntry, getSectionBounds };
