import type { LlmClient } from '../llm/client.js';
import type { EchoWikiConfig } from '../config.js';
import { loadConfig } from '../config.js';
import type { WikiStorage } from '../storage/types.js';
import { readConceptBriefs, readEntityBriefs } from './briefs.js';
import * as frontmatter from './frontmatter.js';
import { appendLog, updateIndex } from './index-writer.js';
import {
  llmCall,
  pageFields,
  parseConceptsPlan,
  parseEntitiesPlan,
  parseJson,
  runWithConcurrency,
  type LlmMessage,
  type PlanItem,
} from './llm.js';
import {
  addRelatedLink,
  backlinkConcepts,
  backlinkEntities,
  backlinkSummary,
  backlinkSummaryEntities,
  writeConcept,
  writeEntity,
  writeSummary,
} from './page-writer.js';
import {
  CONCEPT_PAGE_USER,
  CONCEPT_UPDATE_USER,
  CONCEPTS_PLAN_USER,
  ENTITY_PAGE_USER,
  ENTITY_UPDATE_USER,
  formatTemplate,
  KNOWN_TARGETS_USER,
  SUMMARY_REWRITE_USER,
  SUMMARY_USER,
  SYSTEM_TEMPLATE,
} from './prompts.js';
import { getAgentsMd } from './schema.js';
import { conceptPath, entityPath, listExistingWikiTargets, sanitizeSlug, stripGhostWikilinks } from './wikilink.js';

export interface CompileShortDocOptions {
  docName: string;
  sourceContent: string;
  storage: WikiStorage;
  config?: Partial<EchoWikiConfig>;
  maxConcurrency?: number;
}

function formatKnownTargets(targets: Set<string>): string {
  if (!targets.size) {
    return '(none yet — do not use any [[wikilinks]] in your output)';
  }
  return [...targets].sort().map((target) => `- ${target}`).join('\n');
}

function buildSystemMessage(schemaMd: string, language: string): LlmMessage {
  return {
    role: 'system',
    content: formatTemplate(SYSTEM_TEMPLATE, { schema_md: schemaMd, language }),
  };
}

function buildDocMessage(docName: string, content: string): LlmMessage {
  return {
    role: 'user',
    content: formatTemplate(SUMMARY_USER, { doc_name: docName, content }),
  };
}

