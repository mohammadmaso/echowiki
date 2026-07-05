import {
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from 'obsidian';
import { ApprovalModal } from './approval-modal';
import { runCompileDocument } from './compiler-client';
import { createVaultWikiStorage } from './vault-storage';
import { RawWatcher } from './raw-watcher';
import {
  DEFAULT_PLUGIN_DATA,
  DEFAULT_SETTINGS,
  type CompilerStatus,
  type EchoWikiPluginData,
  type EchoWikiPluginSettings,
  type PendingItem,
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
  rawWatcher: RawWatcher | null = null;
  statusBarItem: HTMLElement | null = null;
  inFlight = new Set<string>();
  lastCompileMessage = '';
  compilerStatus: CompilerStatus = 'ready';

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.ensureVaultFolders();

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar('ready');

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
    this.statusBarItem?.remove();
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

    this.inFlight.add(vaultRelativePath);
    this.compilerStatus = 'compiling';
    this.updateStatusBar('compiling', vaultRelativePath);
    const notice = new Notice(`EchoWiki: compiling ${vaultRelativePath}...`, 0);

    try {
      if (!this.settings.llmApiKey.trim()) {
        throw new Error('LLM API key is not set. Open EchoWiki settings and add your key.');
      }
      if (!this.settings.llmModel.trim()) {
        throw new Error('LLM model is not set. Open EchoWiki settings and choose a model.');
      }

      const file = this.app.vault.getAbstractFileByPath(normalizePath(vaultRelativePath));
      if (!(file instanceof TFile)) {
        throw new Error(`Raw file not found: ${vaultRelativePath}`);
      }
      const sourceContent = await this.app.vault.read(file);
      const docName = docNameFromPath(vaultRelativePath);
      await runCompileDocument({
        docName,
        sourceContent,
        storage: createVaultWikiStorage(this.app, this.settings.wikiFolder),
        llmModel: this.settings.llmModel.trim(),
        llmApiKey: this.settings.llmApiKey.trim(),
        llmBaseUrl: this.settings.llmBaseUrl.trim() || undefined,
        language: this.settings.language.trim() || undefined,
      });
      this.compilerStatus = 'ready';
      this.lastCompileMessage = `Compiled ${docName}`;
      new Notice(`EchoWiki: compiled ${docName}`, 5000);
    } catch (error) {
      this.compilerStatus = 'error';
      this.lastCompileMessage = 'Compile failed';
      throw error;
    } finally {
      notice.hide();
      this.inFlight.delete(vaultRelativePath);
      this.updateStatusBar(this.compilerStatus, this.lastCompileMessage);
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

  updateStatusBar(status: CompilerStatus, detail = ''): void {
    if (!this.statusBarItem) {
      return;
    }
    this.statusBarItem.removeClass('echowiki-status-bar-error', 'echowiki-status-bar-ready');
    let label = 'EchoWiki: ready';
    if (status === 'compiling') {
      label = 'EchoWiki: compiling...';
    } else if (status === 'error') {
      label = `EchoWiki: error${detail ? ` (${detail})` : ''}`;
      this.statusBarItem.addClass('echowiki-status-bar-error');
    } else {
      this.statusBarItem.addClass('echowiki-status-bar-ready');
    }
    if (detail && status === 'ready') {
      label = `${label} · ${detail}`;
    }
    this.statusBarItem.setText(label);
  }
}
