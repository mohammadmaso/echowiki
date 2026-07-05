import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

export type WikiImageResult =
  | { type: 'image'; imageUrl: string }
  | { type: 'text'; text: string };

function resolveWithinRoot(root: string, relativePath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    return null;
  }
  return resolved;
}

export function listWikiFiles(directory: string, wikiRoot: string): string {
  const target = resolveWithinRoot(wikiRoot, directory);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return 'No files found.';
  }
  const mdFiles = fs
    .readdirSync(target)
    .filter((name) => name.endsWith('.md'))
    .sort();
  return mdFiles.length ? mdFiles.join('\n') : 'No files found.';
}

export function readWikiFile(relativePath: string, wikiRoot: string): string {
  const fullPath = resolveWithinRoot(wikiRoot, relativePath);
  if (!fullPath) {
    return 'Access denied: path escapes wiki root.';
  }
  if (!fs.existsSync(fullPath)) {
    return `File not found: ${relativePath}`;
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

export function writeWikiFile(relativePath: string, content: string, wikiRoot: string): string {
  const fullPath = resolveWithinRoot(wikiRoot, relativePath);
  if (!fullPath) {
    return 'Access denied: path escapes wiki root.';
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return `Written: ${relativePath}`;
}

export function parsePages(pages: string): number[] {
  const result = new Set<number>();
  for (const part of pages.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const segments = trimmed.split('-');
      try {
        if (segments.length === 2) {
          const start = Number.parseInt(segments[0], 10);
          const end = Number.parseInt(segments[1], 10);
          if (!Number.isNaN(start) && !Number.isNaN(end)) {
            for (let page = start; page <= end; page += 1) {
              result.add(page);
            }
          }
        } else if (segments.length === 3 && segments[0] === '') {
          const value = Number.parseInt(segments[1], 10);
          if (!Number.isNaN(value)) {
            result.add(-value);
          }
        }
      } catch {
        // Tolerant parser — skip malformed segments.
      }
    } else {
      const value = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(value)) {
        result.add(value);
      }
    }
  }
  return [...result].filter((page) => page > 0).sort((a, b) => a - b);
}

interface WikiPageEntry {
  page?: number;
  content?: string;
  images?: Array<{ path?: string }>;
}

export function getWikiPageContent(docName: string, pages: string, wikiRoot: string): string {
  const fullPath = resolveWithinRoot(wikiRoot, path.join('sources', `${docName}.json`));
  if (!fullPath) {
    return 'Access denied: path escapes wiki root.';
  }
  if (!fs.existsSync(fullPath)) {
    return `File not found: sources/${docName}.json`;
  }

  const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as WikiPageEntry[];
  const requested = new Set(parsePages(pages));
  const matches = data.filter((entry) => entry.page !== undefined && requested.has(entry.page));

  if (!matches.length) {
    return `No content found for pages ${pages} in ${docName}.`;
  }

  const parts = matches.map((entry) => {
    const pageNum = entry.page!;
    let block = `[Page ${pageNum}]\n${entry.content ?? ''}`;
    const images = entry.images;
    if (images?.length) {
      const paths = images.map((img) => img.path).filter(Boolean).join(', ');
      if (paths) {
        block += `\n[Images: ${paths}]`;
      }
    }
    return block;
  });

  return `${parts.join('\n\n')}\n\n`;
}

export function readWikiImage(relativePath: string, wikiRoot: string): WikiImageResult {
  const fullPath = resolveWithinRoot(wikiRoot, relativePath);
  if (!fullPath) {
    return { type: 'text', text: 'Access denied: path escapes wiki root.' };
  }
  if (!fs.existsSync(fullPath)) {
    return { type: 'text', text: `Image not found: ${relativePath}` };
  }

  const mime = MIME_TYPES[path.extname(fullPath).toLowerCase()] ?? 'image/png';
  const b64 = fs.readFileSync(fullPath).toString('base64');
  return { type: 'image', imageUrl: `data:${mime};base64,${b64}` };
}

export function readKbFile(relativePath: string, kbRoot: string): string {
  if (!relativePath) {
    return 'Access denied: empty path.';
  }

  const fullPath = resolveWithinRoot(kbRoot, relativePath);
  if (!fullPath) {
    return 'Access denied: path escapes KB root.';
  }

  const rel = path.relative(path.resolve(kbRoot), fullPath);
  const parts = rel.split(path.sep);
  if (!parts.length || !parts[0]) {
    return 'Access denied: KB root itself is not readable.';
  }
  if (!['wiki', 'output', 'skills'].includes(parts[0])) {
    return 'Access denied: path must be under wiki/, output/, or skills/.';
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return `File not found: ${relativePath}`;
  }

  return fs.readFileSync(fullPath, 'utf-8');
}

export function writeKbFile(relativePath: string, content: string, kbRoot: string): string {
  if (!relativePath) {
    return 'Access denied: path must be a file under wiki/explorations/ or output/.';
  }

  const fullPath = resolveWithinRoot(kbRoot, relativePath);
  if (!fullPath) {
    return 'Access denied: path escapes KB root.';
  }

  const rel = path.relative(path.resolve(kbRoot), fullPath);
  const parts = rel.split(path.sep);
  const allowed =
    (parts.length >= 3 && parts[0] === 'wiki' && parts[1] === 'explorations') ||
    (parts.length >= 2 && parts[0] === 'output');
  if (!allowed) {
    return 'Access denied: path must be a file under wiki/explorations/ or output/.';
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return `Written: ${relativePath}`;
}
