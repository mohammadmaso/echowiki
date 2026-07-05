import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { MastraClient } from './mastra-client';
import type { EchoWikiPluginSettings, ServerStatus } from './settings';
import { sleep } from './utils';

export interface MastraProcessManagerOptions {
  pluginDir: string;
  pluginDataDir: string;
  vaultRoot: string;
  settings: EchoWikiPluginSettings;
  onStatusChange?: (status: ServerStatus, detail?: string) => void;
}

export class MastraProcessManager {
  private process: ChildProcess | null = null;
  private status: ServerStatus = 'stopped';
  private detail = '';
  private port: number;
  readonly client: MastraClient;

  constructor(private options: MastraProcessManagerOptions) {
    this.port = options.settings.mastraPort;
    this.client = new MastraClient(this.buildBaseUrl(this.port));
  }

  getStatus(): ServerStatus {
    return this.status;
  }

  getDetail(): string {
    return this.detail;
  }

  getPort(): number {
    return this.port;
  }

  updateSettings(settings: EchoWikiPluginSettings): void {
    this.options.settings = settings;
  }

  private buildBaseUrl(port: number): string {
    return `http://127.0.0.1:${port}`;
  }

  private setStatus(status: ServerStatus, detail = ''): void {
    this.status = status;
    this.detail = detail;
    this.options.onStatusChange?.(status, detail);
  }

  private getServerEntry(): string {
    return join(this.options.pluginDir, 'mastra-server', 'index.mjs');
  }

  private buildEnv(port: number): NodeJS.ProcessEnv {
    const { settings, vaultRoot, pluginDataDir } = this.options;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      OPENAI_API_KEY: settings.llmApiKey,
      LLM_MODEL: settings.llmModel,
      MASTRA_TELEMETRY_DISABLED: '1',
      MASTRA_DB_PATH: join(pluginDataDir, 'mastra.db'),
    };
    if (settings.llmBaseUrl.trim()) {
      env.OPENAI_BASE_URL = settings.llmBaseUrl.trim();
    }
    void vaultRoot;
    return env;
  }

  async start(): Promise<boolean> {
    await this.stop();
    this.setStatus('starting', 'Launching Mastra server...');

    const ports = [this.options.settings.mastraPort, ...Array.from({ length: 9 }, (_, i) => 4112 + i)];
    let lastError = 'Unable to start Mastra server';

    for (const port of ports) {
      try {
        const started = await this.tryStartOnPort(port);
        if (started) {
          this.port = port;
          this.client.setBaseUrl(this.buildBaseUrl(port));
          this.setStatus('ready', `Port ${port}`);
          return true;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    this.setStatus('error', lastError);
    return false;
  }

  private async tryStartOnPort(port: number): Promise<boolean> {
    const serverEntry = this.getServerEntry();
    const child = spawn(this.options.settings.nodePath, [serverEntry], {
      cwd: this.options.vaultRoot,
      env: this.buildEnv(port),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process = child;
    let stderr = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });

    child.on('exit', (code) => {
      if (this.process === child) {
        this.process = null;
        if (this.status === 'ready' || this.status === 'starting') {
          this.setStatus('error', code === null ? 'Server exited unexpectedly' : `Server exited (${code})`);
        }
      }
    });

    const ready = await this.client.waitForReady(20_000);
    if (!ready) {
      child.kill('SIGTERM');
      await sleep(300);
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      this.process = null;
      throw new Error(stderr.trim() || `Server did not become ready on port ${port}`);
    }

    return true;
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    if (!child) {
      this.setStatus('stopped');
      return;
    }

    child.kill('SIGTERM');
    await sleep(500);
    if (!child.killed) {
      child.kill('SIGKILL');
    }
    this.setStatus('stopped');
  }

  async restart(): Promise<boolean> {
    return this.start();
  }
}
