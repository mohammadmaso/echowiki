import type { Agent } from '@mastra/core/agent';

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

export async function llmCall(
  agent: Agent,
  messages: LlmMessage[],
  stepName: string,
): Promise<string> {
  console.log(`  ${stepName}...`);
  const result = await agent.generate(messages, {
    toolChoice: 'none',
    maxSteps: 1,
  });
  const text = result.text?.trim() ?? '';
  if (!text) {
    console.warn(`  [WARN] ${stepName} returned empty response`);
  }
  return text;
}

export function parseJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = firstNewline >= 0 ? cleaned.slice(firstNewline + 1) : cleaned.slice(3);
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  const parsed = JSON.parse(cleaned.trim());
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Expected JSON object or array, got ${typeof parsed}`);
  }
  return parsed;
}

export function parsePageJson(text: string): Record<string, unknown> | null {
  const parsed = parseJson(text);
  if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'object' && parsed[0]) {
    return parsed[0] as Record<string, unknown>;
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

export function pageFields(raw: string): {
  brief: string;
  content: string;
  obj: Record<string, unknown> | null;
} {
  try {
    const obj = parsePageJson(raw);
    if (!obj) {
      return { brief: '', content: '', obj: null };
    }
    return {
      brief: typeof obj.description === 'string' ? obj.description : '',
      content: typeof obj.content === 'string' ? obj.content : '',
      obj,
    };
  } catch {
    return { brief: '', content: raw, obj: null };
  }
}

export interface PlanItem {
  name: string;
  title?: string;
  type?: string;
}

export interface ConceptsPlan {
  create: PlanItem[];
  update: PlanItem[];
  related: string[];
}

export interface EntitiesPlan {
  create: PlanItem[];
  update: PlanItem[];
  related: string[];
}

export function filterConceptItems(items: unknown, label: string): PlanItem[] {
  if (!Array.isArray(items)) {
    console.warn(`concepts plan: ${label} was not a list — dropping`);
    return [];
  }
  return items.filter(
    (item): item is PlanItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as PlanItem).name === 'string' &&
      (item as PlanItem).name.trim().length > 0,
  );
}

export function filterRelatedSlugs(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function filterEntityItems(items: unknown, validTypes: Set<string>): PlanItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item): item is PlanItem => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const typed = item as PlanItem;
    if (typeof typed.name !== 'string' || !typed.name.trim()) {
      return false;
    }
    if (typed.type && !validTypes.has(typed.type)) {
      return false;
    }
    return true;
  });
}

export function parseEntitiesPlan(parsed: unknown, validTypes: Set<string>): EntitiesPlan {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { create: [], update: [], related: [] };
  }
  const group =
    typeof (parsed as Record<string, unknown>).entities === 'object' &&
    (parsed as Record<string, unknown>).entities !== null
      ? ((parsed as Record<string, unknown>).entities as Record<string, unknown>)
      : {};
  return {
    create: filterEntityItems(group.create, validTypes),
    update: filterEntityItems(group.update, validTypes),
    related: filterRelatedSlugs(group.related),
  };
}

export function parseConceptsPlan(parsed: unknown): ConceptsPlan {
  if (Array.isArray(parsed)) {
    return { create: filterConceptItems(parsed, 'list'), update: [], related: [] };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { create: [], update: [], related: [] };
  }
  const record = parsed as Record<string, unknown>;
  const group =
    typeof record.concepts === 'object' && record.concepts !== null
      ? (record.concepts as Record<string, unknown>)
      : record;
  return {
    create: filterConceptItems(group.create, 'create'),
    update: filterConceptItems(group.update, 'update'),
    related: filterRelatedSlugs(group.related),
  };
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number,
): Promise<Array<T | Error>> {
  const results: Array<T | Error> = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const current = nextIndex;
      nextIndex += 1;
      try {
        results[current] = await tasks[current]();
      } catch (error) {
        results[current] = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export { runWithConcurrency };
