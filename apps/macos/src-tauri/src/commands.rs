use std::path::PathBuf;
use tauri::{image::Image, AppHandle, Manager, Runtime};

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

    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {e}"))?;

    let icon_path: PathBuf = resource_path.join("icons").join(icon_name);
    let icon_bytes = std::fs::read(&icon_path)
        .map_err(|e| format!("Failed to read icon {}: {e}", icon_path.display()))?;

    let icon = Image::from_bytes(&icon_bytes)
        .map_err(|e| format!("Failed to decode icon: {e}"))?;

    tray.set_icon(Some(icon))
        .map_err(|e| format!("Failed to set icon: {e}"))
}

#[tauri::command]
pub fn update_shortcut(shortcut: &str) -> Result<(), String> {
    hotkey::set_target_shortcut(shortcut)
}