async function compileConcepts(
  client: LlmClient,
  storage: WikiStorage,
  systemMsg: LlmMessage,
  docMsg: LlmMessage,
  summary: string,
  docName: string,
  options: {
    docBrief: string;
    docType: string;
    entityTypes: string[];
    maxConcurrency: number;
    rewriteSummary: boolean;
  },
): Promise<void> {
  const { docBrief, docType, entityTypes, maxConcurrency, rewriteSummary } = options;
  const sourceFile = `summaries/${docName}.md`;
  const typesStr = entityTypes.join(', ');
  const validTypes = new Set(entityTypes);

  const conceptBriefs = await readConceptBriefs(storage);
  const entityBriefs = await readEntityBriefs(storage);
  const summaryMsg: LlmMessage = { role: 'assistant', content: summary };

  const planRaw = await llmCall(
    client,
    [
      systemMsg,
      docMsg,
      summaryMsg,
      {
        role: 'user',
        content: formatTemplate(CONCEPTS_PLAN_USER, {
          concept_briefs: conceptBriefs,
          entity_briefs: entityBriefs,
          entity_types: typesStr,
        }),
      },
    ],
    'concepts-plan',
  );

  const writeFallbackSummary = async () => {
    const fallbackTargets = await listExistingWikiTargets(storage);
    fallbackTargets.add(`summaries/${docName}`);
    const { content } = stripGhostWikilinks(summary, fallbackTargets);
    await writeSummary(storage, docName, content, { docType, description: docBrief });
  };

  let conceptsPlan;
  let entitiesPlan;
  try {
    const parsed = parseJson(planRaw);
    conceptsPlan = parseConceptsPlan(parsed);
    entitiesPlan = parseEntitiesPlan(parsed, validTypes);
  } catch (error) {
    console.warn(`  [WARN] concepts plan unparseable for ${docName}: ${error}`);
    if (rewriteSummary) {
      await writeFallbackSummary();
    }
    await updateIndex(storage, docName, [], { docBrief, docType });
    return;
  }

  conceptsPlan.related = (
    await Promise.all(
      conceptsPlan.related.map(async (slug) =>
        (await storage.exists(conceptPath(sanitizeSlug(slug)))) ? slug : null,
      ),
    )
  ).filter((slug): slug is string => slug !== null);

  entitiesPlan.related = (
    await Promise.all(
      entitiesPlan.related.map(async (slug) =>
        (await storage.exists(entityPath(sanitizeSlug(slug)))) ? slug : null,
      ),
    )
  ).filter((slug): slug is string => slug !== null);

  const isEmptyPlan =
    !conceptsPlan.create.length &&
    !conceptsPlan.update.length &&
    !conceptsPlan.related.length &&
    !entitiesPlan.create.length &&
    !entitiesPlan.update.length &&
    !entitiesPlan.related.length;

  if (isEmptyPlan) {
    if (rewriteSummary) {
      await writeFallbackSummary();
    }
    await updateIndex(storage, docName, [], { docBrief, docType });
    return;
  }

  const plannedSlugs = new Set([
    ...conceptsPlan.create.map((item) => sanitizeSlug(item.name)),
    ...conceptsPlan.update.map((item) => sanitizeSlug(item.name)),
    ...conceptsPlan.related.map(sanitizeSlug),
  ]);
  const entityPlanned = new Set([
    ...entitiesPlan.create.map((item) => sanitizeSlug(item.name)),
    ...entitiesPlan.update.map((item) => sanitizeSlug(item.name)),
    ...entitiesPlan.related.map(sanitizeSlug),
  ]);

  const knownTargets = new Set([
    ...(await listExistingWikiTargets(storage)),
    ...[...plannedSlugs].map((slug) => `concepts/${slug}`),
    ...[...entityPlanned].map((slug) => `entities/${slug}`),
    `summaries/${docName}`,
  ]);
  const knownTargetsMsg: LlmMessage = {
    role: 'user',
    content: formatTemplate(KNOWN_TARGETS_USER, {
      known_targets: formatKnownTargets(knownTargets),
    }),
  };

  const genCreate = (concept: PlanItem) => async () => {
    const name = concept.name;
    const title = concept.title ?? name;
    const raw = await llmCall(
      client,
      [
        systemMsg,
        docMsg,
        summaryMsg,
        knownTargetsMsg,
        {
          role: 'user',
          content: formatTemplate(CONCEPT_PAGE_USER, {
            title,
            doc_name: docName,
            update_instruction: '',
          }),
        },
      ],
      `concept: ${name}`,
    );
    const { brief, content } = pageFields(raw);
    if (!content.trim()) {
      throw new Error(`Empty content for concept ${name}`);
    }
    return { name, content, isUpdate: false, brief };
  };

  const genUpdate = (concept: PlanItem) => async () => {
    const name = concept.name;
    const title = concept.title ?? name;
    const relativePath = conceptPath(sanitizeSlug(name));
    let existingContent = '(page not found — create from scratch)';
    const rawText = await storage.readText(relativePath);
    if (rawText) {
      const parts = frontmatter.split(rawText);
      existingContent = parts ? parts.body.trim() : rawText;
    }
    const raw = await llmCall(
      client,
      [
        systemMsg,
        docMsg,
        summaryMsg,
        knownTargetsMsg,
        {
          role: 'user',
          content: formatTemplate(CONCEPT_UPDATE_USER, {
            title,
            doc_name: docName,
            existing_content: existingContent,
          }),
        },
      ],
      `update: ${name}`,
    );
    const { brief, content } = pageFields(raw);
    if (!content.trim()) {
      throw new Error(`Empty content for concept ${name}`);
    }
    return { name, content, isUpdate: true, brief };
  };

  const genEntityCreate = (entity: PlanItem) => async () => {
    const name = entity.name;
    const title = entity.title ?? name;
    const etype = entity.type ?? 'other';
    const raw = await llmCall(
      client,
      [
        systemMsg,
        docMsg,
        summaryMsg,
        knownTargetsMsg,
        {
          role: 'user',
          content: formatTemplate(ENTITY_PAGE_USER, {
            title,
            type: etype,
            doc_name: docName,
            entity_types: typesStr,
          }),
        },
      ],
      `entity: ${name}`,
    );
    const { brief, content, obj } = pageFields(raw);
    const etypeOut =
      obj && typeof obj.type === 'string' && validTypes.has(obj.type) ? obj.type : etype;
    if (!content.trim()) {
      throw new Error(`Empty content for entity ${name}`);
    }
    return { name, content, brief, type: etypeOut };
  };

  const genEntityUpdate = (entity: PlanItem) => async () => {
    const name = entity.name;
    const title = entity.title ?? name;
    const etype = entity.type ?? 'other';
    const relativePath = entityPath(sanitizeSlug(name));
    let existingContent = '(page not found — create from scratch)';
    const rawText = await storage.readText(relativePath);
    if (rawText) {
      const parts = frontmatter.split(rawText);
      existingContent = parts ? parts.body.trim() : rawText;
    }
    const raw = await llmCall(
      client,
      [
        systemMsg,
        docMsg,
        summaryMsg,
        knownTargetsMsg,
        {
          role: 'user',
          content: formatTemplate(ENTITY_UPDATE_USER, {
            title,
            type: etype,
            doc_name: docName,
            existing_content: existingContent,
            entity_types: typesStr,
          }),
        },
      ],
      `entity-update: ${name}`,
    );
    const { brief, content, obj } = pageFields(raw);
    const etypeOut =
      obj && typeof obj.type === 'string' && validTypes.has(obj.type) ? obj.type : etype;
    if (!content.trim()) {
      throw new Error(`Empty content for entity ${name}`);
    }
    return { name, content, brief, type: etypeOut };
  };

  const conceptTasks = [
    ...conceptsPlan.create.map((item) => genCreate(item)),
    ...conceptsPlan.update.map((item) => genUpdate(item)),
  ];
  const entityTasks = [
    ...entitiesPlan.create.map((item) => genEntityCreate(item)),
    ...entitiesPlan.update.map((item) => genEntityUpdate(item)),
  ];

  if (conceptTasks.length) {
    console.log(`  Generating ${conceptTasks.length} concept(s) (concurrency=${maxConcurrency})...`);
  }
  if (entityTasks.length) {
    console.log(`  Generating ${entityTasks.length} entity(ies) (concurrency=${maxConcurrency})...`);
  }

  const [conceptResults, entityResults] = await Promise.all([
    conceptTasks.length ? runWithConcurrency(conceptTasks, maxConcurrency) : Promise.resolve([]),
    entityTasks.length ? runWithConcurrency(entityTasks, maxConcurrency) : Promise.resolve([]),
  ]);

  const pendingWrites: Array<{ name: string; content: string; isUpdate: boolean; brief: string }> = [];
  const conceptNames: string[] = [];
  const conceptBriefsMap: Record<string, string> = {};

  for (const result of conceptResults) {
    if (result instanceof Error) {
      console.warn(`  Concept generation failed: ${result.message}`);
      continue;
    }
    pendingWrites.push(result);
    const safeName = sanitizeSlug(result.name);
    conceptNames.push(safeName);
    if (result.brief) {
      conceptBriefsMap[safeName] = result.brief;
    }
  }

  const entityPending: Array<{ name: string; content: string; brief: string; type: string }> = [];
  const entityNames: string[] = [];
  const entityMeta: Record<string, { type: string; brief: string }> = {};

  for (const result of entityResults) {
    if (result instanceof Error) {
      console.warn(`  Entity generation failed: ${result.message}`);
      continue;
    }
    entityPending.push(result);
  }

  for (const item of entityPending) {
    const { content } = stripGhostWikilinks(item.content, knownTargets);
    const safe = sanitizeSlug(item.name);
    const isUpdate = await storage.exists(entityPath(safe));
    await writeEntity(storage, item.name, content, sourceFile, isUpdate, item.brief, item.type);
    entityNames.push(safe);
    entityMeta[safe] = { type: item.type, brief: item.brief };
  }

  for (let i = 0; i < pendingWrites.length; i += 1) {
    const item = pendingWrites[i];
    const { content } = stripGhostWikilinks(item.content, knownTargets);
    pendingWrites[i] = { ...item, content };
  }

  let finalSummary = summary;
  if (rewriteSummary) {
    try {
      let candidate = await llmCall(
        client,
        [systemMsg, docMsg, summaryMsg, knownTargetsMsg, { role: 'user', content: SUMMARY_REWRITE_USER }],
        'summary-rewrite',
      );
      const parts = frontmatter.split(candidate);
      if (parts) {
        candidate = parts.body.replace(/^\n+/, '');
      }
      const stripped = stripGhostWikilinks(candidate, knownTargets);
      if (stripped.content.trim()) {
        finalSummary = stripped.content;
      } else {
        finalSummary = stripGhostWikilinks(summary, knownTargets).content;
      }
    } catch (error) {
      console.warn(`  summary-rewrite failed for ${docName}: ${error}`);
      finalSummary = stripGhostWikilinks(summary, knownTargets).content;
    }
    await writeSummary(storage, docName, finalSummary, { docType, description: docBrief });
  }

  for (const item of pendingWrites) {
    await writeConcept(storage, item.name, item.content, sourceFile, item.isUpdate, item.brief);
  }

  const sanitizedRelated = conceptsPlan.related.map(sanitizeSlug);
  for (const slug of sanitizedRelated) {
    await addRelatedLink(storage, slug, docName, sourceFile, 'concepts');
  }

  const allConceptSlugs = [...conceptNames, ...sanitizedRelated];
  if (allConceptSlugs.length) {
    await backlinkSummary(storage, docName, allConceptSlugs);
    await backlinkConcepts(storage, docName, allConceptSlugs);
  }

  const entityRelatedSlugs: string[] = [];
  for (const slug of entitiesPlan.related.map(sanitizeSlug)) {
    if (await addRelatedLink(storage, slug, docName, sourceFile, 'entities')) {
      entityRelatedSlugs.push(slug);
    }
  }

  const entityBacklinkSlugs = [...entityNames, ...entityRelatedSlugs];
  if (entityBacklinkSlugs.length) {
    await backlinkSummaryEntities(storage, docName, entityBacklinkSlugs);
    await backlinkEntities(storage, docName, entityBacklinkSlugs);
  }

  await updateIndex(storage, docName, conceptNames, {
    docBrief,
    conceptBriefs: conceptBriefsMap,
    docType,
    entityNames,
    entityMeta,
  });
}

