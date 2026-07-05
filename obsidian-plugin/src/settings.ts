export interface EchoWikiPluginSettings {
  nodePath: string;
  mastraPort: number;
  rawFolder: string;
  wikiFolder: string;
  requireApproval: boolean;
  watchMode: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
  language: string;
}

export interface PendingItem {
  path: string;
  addedAt: number;
}

export interface EchoWikiPluginData {
  pendingQueue: PendingItem[];
}

export const DEFAULT_SETTINGS: EchoWikiPluginSettings = {
  nodePath: 'node',
  mastraPort: 4111,
  rawFolder: 'raw',
  wikiFolder: 'wiki',
  requireApproval: true,
  watchMode: true,
  llmBaseUrl: '',
  llmApiKey: '',
  llmModel: 'openai/gpt-5-mini',
  sttBaseUrl: 'https://api.openai.com/v1',
  sttApiKey: '',
  sttModel: 'whisper-1',
  language: 'en',
};

export const DEFAULT_PLUGIN_DATA: EchoWikiPluginData = {
  pendingQueue: [],
};

export type ServerStatus = 'stopped' | 'starting' | 'ready' | 'error';
