import { DEFAULT_MODEL, DEFAULT_TRANSCRIPTION_PROMPT } from "./config";
import type {
    AudioData,
    TranscriptionOptions,
    TranscriptionResult,
} from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Allow injecting a custom fetch function (e.g. Rust proxy)
let fetchImpl: typeof globalThis.fetch = globalThis.fetch;

export function setFetchImpl(impl: typeof globalThis.fetch) {
    fetchImpl = impl;
}

export async function transcribe(
    audio: AudioData,
    options: TranscriptionOptions,
): Promise<TranscriptionResult> {
    const model = options.model ?? DEFAULT_MODEL;
    const prompt = options.prompt ?? DEFAULT_TRANSCRIPTION_PROMPT;

    const start = Date.now();

    const response = await fetchImpl(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://startalk.app",
            "X-Title": "StarTalk",
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_audio",
                            input_audio: {
                                data: audio.base64,
                                format: audioFormat(audio.mediaType),
                            },
                        },
                        {
                            type: "text",
                            text: prompt,
                        },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";

    return { text: text.trim(), durationMs: Date.now() - start };
}

function audioFormat(mediaType: string): string {
    const formats: Record<string, string> = {
        "audio/webm": "webm",
        "audio/wav": "wav",
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
    };
    return formats[mediaType] ?? "webm";
}
