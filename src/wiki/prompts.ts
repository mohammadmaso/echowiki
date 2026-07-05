export const SYSTEM_TEMPLATE = `You are EchoWiki's wiki compilation agent for a personal knowledge base.

{schema_md}

Write all content in {language} language.
Use [[wikilinks]] to connect related pages (e.g. [[concepts/attention]]).`;

export const SUMMARY_USER = `New document: {doc_name}

Full text:
{content}

Write a summary page for this document in Markdown.

Return a JSON object with two keys:
- "description": A single sentence (under 100 chars) describing the document's main contribution
- "content": The full summary in Markdown. Include key concepts, findings, ideas, and [[wikilinks]] to concepts that could become cross-document concept pages

Return ONLY valid JSON, no fences.`;

export const CONCEPTS_PLAN_USER = `Based on the summary above, decide how to update the wiki's CONCEPT pages and ENTITY pages.

A CONCEPT is an abstract, recurring idea/pattern/mechanism (e.g. "agentic systems"). An ENTITY is a specific named thing — a person, organization, place, product, named work, or event (e.g. "Anthropic"). Each name goes in exactly ONE group.

Existing concept pages:
{concept_briefs}

Existing entity pages (with source counts = how many docs already cite them):
{entity_briefs}

Return a JSON object with two top-level keys, "concepts" and "entities".

"concepts" is an object with:
1. "create" — new concepts. Array of {"name": "concept-slug", "title": "Title"}
2. "update" — existing concepts with significant new info. Same shape.
3. "related" — existing concept slugs to cross-link only. Array of strings.

"entities" is an object with the same three keys, but create/update objects add a "type" field, one of: {entity_types}. Example:
 {"name": "anthropic", "title": "Anthropic", "type": "organization"}

Rules:
- For the first few documents, create 2-3 foundational concepts at most.
- Create an ENTITY page only when the entity is central to this document or likely to recur across sources.
- Prefer "update" over "create" for any concept or entity already listed above.
- Do NOT create a concept/entity that overlaps an existing one — use "update".
- Do NOT create concepts that are just the document topic itself.
- "related" is lightweight cross-linking only, no content rewrite.

Return ONLY valid JSON, no fences, no explanation.`;

export const KNOWN_TARGETS_USER = `The wiki currently contains these pages, and they are the COMPLETE list of valid [[wikilink]] targets you may use in the responses that follow:

{known_targets}

Rules for [[wikilinks]] in all subsequent responses:
- For [[concepts/X]]: X must appear in the whitelist above.
- For [[summaries/Y]]: Y must appear in the whitelist above.
- For [[entities/Z]]: Z must appear in the whitelist above.
- Do NOT invent new wikilink targets. If you want to mention a concept or entity that is not in the whitelist, write it as plain text without brackets.`;

export const CONCEPT_PAGE_USER = `Write the concept page for: {title}

This concept relates to the document "{doc_name}" summarized above.
{update_instruction}

Return a JSON object with two keys:
- "description": A single sentence (under 100 chars) defining this concept
- "content": The full concept page in Markdown. Include clear explanation, key details from the source document, and [[wikilinks]] to related concepts and [[summaries/{doc_name}]] — subject to the wikilink rules from the whitelist message above.

Return ONLY valid JSON, no fences.`;

export const CONCEPT_UPDATE_USER = `Update the concept page for: {title}

Current content of this page:
{existing_content}

New information from document "{doc_name}" (summarized above) should be integrated into this page. Rewrite the full page incorporating the new information naturally — do not just append. Preserve the existing structure and intent of the page.

For [[wikilinks]] in the rewrite, follow the whitelist rules from the message above.

Return a JSON object with two keys:
- "description": A single sentence (under 100 chars) defining this concept (may differ from before)
- "content": The rewritten full concept page in Markdown

Return ONLY valid JSON, no fences.`;

export const ENTITY_PAGE_USER = `Write the entity page for: {title} (type: {type})

This entity relates to the document "{doc_name}" summarized above.

Return a JSON object with three keys:
- "description": A single sentence (under 100 chars) identifying this entity
- "type": one of {entity_types}
- "content": The full entity page in Markdown — what this entity is, the key facts about it from this document, and [[wikilinks]] to related concepts, other [[entities/...]], and [[summaries/{doc_name}]] — subject to the whitelist rules from the message above.

Return ONLY valid JSON, no fences.`;

export const ENTITY_UPDATE_USER = `Update the entity page for: {title} (type: {type})

Current content of this page:
{existing_content}

Integrate the new facts about this entity from document "{doc_name}" (summarized above). Rewrite the full page — do not just append. Preserve the existing structure and intent. Follow the whitelist rules from the message above for all [[wikilinks]].

Return a JSON object with three keys:
- "description": A single sentence (under 100 chars) identifying this entity
- "type": one of {entity_types}
- "content": The rewritten full entity page in Markdown

Return ONLY valid JSON, no fences.`;

export const SUMMARY_REWRITE_USER = `Task: Rewrite the summary you wrote above into a final version that is consistent with the concept pages now in the wiki (per the whitelist message above).

STRICT rules:
- Preserve every factual claim, finding, and detail from your draft. Do NOT add or remove technical content, examples, or claims.
- For [[wikilinks]], follow the whitelist message above: keep valid links, replace targets not in the whitelist with plain text, do not invent new wikilink targets.
- You MAY upgrade plain-text mentions to [[wikilinks]] when the concept appears in the whitelist — this is encouraged.
- Keep the headings, paragraph structure, and approximately the same length as the draft.

Return ONLY the rewritten Markdown content (no JSON, no fences, no frontmatter).`;

export function formatTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}
