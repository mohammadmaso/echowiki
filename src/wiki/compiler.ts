import fs from 'node:fs';
import path from 'node:path';
import type { Agent } from '@mastra/core/agent';
import type { EchoWikiConfig } from '../config.js';
import { loadConfig, resolvePaths } from '../config.js';
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
import { listExistingWikiTargets, sanitizeSlug, stripGhostWikilinks } from './wikilink.js';

export interface CompileShortDocOptions {
  docName: string;
  sourcePath: string;
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
  agent: Agent,
  wikiDir: string,
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

  const conceptBriefs = readConceptBriefs(wikiDir);
  const entityBriefs = readEntityBriefs(wikiDir);
  const summaryMsg: LlmMessage = { role: 'assistant', content: summary };

  const planRaw = await llmCall(
    agent,
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

  const writeFallbackSummary = () => {
    const fallbackTargets = listExistingWikiTargets(wikiDir);
    fallbackTargets.add(`summaries/${docName}`);
    const { content } = stripGhostWikilinks(summary, fallbackTargets);
    writeSummary(wikiDir, docName, content, { docType, description: docBrief });
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
      writeFallbackSummary();
    }
    updateIndex(wikiDir, docName, [], { docBrief, docType });
    return;
  }

  conceptsPlan.related = conceptsPlan.related.filter((slug) =>
    fs.existsSync(path.join(wikiDir, 'concepts', `${sanitizeSlug(slug)}.md`)),
  );
  entitiesPlan.related = entitiesPlan.related.filter((slug) =>
    fs.existsSync(path.join(wikiDir, 'entities', `${sanitizeSlug(slug)}.md`)),
  );

  const isEmptyPlan =
    !conceptsPlan.create.length &&
    !conceptsPlan.update.length &&
    !conceptsPlan.related.length &&
    !entitiesPlan.create.length &&
    !entitiesPlan.update.length &&
    !entitiesPlan.related.length;

  if (isEmptyPlan) {
    if (rewriteSummary) {
      writeFallbackSummary();
    }
    updateIndex(wikiDir, docName, [], { docBrief, docType });
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
    ...listExistingWikiTargets(wikiDir),
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
      agent,
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
    const conceptPath = path.join(wikiDir, 'concepts', `${sanitizeSlug(name)}.md`);
    let existingContent = '(page not found — create from scratch)';
    if (fs.existsSync(conceptPath)) {
      const rawText = fs.readFileSync(conceptPath, 'utf-8');
      const parts = frontmatter.split(rawText);
      existingContent = parts ? parts.body.trim() : rawText;
    }
    const raw = await llmCall(
      agent,
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
      agent,
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
    const entityPath = path.join(wikiDir, 'entities', `${sanitizeSlug(name)}.md`);
    let existingContent = '(page not found — create from scratch)';
    if (fs.existsSync(entityPath)) {
      const rawText = fs.readFileSync(entityPath, 'utf-8');
      const parts = frontmatter.split(rawText);
      existingContent = parts ? parts.body.trim() : rawText;
    }
    const raw = await llmCall(
      agent,
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
    const isUpdate = fs.existsSync(path.join(wikiDir, 'entities', `${safe}.md`));
    writeEntity(wikiDir, item.name, content, sourceFile, isUpdate, item.brief, item.type);
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
        agent,
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
    writeSummary(wikiDir, docName, finalSummary, { docType, description: docBrief });
  }

  for (const item of pendingWrites) {
    writeConcept(wikiDir, item.name, item.content, sourceFile, item.isUpdate, item.brief);
  }

  const sanitizedRelated = conceptsPlan.related.map(sanitizeSlug);
  for (const slug of sanitizedRelated) {
    addRelatedLink(wikiDir, slug, docName, sourceFile, 'concepts');
  }

  const allConceptSlugs = [...conceptNames, ...sanitizedRelated];
  if (allConceptSlugs.length) {
    backlinkSummary(wikiDir, docName, allConceptSlugs);
    backlinkConcepts(wikiDir, docName, allConceptSlugs);
  }

  const entityRelatedSlugs = entitiesPlan.related
    .map(sanitizeSlug)
    .filter((slug) => addRelatedLink(wikiDir, slug, docName, sourceFile, 'entities'));

  const entityBacklinkSlugs = [...entityNames, ...entityRelatedSlugs];
  if (entityBacklinkSlugs.length) {
    backlinkSummaryEntities(wikiDir, docName, entityBacklinkSlugs);
    backlinkEntities(wikiDir, docName, entityBacklinkSlugs);
  }

  updateIndex(wikiDir, docName, conceptNames, {
    docBrief,
    conceptBriefs: conceptBriefsMap,
    docType,
    entityNames,
    entityMeta,
  });
}

export async function compileShortDoc(
  agent: Agent,
  options: CompileShortDocOptions,
): Promise<void> {
  const config = loadConfig(options.config);
  const { wikiDir } = resolvePaths(config);
  const { docName, sourcePath } = options;
  const maxConcurrency = options.maxConcurrency ?? config.compileConcurrency;

  const schemaMd = getAgentsMd(wikiDir);
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const systemMsg = buildSystemMessage(schemaMd, config.language);
  const docMsg = buildDocMessage(docName, content);

  console.log(`Compiling ${docName}...`);

  const summaryRaw = await llmCall(agent, [systemMsg, docMsg], 'summary');
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

  await compileConcepts(agent, wikiDir, systemMsg, docMsg, summary, docName, {
    docBrief,
    docType: 'short',
    entityTypes: config.entityTypes,
    maxConcurrency,
    rewriteSummary: true,
  });

  appendLog(wikiDir, 'ingest', `Compiled ${docName} from raw/`);
  console.log(`  Done: ${docName}`);
}
