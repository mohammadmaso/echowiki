import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';
import type EchoWikiPlugin from './main';
import { isCompilableRawFile } from './utils';

export class RawWatcher {
  private debounceTimers = new Map<string, number>();

  constructor(
    private app: App,
    private plugin: EchoWikiPlugin,
  ) {}

  attach(): void {
    this.app.vault.on('create', this.handleFileEvent);
    this.app.vault.on('modify', this.handleFileEvent);
  }

  detach(): void {
    this.app.vault.off('create', this.handleFileEvent);
    this.app.vault.off('modify', this.handleFileEvent);
    for (const timer of this.debounceTimers.values()) {
      window.clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private handleFileEvent = (file: TAbstractFile): void => {
    if (!(file instanceof TFile)) {
      return;
    }
    const rawFolder = this.plugin.settings.rawFolder;
    if (!isCompilableRawFile(file.path, rawFolder)) {
      return;
    }
    if (!this.plugin.settings.watchMode) {
      return;
    }

    const existing = this.debounceTimers.get(file.path);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timer = window.setTimeout(() => {
      this.debounceTimers.delete(file.path);
      void this.plugin.handleRawFileDetected(file.path);
    }, 1000);

    this.debounceTimers.set(file.path, timer);
  };
}
