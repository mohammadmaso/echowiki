import fs from 'node:fs';
import path from 'node:path';

export function split(text: string): { frontmatter: string; body: string } | null {
  if (!text.startsWith('---\n')) {
    return null;
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return null;
  }
  return {
    frontmatter: text.slice(0, end + 5),
    body: text.slice(end + 5),
  };
}

export function parse(text: string): Record<string, string | string[]> {
  const parts = split(text);
  if (!parts) {
    return {};
  }
  const fm: Record<string, string | string[]> = {};
  for (const line of parts.frontmatter.split('\n')) {
    if (!line.includes(':') || line === '---') {
      continue;
    }
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = parseListValue(value);
    } else {
      fm[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

export function parseListValue(value: string): string[] {
  const inner = value.slice(1, -1).trim();
  if (!inner) {
    return [];
  }
  return inner.split(',').map((item) => item.trim().replace(/^["']|["']$/g, ''));
}

export function kvLine(key: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key}: "${escaped}"`;
}

export function listLine(key: string, values: string[]): string {
  const items = values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
  return `${key}: [${items}]`;
}

export function block(lines: string[]): string {
  return `---\n${lines.join('\n')}\n---\n\n`;
}

export function dropLine(frontmatter: string, key: string): string {
  return frontmatter
    .split('\n')
    .filter((line) => !line.startsWith(`${key}:`))
    .join('\n');
}

export function setLine(frontmatter: string, key: string, value: string): string {
  const lines = frontmatter.split('\n');
  const prefix = `${key}:`;
  let replaced = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      replaced = true;
      return kvLine(key, value);
    }
    return line;
  });
  if (!replaced) {
    const closing = next.lastIndexOf('---');
    next.splice(closing, 0, kvLine(key, value));
  }
  return next.join('\n');
}

export function atomicWriteText(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}
