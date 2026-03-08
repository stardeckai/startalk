export interface AudioData {
  base64: string;
  mediaType: 'audio/webm' | 'audio/wav' | 'audio/mp4';
}

export interface TranscriptionOptions {
  apiKey: string;
  model?: string;
  language?: string;
  prompt?: string;
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
}

export interface AppConfig {
  apiKey: string;
  model: string;
  hotkey: string;
  transcriptionPrompt: string;
}
