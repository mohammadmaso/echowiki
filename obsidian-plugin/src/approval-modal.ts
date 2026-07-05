import { App, Modal, Notice } from 'obsidian';
import type EchoWikiPlugin from './main';
import type { PendingItem } from './settings';

export class ApprovalModal extends Modal {
  constructor(app: App, private plugin: EchoWikiPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('Pending compilations');
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    const pending = this.plugin.getPendingQueue();

    if (!pending.length) {
      this.contentEl.createEl('p', { text: 'No pending raw files.' });
      return;
    }

    for (const item of pending) {
      const row = this.contentEl.createDiv({ cls: 'echowiki-approval-item' });
      row.createEl('span', { text: item.path });

      const actions = row.createDiv({ cls: 'modal-button-container' });
      const preview = actions.createEl('button', { text: 'Preview' });
      preview.addEventListener('click', () => {
        void this.app.workspace.openLinkText(item.path, item.path);
      });

      const approve = actions.createEl('button', { text: 'Approve', cls: 'mod-cta' });
      approve.addEventListener('click', () => {
        void this.approveItem(item);
      });

      const reject = actions.createEl('button', { text: 'Reject' });
      reject.addEventListener('click', () => {
        void this.rejectItem(item);
      });
    }
  }

  private async approveItem(item: PendingItem): Promise<void> {
    try {
      await this.plugin.compilePendingItem(item.path);
      new Notice(`Compiled ${item.path}`);
      this.render();
    } catch (error) {
      new Notice(`Compile failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async rejectItem(item: PendingItem): Promise<void> {
    await this.plugin.removePendingItem(item.path);
    new Notice(`Skipped ${item.path}`);
    this.render();
  }
}
