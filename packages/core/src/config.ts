import type { AppConfig } from './types';

export const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview';
export const DEFAULT_HOTKEY = 'Globe';
export const DEFAULT_ASK_HOTKEY = 'Cmd+Shift';

/** Default user prompt — editable in settings. */
export const DEFAULT_TRANSCRIPTION_PROMPT = '';

// Keep defaults in sync with apps/macos/src-tauri/src/config.rs AppConfig::default()
export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  model: DEFAULT_MODEL,
  hotkey: DEFAULT_HOTKEY,
  askHotkey: DEFAULT_ASK_HOTKEY,
  transcriptionPrompt: DEFAULT_TRANSCRIPTION_PROMPT,
  historyRetention: '24h',
  vocabulary: [],
};
