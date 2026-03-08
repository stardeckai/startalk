import type { AppConfig } from "./types";

export const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";
export const DEFAULT_HOTKEY = "Globe";
export const DEFAULT_TRANSCRIPTION_PROMPT =
    "Transcribe this audio exactly as spoken. The audio may contain multiple languages and you must transcribe it exactly. Output only the transcription text, nothing else.";

export const DEFAULT_CONFIG: AppConfig = {
    apiKey: "",
    model: DEFAULT_MODEL,
    hotkey: DEFAULT_HOTKEY,
    transcriptionPrompt: DEFAULT_TRANSCRIPTION_PROMPT,
    historyRetention: "24h",
};
