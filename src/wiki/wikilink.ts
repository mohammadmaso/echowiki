import type { WikiStorage } from '../storage/types.js';
import { joinWikiPath } from '../storage/types.js';

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function normalizeTarget(target: string): string {
  return target
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9/-]/g, '');
}

export function buildNormIndex(knownTargets: Set<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const target of knownTargets) {
    index.set(normalizeTarget(target), target);
  }
  return index;
}

export async function listExistingWikiTargets(storage: WikiStorage): Promise<Set<string>> {
  const targets = new Set<string>();
  for (const subdir of ['concepts', 'summaries', 'entities'] as const) {
    const names = await storage.list(subdir);
    for (const name of names) {
      if (name.endsWith('.md')) {
        targets.add(`${subdir}/${name.slice(0, -3)}`);
      }
    }
  }
  if (await storage.exists('index.md')) {
    targets.add('index');
  }
  return targets;
}

export function stripGhostWikilinks(
  content: string,
  knownTargets: Set<string>,
  normIndex?: Map<string, string>,
): { content: string; ghosts: string[] } {
  const index = normIndex ?? buildNormIndex(knownTargets);
  const ghosts: string[] = [];

  const cleaned = content.replace(WIKILINK_RE, (match, raw: string) => {
    const [targetPart, aliasPart] = raw.includes('|')
      ? raw.split('|', 2).map((part) => part.trim())
      : [raw.trim(), undefined];

    if (knownTargets.has(targetPart)) {
      return match;
    }

    const canonical = index.get(normalizeTarget(targetPart));
    if (canonical) {
      return aliasPart ? `[[${canonical}|${aliasPart}]]` : `[[${canonical}]]`;
    }

    ghosts.push(targetPart);
    if (aliasPart) {
      return aliasPart;
    }
    const stem = targetPart.split('/').pop() ?? targetPart;
    return stem.replace(/[-_]/g, ' ');
  });

  return { content: cleaned, ghosts };
}

export function sanitizeSlug(name: string): string {
  const normalized = name.normalize('NFKC');
  const sanitized = normalized.replace(/[^\w-]/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'unnamed-concept';
}

export function conceptPath(slug: string): string {
  return joinWikiPath('concepts', `${slug}.md`);
}

export function entityPath(slug: string): string {
  return joinWikiPath('entities', `${slug}.md`);
}
