export function docNameFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.(md|txt|markdown)$/i, '');
}
