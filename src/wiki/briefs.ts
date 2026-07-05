import type { WikiStorage } from '../storage/types.js';
import { joinWikiPath } from '../storage/types.js';
import * as frontmatter from './frontmatter.js';

function resolveDescription(fm: Record<string, string | string[]>): string {
  for (const key of ['description', 'brief']) {
    const value = fm[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function bodyPreview(text: string): string {
  const parts = frontmatter.split(text);
  const body = parts ? parts.body : text;
  return body.trim().replace(/\n/g, ' ').slice(0, 150);
}

export async function readConceptBriefs(storage: WikiStorage): Promise<string> {
  const names = (await storage.list('concepts')).filter((name) => name.endsWith('.md')).sort();
  if (!names.length) {
    return '(none yet)';
  }
  const lines: string[] = [];
  for (const file of names) {
    const text = await storage.readText(joinWikiPath('concepts', file));
    if (!text) {
      continue;
    }
    const fm = frontmatter.parse(text);
    const brief = resolveDescription(fm) || bodyPreview(text);
    if (brief) {
      lines.push(`- ${file.slice(0, -3)}: ${brief}`);
    }
  }
  return lines.length ? lines.join('\n') : '(none yet)';
}

export async function readEntityBriefs(storage: WikiStorage): Promise<string> {
  const names = (await storage.list('entities')).filter((name) => name.endsWith('.md')).sort();
  if (!names.length) {
    return '(none yet)';
  }
  const lines: string[] = [];
  for (const file of names) {
    const text = await storage.readText(joinWikiPath('entities', file));
    if (!text) {
      continue;
    }
    const fm = frontmatter.parse(text);
    const brief = resolveDescription(fm) || bodyPreview(text);
    const etype = String(fm.type ?? 'other').toLowerCase();
    const sources = Array.isArray(fm.sources) ? fm.sources : [];
    const suffix = brief ? ` — ${brief}` : '';
    lines.push(`- ${file.slice(0, -3)} (${etype}, ${sources.length} sources)${suffix}`);
  }
  return lines.length ? lines.join('\n') : '(none yet)';
}
