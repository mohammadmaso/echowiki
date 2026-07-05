import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type EchoWikiPlugin from './main';
import { testLlmConnection } from './compiler-client';
import { testSttConnection } from './stt-client';

export class EchoWikiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: EchoWikiPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

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

    new Setting(containerEl).setName('LLM').setHeading();

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
      .setDesc('Used for wiki compilation via the Vercel AI SDK.')
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

    new Setting(containerEl).setName('Speech-to-text').setHeading();

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

    new Setting(containerEl).setName('Connection tests').setHeading();

    new Setting(containerEl)
      .setName('Test LLM connection')
      .addButton((button) =>
        button.setButtonText('Test').onClick(async () => {
          try {
            const text = await testLlmConnection(this.plugin.settings);
            new Notice(`LLM OK: ${text.slice(0, 80)}`);
          } catch (error) {
            new Notice(`LLM failed: ${error instanceof Error ? error.message : String(error)}`);
          }
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
