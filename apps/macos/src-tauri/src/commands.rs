use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::config::{AppConfig, ConfigState};
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
pub fn show_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    window.unminimize().map_err(|e| format!("Failed to unminimize window: {e}"))?;
    window.show().map_err(|e| format!("Failed to show window: {e}"))?;
    window.set_focus().map_err(|e| format!("Failed to focus window: {e}"))
}

#[tauri::command]
pub fn update_config(
    state: tauri::State<'_, std::sync::Arc<ConfigState>>,
    config: AppConfig,
) {
    eprintln!("[StarTalk] Config updated from frontend, model: {}", config.model);
    // Update hotkey if it changed
    let current = state.get();
    if current.hotkey != config.hotkey {
        if let Err(e) = hotkey::set_target_shortcut(&config.hotkey) {
            eprintln!("[StarTalk] Failed to update shortcut: {e}");
        }
    }
    state.set(config);
}
