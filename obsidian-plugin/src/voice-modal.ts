import { App, Modal, Notice } from 'obsidian';
import type EchoWikiPlugin from './main';

export class VoiceModal extends Modal {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private timerId: number | null = null;
  private statusEl: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private recordButton: HTMLButtonElement | null = null;
  private stopButton: HTMLButtonElement | null = null;

  constructor(app: App, private plugin: EchoWikiPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('Record voice note');
    contentEl.addClass('echowiki-voice-modal');

    this.statusEl = contentEl.createDiv({ cls: 'echowiki-status', text: 'Ready to record' });
    this.timerEl = contentEl.createDiv({ cls: 'echowiki-timer', text: '00:00' });

    const controls = contentEl.createDiv({ cls: 'modal-button-container' });
    this.recordButton = controls.createEl('button', { text: 'Record', cls: 'mod-cta' });
    this.stopButton = controls.createEl('button', { text: 'Stop & transcribe' });
    this.stopButton.disabled = true;

    this.recordButton.addEventListener('click', () => {
      void this.startRecording();
    });
    this.stopButton.addEventListener('click', () => {
      void this.stopRecording();
    });
  }

  onClose(): void {
    void this.cleanup();
    this.contentEl.empty();
  }

  private async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.mediaRecorder.start();
      this.startedAt = Date.now();
      this.statusEl?.setText('Recording...');
      if (this.recordButton) {
        this.recordButton.disabled = true;
      }
      if (this.stopButton) {
        this.stopButton.disabled = false;
      }
      this.timerId = window.setInterval(() => this.updateTimer(), 500);
    } catch (error) {
      new Notice(`Microphone access failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private updateTimer(): void {
    const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    this.timerEl?.setText(`${minutes}:${seconds}`);
  }

  private async stopRecording(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return;
    }

    this.statusEl?.setText('Transcribing...');
    if (this.stopButton) {
      this.stopButton.disabled = true;
    }

    const blob = await new Promise<Blob>((resolve) => {
      this.mediaRecorder!.onstop = () => {
        resolve(new Blob(this.chunks, { type: 'audio/webm' }));
      };
      this.mediaRecorder!.stop();
    });

    await this.cleanup();

    try {
      await this.plugin.saveVoiceTranscript(blob);
      new Notice('Voice note saved to raw/');
      this.close();
    } catch (error) {
      this.statusEl?.setText('Transcription failed');
      if (this.recordButton) {
        this.recordButton.disabled = false;
      }
      new Notice(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.mediaRecorder = null;
  }
}
