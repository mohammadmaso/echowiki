import type { WikiStorage } from '../storage/types.js';

export const PAGE_CONTENT_DIRS = ['summaries', 'concepts', 'entities'] as const;

export const INDEX_SEED =
  '# Knowledge Base Index\n\n## Documents\n\n## Concepts\n\n## Entities\n\n## Explorations\n';

export const DEFAULT_AGENTS_MD = `# Wiki Schema

## Directory Structure
- sources/ — Document content. Short docs as .md, long docs as .json (per-page). Do not modify directly.
- summaries/ — One per source document. Summary of key content.
- concepts/ — Cross-document topic synthesis. Created when a theme spans multiple documents.
- entities/ — Specific named things: people, organizations, places, products, named works, events.
- explorations/ — Saved query results, analyses, and comparisons worth keeping.
- reports/ — Lint health check reports. Auto-generated.

## Special Files
- index.md — Content catalog: every page with link, one-line summary, organized by category.
- log.md — Chronological append-only record of operations (ingests, queries, lints).

## Page Types
- **Summary Page** (summaries/): Key content of a single source document.
- **Concept Page** (concepts/): Cross-document topic synthesis with [[wikilinks]].
- **Entity Page** (entities/): A specific named thing with a \`type:\` frontmatter field.

## Format
- Use [[wikilink]] to link other wiki pages (e.g., [[concepts/attention]])
- Standard Markdown heading hierarchy
- Keep each page focused on a single topic

## Frontmatter (managed by code — do NOT emit it in generated content)
- Every summary/concept/entity page carries a non-empty \`type:\` field.
- \`description:\` — a single-sentence one-liner.
- Do not include YAML frontmatter (---) in generated content; it is managed by code.
`;

export async function getAgentsMd(storage: WikiStorage): Promise<string> {
  const content = await storage.readText('AGENTS.md');
  return content ?? DEFAULT_AGENTS_MD;
}
