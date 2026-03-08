use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VocabularyEntry {
    pub spoken: Option<String>,
    pub correct: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub api_key: String,
    pub model: String,
    pub hotkey: String,
    pub ask_hotkey: String,
    pub target_language: String,
    pub transcription_prompt: String,
    pub history_retention: String,
    pub vocabulary: Vec<VocabularyEntry>,
}

// Keep defaults in sync with packages/core/src/config.ts DEFAULT_CONFIG
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "google/gemini-3.1-flash-lite-preview".into(),
            hotkey: "Globe".into(),
            ask_hotkey: "Cmd+Shift".into(),
            target_language: "English".into(),
            transcription_prompt: String::new(),
            history_retention: "24h".into(),
            vocabulary: vec![],
        }
    }
}

pub struct ConfigState(pub Mutex<AppConfig>);

impl ConfigState {
    pub fn new() -> Self {
        Self(Mutex::new(AppConfig::default()))
    }

    pub fn get(&self) -> AppConfig {
        self.0.lock().unwrap().clone()
    }

    pub fn set(&self, config: AppConfig) {
        *self.0.lock().unwrap() = config;
    }
}
