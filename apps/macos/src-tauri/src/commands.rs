use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{image::Image, AppHandle, Emitter, Manager, Runtime};

use crate::hotkey;

#[tauri::command]
pub fn check_accessibility() -> bool {
    // macOS: AXIsProcessTrusted() checks if the app has accessibility permission
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[tauri::command]
pub fn set_tray_icon<R: Runtime>(app: AppHandle<R>, state: &str) -> Result<(), String> {
    let icon_name = match state {
        "recording" => "tray-recording.png",
        "processing" => "tray-processing.png",
        _ => "tray-idle.png",
    };

    let tray = app.tray_by_id("main").ok_or("Tray not found")?;

    // Try resource dir first (bundled app), then source dir (dev mode)
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {e}"))?;

    let icon_path = resource_path.join("icons").join(icon_name);
    let icon_bytes = std::fs::read(&icon_path).or_else(|_| {
        // Fallback for dev mode: icons are in src-tauri/icons/
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("icons")
            .join(icon_name);
        std::fs::read(&dev_path)
    }).map_err(|e| format!("Failed to read icon {}: {e}", icon_name))?;

    let icon = Image::from_bytes(&icon_bytes)
        .map_err(|e| format!("Failed to decode icon: {e}"))?;

    tray.set_icon(Some(icon))
        .map_err(|e| format!("Failed to set icon: {e}"))
}

#[tauri::command]
pub fn update_shortcut(shortcut: &str) -> Result<(), String> {
    hotkey::set_target_shortcut(shortcut)
}

#[tauri::command]
pub fn set_hotkey_paused(paused: bool) {
    hotkey::set_paused(paused);
}

#[tauri::command]
pub fn set_pill_interactive<R: Runtime>(app: AppHandle<R>, interactive: bool) -> Result<(), String> {
    let pill = app.get_webview_window("pill").ok_or("Pill window not found")?;
    pill.set_ignore_cursor_events(!interactive)
        .map_err(|e| format!("Failed to set cursor events: {e}"))
}

#[tauri::command]
pub fn set_pill_state<R: Runtime>(app: AppHandle<R>, state: &str) -> Result<(), String> {
    app.emit("pill:state", state)
        .map_err(|e| format!("Failed to emit pill state: {e}"))
}

#[tauri::command]
pub fn emit_recording_saved<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.emit("recording:saved", ())
        .map_err(|e| format!("Failed to emit: {e}"))
}

#[tauri::command]
pub async fn proxy_fetch(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut req = match method.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        _ => client.get(&url),
    };
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = req.send().await.map_err(|e| format!("Request failed: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    if status >= 400 {
        return Err(format!("API error ({status}): {text}"));
    }
    Ok(text)
}
