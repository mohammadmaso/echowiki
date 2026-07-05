import { join } from 'node:path';
import {
  FileSystemAdapter,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from 'obsidian';
import { ApprovalModal } from './approval-modal';
import { MastraProcessManager } from './mastra-process-manager';
import { RawWatcher } from './raw-watcher';
import {
  DEFAULT_PLUGIN_DATA,
  DEFAULT_SETTINGS,
  type EchoWikiPluginData,
  type EchoWikiPluginSettings,
  type PendingItem,
  type ServerStatus,
} from './settings';
import { EchoWikiSettingTab } from './settings-tab';
import { transcribeAudio } from './stt-client';
import {
  docNameFromPath,
  ensureFolder,
  isCompilableRawFile,
  isRawFile,
  joinVaultPath,
  timestampSlug,
} from './utils';
import { VoiceModal } from './voice-modal';

export default class EchoWikiPlugin extends Plugin {
  settings: EchoWikiPluginSettings = { ...DEFAULT_SETTINGS };
  pluginData: EchoWikiPluginData = { ...DEFAULT_PLUGIN_DATA };
  processManager: MastraProcessManager | null = null;
  rawWatcher: RawWatcher | null = null;
  statusBarItem: HTMLElement | null = null;
  inFlight = new Set<string>();
  lastCompileMessage = '';

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.ensureVaultFolders();

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar('starting');

    this.processManager = new MastraProcessManager({
      pluginDir: this.getPluginDir(),
      pluginDataDir: this.getPluginDataDir(),
      vaultRoot: this.getVaultRoot(),
      settings: this.settings,
      onStatusChange: (status, detail) => this.updateStatusBar(status, detail),
    });

    void this.processManager.start().then((ready) => {
      if (!ready) {
        new Notice('EchoWiki: Mastra server failed to start. Check settings and Node.js.');
      }
    });

    this.rawWatcher = new RawWatcher(this.app, this);
    this.rawWatcher.attach();

    this.addCommand({
      id: 'record-voice-note',
      name: 'Record voice note',
      callback: () => new VoiceModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'send-note-to-raw',
      name: 'Send active note to raw/',
      callback: () => {
        void this.sendActiveNoteToRaw();
      },
    });

    this.addCommand({
      id: 'compile-active-raw-file',
      name: 'Compile active raw file',
      callback: () => {
        void this.compileActiveRawFile();
      },
    });

    this.addCommand({
      id: 'review-pending-compilations',
      name: 'Review pending compilations',
      callback: () => new ApprovalModal(this.app, this).open(),
    });

    this.addRibbonIcon('mic', 'Record voice note', () => {
      new VoiceModal(this.app, this).open();
    });

    this.addSettingTab(new EchoWikiSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.rawWatcher?.detach();
    await this.processManager?.stop();
    this.statusBarItem?.remove();
  }

  getVaultRoot(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    throw new Error('EchoWiki requires the desktop app with a local vault folder.');
  }

  getPluginDir(): string {
    return join(this.getVaultRoot(), this.manifest.dir ?? '.obsidian/plugins/echowiki');
  }

  getPluginDataDir(): string {
    return this.getPluginDir();
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as
      | (Partial<EchoWikiPluginSettings> & Partial<EchoWikiPluginData>)
      | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    this.pluginData = {
      pendingQueue: loaded?.pendingQueue ?? [],
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      ...this.settings,
      pendingQueue: this.pluginData.pendingQueue,
    });
    this.processManager?.updateSettings(this.settings);
  }

  getPendingQueue(): PendingItem[] {
    return [...this.pluginData.pendingQueue];
  }

  async addPendingItem(path: string): Promise<void> {
    if (this.pluginData.pendingQueue.some((item) => item.path === path)) {
      return;
    }
    this.pluginData.pendingQueue.push({ path, addedAt: Date.now() });
    await this.saveSettings();
    new Notice(`EchoWiki: ${path} is pending approval`);
  }

  async removePendingItem(path: string): Promise<void> {
    this.pluginData.pendingQueue = this.pluginData.pendingQueue.filter((item) => item.path !== path);
    await this.saveSettings();
  }

  async handleRawFileDetected(path: string): Promise<void> {
    if (this.inFlight.has(path)) {
      return;
    }
    if (this.settings.requireApproval) {
      await this.addPendingItem(path);
      return;
    }
    await this.compileRawPath(path);
  }

  async compilePendingItem(path: string): Promise<void> {
    await this.compileRawPath(path);
    await this.removePendingItem(path);
  }

  async compileActiveRawFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file to compile.');
      return;
    }
    if (!isCompilableRawFile(file.path, this.settings.rawFolder)) {
      new Notice('Active file is not a compilable raw/ note.');
      return;
    }
    try {
      await this.compileRawPath(file.path);
    } catch (error) {
      new Notice(`EchoWiki compile failed: ${error instanceof Error ? error.message : String(error)}`, 8000);
    }
  }

  async sendActiveNoteToRaw(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file to send to raw/.');
      return;
    }
    const content = await this.app.vault.read(file);
    const slug = docNameFromPath(file.basename);
    const targetPath = joinVaultPath(this.settings.rawFolder, `${slug}.md`);
    if (await this.app.vault.adapter.exists(targetPath)) {
      const stamped = joinVaultPath(this.settings.rawFolder, `${slug}-${timestampSlug()}.md`);
      await this.app.vault.create(stamped, content);
      new Notice(`Saved copy to ${stamped}`);
      return;
    }
    await this.app.vault.create(targetPath, content);
    new Notice(`Saved to ${targetPath}`);
  }

  async saveVoiceTranscript(audio: Blob): Promise<void> {
    const slug = timestampSlug();
    const wavPath = joinVaultPath(this.settings.rawFolder, `${slug}.wav`);
    const arrayBuffer = await audio.arrayBuffer();
    await this.app.vault.createBinary(wavPath, arrayBuffer);

    const transcript = await transcribeAudio(
      this.settings.sttBaseUrl,
      this.settings.sttApiKey,
      this.settings.sttModel,
      audio,
      `${slug}.webm`,
    );

    const mdPath = joinVaultPath(this.settings.rawFolder, `${slug}.transcript.md`);
    await this.app.vault.create(mdPath, `${transcript}\n`);
  }

  async compileRawPath(vaultRelativePath: string): Promise<void> {
    if (this.inFlight.has(vaultRelativePath)) {
      return;
    }
    if (!this.processManager || this.processManager.getStatus() !== 'ready') {
      throw new Error('Mastra server is not ready. Check the status bar or restart the server in settings.');
    }

    this.inFlight.add(vaultRelativePath);
    const notice = new Notice(`EchoWiki: compiling ${vaultRelativePath}...`, 0);

    try {
      if (!this.settings.llmApiKey.trim()) {
        throw new Error('LLM API key is not set. Open EchoWiki settings and add your key.');
      }
      if (!this.settings.llmModel.trim()) {
        throw new Error('LLM model is not set. Open EchoWiki settings and choose a model.');
      }

      const sourcePath = join(this.getVaultRoot(), vaultRelativePath);
      const docName = docNameFromPath(vaultRelativePath);
      await this.processManager.client.compileDocument({
        docName,
        sourcePath,
        kbDir: this.getVaultRoot(),
        llmModel: this.settings.llmModel.trim(),
        llmApiKey: this.settings.llmApiKey.trim(),
        llmBaseUrl: this.settings.llmBaseUrl.trim() || undefined,
        language: this.settings.language.trim() || undefined,
      });
      this.lastCompileMessage = `Compiled ${docName}`;
      new Notice(`EchoWiki: compiled ${docName}`, 5000);
    } catch (error) {
      this.lastCompileMessage = 'Compile failed';
      throw error;
    } finally {
      notice.hide();
      this.inFlight.delete(vaultRelativePath);
      this.updateStatusBar(this.processManager?.getStatus() ?? 'stopped', this.lastCompileMessage);
    }
  }

  async ensureVaultFolders(): Promise<void> {
    const adapter = this.app.vault.adapter;
    await ensureFolder(normalizePath(this.settings.rawFolder), adapter);
    await ensureFolder(normalizePath(this.settings.wikiFolder), adapter);
    await ensureFolder(`${normalizePath(this.settings.wikiFolder)}/summaries`, adapter);
    await ensureFolder(`${normalizePath(this.settings.wikiFolder)}/concepts`, adapter);
    await ensureFolder(`${normalizePath(this.settings.wikiFolder)}/entities`, adapter);
    await ensureFolder(`${normalizePath(this.settings.wikiFolder)}/sources`, adapter);
    await ensureFolder(`${normalizePath(this.settings.wikiFolder)}/reports`, adapter);
  }

  async restartServer(): Promise<void> {
    if (!this.processManager) {
      return;
    }
    this.processManager.updateSettings(this.settings);
    const ready = await this.processManager.restart();
    new Notice(ready ? 'EchoWiki: Mastra server restarted' : 'EchoWiki: Mastra server failed to restart');
  }

  async testMastraConnection(): Promise<void> {
    const ready = this.processManager ? await this.processManager.client.isHealthy() : false;
    new Notice(ready ? 'Mastra connection OK' : 'Mastra connection failed');
  }

  updateStatusBar(status: ServerStatus, detail = ''): void {
    if (!this.statusBarItem) {
      return;
    }
    this.statusBarItem.removeClass('echowiki-status-bar-error', 'echowiki-status-bar-ready');
    const port = this.processManager?.getPort();
    let label = 'EchoWiki: stopped';
    if (status === 'starting') {
      label = 'EchoWiki: starting...';
    } else if (status === 'ready') {
      label = `EchoWiki: ready :${port}`;
      this.statusBarItem.addClass('echowiki-status-bar-ready');
    } else if (status === 'error') {
      label = `EchoWiki: error${detail ? ` (${detail})` : ''}`;
      this.statusBarItem.addClass('echowiki-status-bar-error');
    }
    if (detail && status === 'ready') {
      label = `${label} · ${detail}`;
    }
    this.statusBarItem.setText(label);
  }
}
