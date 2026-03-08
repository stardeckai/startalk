use crate::config::AppConfig;
use serde::{Deserialize, Serialize};
use std::process::Command;

const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

const TRANSLATE_PROMPT: &str = "\
You are a translation engine. Translate the provided text into English.
Output ONLY the translated text, nothing else. No labels, no commentary, no quotation marks.
If the text is already in English, output it unchanged.
Preserve formatting (line breaks, punctuation) from the original.";

pub struct TranslationResult {
    pub original: String,
    pub translated: String,
    pub cost: Option<f64>,
}

/// Get the currently selected text by simulating Cmd+C and reading the clipboard.
pub fn get_selected_text() -> Result<String, String> {
    // Save current clipboard
    let prev_clipboard = run_osascript("the clipboard").unwrap_or_default();

    // Clear clipboard first to detect if copy actually worked
    let _ = run_osascript("set the clipboard to \"\"");

    // Simulate Cmd+C to copy selected text
    run_osascript(
        "tell application \"System Events\" to keystroke \"c\" using command down",
    )?;

    // Small delay for clipboard to update
    std::thread::sleep(std::time::Duration::from_millis(150));

    // Read clipboard
    let selected = run_osascript("the clipboard").unwrap_or_default();

    // Restore previous clipboard
    if !prev_clipboard.is_empty() {
        let escaped = prev_clipboard.replace('\\', "\\\\").replace('"', "\\\"");
        let _ = run_osascript(&format!("set the clipboard to \"{escaped}\""));
    }

    if selected.is_empty() {
        return Err("No text selected".into());
    }

    Ok(selected)
}

fn run_osascript(script: &str) -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("osascript failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn translate(
    client: &reqwest::blocking::Client,
    text: &str,
    config: &AppConfig,
) -> Result<TranslationResult, String> {
    let request = ChatRequest {
        model: config.model.clone(),
        messages: vec![
            Message {
                role: "system".into(),
                content: TRANSLATE_PROMPT.into(),
            },
            Message {
                role: "user".into(),
                content: text.to_string(),
            },
        ],
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

    let translated = data
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.message)
        .and_then(|m| m.content)
        .unwrap_or_default()
        .trim()
        .to_string();

    let cost = data.usage.and_then(|u| u.cost);
    let duration_ms = start.elapsed().as_millis();

    eprintln!(
        "[StarTalk] Translation: \"{}\" → \"{}\" ({}ms, cost: {:?})",
        text, translated, duration_ms, cost
    );

    Ok(TranslationResult {
        original: text.to_string(),
        translated,
        cost,
    })
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
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
