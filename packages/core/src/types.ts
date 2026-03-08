export interface AudioData {
  base64: string;
  mediaType: 'audio/webm' | 'audio/wav' | 'audio/mp4';
}

export interface VocabularyEntry {
  spoken: string;
  correct: string;
}

export interface TranscriptionOptions {
  apiKey: string;
  model?: string;
  language?: string;
  prompt?: string;
  vocabulary?: VocabularyEntry[];
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
}

export type HistoryRetention = '24h' | '3d' | '7d';

export interface AppConfig {
  apiKey: string;
  model: string;
  hotkey: string;
  transcriptionPrompt: string;
  historyRetention: HistoryRetention;
  vocabulary: VocabularyEntry[];
}
