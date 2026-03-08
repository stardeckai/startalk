import type { AppConfig } from "./types";

export const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";
export const DEFAULT_HOTKEY = "Globe";

/** Hardcoded system prompt — always included, not editable by users. */
export const SYSTEM_PROMPT = `\
You are a speech-to-text transcription engine. Transcribe the provided audio exactly as spoken.
The audio may contain multiple languages — transcribe each in its original language.
Output ONLY the transcription text, nothing else. No timestamps, no labels, no commentary.

Users may correct themselves, in this case we should omit the corrections cleanly:
- "Ok so um this is an example of, like, the..." -> "Ok so this is an example of the..."

Sometimes, the audio spoken will be bilingual, make sure we correctly transcribe each word for each language, make sure technical words are in their original form:
- "Ok เรากําลังพยายามให้ระบบ authentication เป็นภาษาไทย..."`;

/** Default user prompt — editable in settings. */
export const DEFAULT_TRANSCRIPTION_PROMPT = "";

export const DEFAULT_CONFIG: AppConfig = {
    apiKey: "",
    model: DEFAULT_MODEL,
    hotkey: DEFAULT_HOTKEY,
    transcriptionPrompt: DEFAULT_TRANSCRIPTION_PROMPT,
    historyRetention: "24h",
    vocabulary: [],
};
