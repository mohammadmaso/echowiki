import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface CompileDocumentInput {
  docName: string;
  sourcePath: string;
  kbDir: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  language?: string;
}

export interface CompileDocumentResult {
  docName: string;
  status: 'compiled';
}

const WORKFLOW_ID = 'compileDocumentWorkflow';
const COMPILE_TIMEOUT_MS = 10 * 60 * 1000;

interface WorkflowExecutionResponse {
  status?: string;
  result?: unknown;
  error?: unknown;
  steps?: Record<string, { status?: string; error?: { message?: string } }>;
}

function requestUrl(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;
    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    const timeoutMs = options.timeoutMs ?? 30_000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function extractWorkflowError(response: WorkflowExecutionResponse): string {
  if (response.error && typeof response.error === 'object' && response.error !== null) {
    const message = (response.error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  if (response.steps) {
    for (const [stepId, step] of Object.entries(response.steps)) {
      if (step.status === 'failed') {
        const message = step.error?.message;
        return message ? `${stepId}: ${message}` : `Workflow step failed: ${stepId}`;
      }
    }
  }

  return `Workflow finished with status: ${response.status ?? 'unknown'}`;
}

function parseWorkflowResponse(responseBody: string): WorkflowExecutionResponse {
  try {
    return JSON.parse(responseBody) as WorkflowExecutionResponse;
  } catch {
    throw new Error(`Invalid workflow response: ${responseBody.slice(0, 500)}`);
  }
}

export class MastraClient {
  constructor(private baseUrl: string) {}

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async waitForReady(timeoutMs = 30_000, intervalMs = 500): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isHealthy()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { statusCode } = await requestUrl(`${this.baseUrl}/api/workflows`);
      return statusCode >= 200 && statusCode < 300;
    } catch {
      return false;
    }
  }

  async compileDocument(input: CompileDocumentInput): Promise<CompileDocumentResult> {
    const body = JSON.stringify({ inputData: input });
    const { statusCode, body: responseBody } = await requestUrl(
      `${this.baseUrl}/api/workflows/${WORKFLOW_ID}/start-async`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        body,
        timeoutMs: COMPILE_TIMEOUT_MS,
      },
    );

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Compile failed (${statusCode}): ${responseBody.slice(0, 500)}`);
    }

    const parsed = parseWorkflowResponse(responseBody);
    if (parsed.status !== 'success') {
      throw new Error(extractWorkflowError(parsed));
    }

    return { docName: input.docName, status: 'compiled' };
  }
}
