use crate::config::{AppConfig, VocabularyEntry};
use serde::{Deserialize, Serialize};

const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT: &str = "\
You are a speech-to-text transcription engine. Transcribe the provided audio.
The audio may contain multiple languages — transcribe each in its original language.
Output ONLY the transcription text, nothing else. No timestamps, no labels, no commentary.

Users may correct themselves, in this case we should omit the corrections cleanly:
- \"This tool uses authentication, no i meant authorization, to do\" -> \"This tool uses authorization to do\"

Remove filler words:
- \"Ok so um this is an example of, like, the...\" -> \"Ok so this is an example of the...\"

Sometimes, the audio spoken will be bilingual, make sure we correctly transcribe each word for each language, make sure technical words are in their original form:
- \"Ok เรากําลังพยายามให้ระบบ authentication เป็นภาษาไทย...\"
When transcribing Thai, make sure all technical terms are in their original English. We do not use Thai technical terms.";

pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
    pub cost: Option<f64>,
}

fn build_prompt(user_prompt: &str, vocabulary: &[VocabularyEntry]) -> String {
    let mut parts: Vec<String> = vec![SYSTEM_PROMPT.to_string()];

    if !vocabulary.is_empty() {
        let known_words: Vec<_> = vocabulary.iter().filter(|v| v.spoken.is_none()).collect();
        let corrections: Vec<_> = vocabulary.iter().filter(|v| v.spoken.is_some()).collect();

        if !known_words.is_empty() {
            let words: Vec<String> = known_words.iter().map(|v| format!("\"{}\"", v.correct)).collect();
            parts.push(format!(
                "The following words/phrases are used frequently — always use this exact spelling: {}",
                words.join(", ")
            ));
        }

        if !corrections.is_empty() {
            let entries: Vec<String> = corrections
                .iter()
                .map(|v| {
                    format!(
                        "\"{}\" → \"{}\"",
                        v.spoken.as_deref().unwrap_or(""),
                        v.correct
                    )
                })
                .collect();
            parts.push(format!(
                "When you hear any of the following words or phrases, use the corrected spelling:\n{}",
                entries.join("\n")
            ));
        }
    }

    if !user_prompt.is_empty() {
        parts.push(user_prompt.to_string());
    }

    parts.join("\n\n")
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: Vec<ContentPart>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum ContentPart {
    #[serde(rename = "input_audio")]
    InputAudio { input_audio: AudioInput },
    #[serde(rename = "text")]
    Text { text: String },
}

#[derive(Serialize)]
struct AudioInput {
    data: String,
    format: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Option<Vec<Choice>>,
    usage: Option<Usage>,
}

#[derive(Deserialize)]
struct Choice {
    message: Option<ChoiceMessage>,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct Usage {
    cost: Option<f64>,
}

pub fn transcribe(
    client: &reqwest::blocking::Client,
    audio_base64: &str,
    config: &AppConfig,
) -> Result<TranscriptionResult, String> {
    let prompt = build_prompt(&config.transcription_prompt, &config.vocabulary);

    let request = ChatRequest {
        model: config.model.clone(),
        messages: vec![Message {
            role: "user".into(),
            content: vec![
                ContentPart::InputAudio {
                    input_audio: AudioInput {
                        data: audio_base64.to_string(),
                        format: "wav".into(),
                    },
                },
                ContentPart::Text { text: prompt },
            ],
        }],
    };

    let start = std::time::Instant::now();

    let response = client
        .post(OPENROUTER_API_URL)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://startalk.app")
        .header("X-Title", "StarTalk")
        .json(&request)
        .send()
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("API error ({status}): {body}"));
    }

    let data: ChatResponse =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {e}"))?;

    let text = data
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.message)
        .and_then(|m| m.content)
        .unwrap_or_default()
        .trim()
        .to_string();

    let cost = data.usage.and_then(|u| u.cost);
    let duration_ms = start.elapsed().as_millis() as u64;

    eprintln!(
        "[StarTalk] Transcription: \"{}\" ({}ms, cost: {:?})",
        text, duration_ms, cost
    );

    Ok(TranscriptionResult {
        text,
        duration_ms,
        cost,
    })
}
