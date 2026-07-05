import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type EchoWikiPlugin from './main';
import { isMastraServerInstalled } from './mastra-server-bootstrap';
import { testSttConnection } from './stt-client';

export class EchoWikiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: EchoWikiPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'EchoWiki settings' });

    new Setting(containerEl)
      .setName('Node.js path')
      .setDesc('Path to Node.js ≥ 22 used to run the bundled Mastra server.')
      .addText((text) =>
        text.setValue(this.plugin.settings.nodePath).onChange(async (value) => {
          this.plugin.settings.nodePath = value.trim() || 'node';
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Mastra port')
      .setDesc('Preferred localhost port for the embedded Mastra server.')
      .addText((text) =>
        text.setValue(String(this.plugin.settings.mastraPort)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isNaN(parsed)) {
            this.plugin.settings.mastraPort = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName('Raw folder')
      .setDesc('Folder under the vault root for incoming notes and transcripts.')
      .addText((text) =>
        text.setValue(this.plugin.settings.rawFolder).onChange(async (value) => {
          this.plugin.settings.rawFolder = value.trim() || 'raw';
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Wiki folder')
      .setDesc('Folder under the vault root for compiled wiki output.')
      .addText((text) =>
        text.setValue(this.plugin.settings.wikiFolder).onChange(async (value) => {
          this.plugin.settings.wikiFolder = value.trim() || 'wiki';
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Watch mode')
      .setDesc('Automatically detect new or changed files in raw/.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.watchMode).onChange(async (value) => {
          this.plugin.settings.watchMode = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Require approval')
      .setDesc('Hold new raw files in a pending queue until you approve compilation.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.requireApproval).onChange(async (value) => {
          this.plugin.settings.requireApproval = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl('h3', { text: 'LLM (Mastra server)' });

    new Setting(containerEl)
      .setName('LLM base URL')
      .setDesc('Optional OpenAI-compatible base URL. Leave blank for the default provider.')
      .addText((text) =>
        text.setValue(this.plugin.settings.llmBaseUrl).onChange(async (value) => {
          this.plugin.settings.llmBaseUrl = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('LLM API key')
      .setDesc('Passed to the bundled Mastra server as OPENAI_API_KEY.')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setValue(this.plugin.settings.llmApiKey).onChange(async (value) => {
          this.plugin.settings.llmApiKey = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('LLM model')
      .addText((text) =>
        text.setValue(this.plugin.settings.llmModel).onChange(async (value) => {
          this.plugin.settings.llmModel = value.trim() || 'openai/gpt-5-mini';
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Compilation language')
      .addText((text) =>
        text.setValue(this.plugin.settings.language).onChange(async (value) => {
          this.plugin.settings.language = value.trim() || 'en';
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl('h3', { text: 'Speech-to-text' });

    new Setting(containerEl)
      .setName('STT base URL')
      .addText((text) =>
        text.setValue(this.plugin.settings.sttBaseUrl).onChange(async (value) => {
          this.plugin.settings.sttBaseUrl = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('STT API key')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setValue(this.plugin.settings.sttApiKey).onChange(async (value) => {
          this.plugin.settings.sttApiKey = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('STT model')
      .addText((text) =>
        text.setValue(this.plugin.settings.sttModel).onChange(async (value) => {
          this.plugin.settings.sttModel = value.trim() || 'whisper-1';
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl('h3', { text: 'Server' });

    const backendInstalled = isMastraServerInstalled(this.plugin.getPluginDir());
    new Setting(containerEl)
      .setName('Compiler backend')
      .setDesc(
        backendInstalled
          ? 'Bundled Mastra server is installed in the plugin folder.'
          : 'Required on first install from Community Plugins. Downloads ~180 MB once from GitHub releases.',
      )
      .addButton((button) =>
        button.setButtonText(backendInstalled ? 'Reinstall backend' : 'Install backend').onClick(() => {
          void this.plugin.installCompilerBackend(backendInstalled);
        }),
      );

    new Setting(containerEl)
      .setName('Restart Mastra server')
      .setDesc('Apply LLM settings and relaunch the embedded server.')
      .addButton((button) =>
        button.setButtonText('Restart').onClick(() => {
          void this.plugin.restartServer();
        }),
      );

    new Setting(containerEl)
      .setName('Test Mastra connection')
      .addButton((button) =>
        button.setButtonText('Test').onClick(() => {
          void this.plugin.testMastraConnection();
        }),
      );

    new Setting(containerEl)
      .setName('Test STT connection')
      .addButton((button) =>
        button.setButtonText('Test').onClick(async () => {
          try {
            const text = await testSttConnection(
              this.plugin.settings.sttBaseUrl,
              this.plugin.settings.sttApiKey,
              this.plugin.settings.sttModel,
            );
            new Notice(`STT OK: ${text.slice(0, 80)}`);
          } catch (error) {
            new Notice(`STT failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }),
      );
  }
}