export async function compileShortDoc(
  client: LlmClient,
  options: CompileShortDocOptions,
): Promise<void> {
  const config = loadConfig(options.config);
  const { docName, sourceContent, storage } = options;
  const maxConcurrency = options.maxConcurrency ?? config.compileConcurrency;

  const schemaMd = await getAgentsMd(storage);
  const systemMsg = buildSystemMessage(schemaMd, config.language);
  const docMsg = buildDocMessage(docName, sourceContent);

  console.log(`Compiling ${docName}...`);

  const summaryRaw = await llmCall(client, [systemMsg, docMsg], 'summary');
  let docBrief = '';
  let summary = summaryRaw;
  try {
    const parsed = parseJson(summaryRaw) as Record<string, unknown>;
    docBrief = typeof parsed.description === 'string' ? parsed.description : '';
    summary = typeof parsed.content === 'string' ? parsed.content : summaryRaw;
  } catch {
    docBrief = '';
    summary = summaryRaw;
  }

  await compileConcepts(client, storage, systemMsg, docMsg, summary, docName, {
    docBrief,
    docType: 'short',
    entityTypes: config.entityTypes,
    maxConcurrency,
    rewriteSummary: true,
  });

  await appendLog(storage, 'ingest', `Compiled ${docName} from raw/`);
  console.log(`  Done: ${docName}`);
}
