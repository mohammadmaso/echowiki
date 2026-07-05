import fs from 'node:fs';
import path from 'node:path';
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

export function readConceptBriefs(wikiDir: string): string {
  const conceptsDir = path.join(wikiDir, 'concepts');
  if (!fs.existsSync(conceptsDir)) {
    return '(none yet)';
  }
  const files = fs.readdirSync(conceptsDir).filter((name) => name.endsWith('.md')).sort();
  if (!files.length) {
    return '(none yet)';
  }
  const lines: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(conceptsDir, file), 'utf-8');
    const fm = frontmatter.parse(text);
    const brief = resolveDescription(fm) || bodyPreview(text);
    if (brief) {
      lines.push(`- ${file.slice(0, -3)}: ${brief}`);
    }
  }
  return lines.length ? lines.join('\n') : '(none yet)';
}

export function readEntityBriefs(wikiDir: string): string {
  const entitiesDir = path.join(wikiDir, 'entities');
  if (!fs.existsSync(entitiesDir)) {
    return '(none yet)';
  }
  const files = fs.readdirSync(entitiesDir).filter((name) => name.endsWith('.md')).sort();
  if (!files.length) {
    return '(none yet)';
  }
  const lines: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(entitiesDir, file), 'utf-8');
    const fm = frontmatter.parse(text);
    const brief = resolveDescription(fm) || bodyPreview(text);
    const etype = String(fm.type ?? 'other').toLowerCase();
    const sources = Array.isArray(fm.sources) ? fm.sources : [];
    const suffix = brief ? ` — ${brief}` : '';
    lines.push(`- ${file.slice(0, -3)} (${etype}, ${sources.length} sources)${suffix}`);
  }
  return lines.length ? lines.join('\n') : '(none yet)';
}
