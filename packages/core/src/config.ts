import type { AppConfig } from './types';

export const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview';
export const DEFAULT_HOTKEY = 'Fn+Ctrl';
export const DEFAULT_TRANSCRIPTION_PROMPT =
  'Transcribe this audio exactly as spoken. Output only the transcription text, nothing else.';

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  model: DEFAULT_MODEL,
  hotkey: DEFAULT_HOTKEY,
  transcriptionPrompt: DEFAULT_TRANSCRIPTION_PROMPT,
};
