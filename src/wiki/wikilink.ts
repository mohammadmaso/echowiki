import fs from 'node:fs';
import path from 'node:path';

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

export function listExistingWikiTargets(wikiDir: string): Set<string> {
  const targets = new Set<string>();
  for (const subdir of ['concepts', 'summaries', 'entities'] as const) {
    const dir = path.join(wikiDir, subdir);
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.md')) {
        targets.add(`${subdir}/${name.slice(0, -3)}`);
      }
    }
  }
  if (fs.existsSync(path.join(wikiDir, 'index.md'))) {
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
