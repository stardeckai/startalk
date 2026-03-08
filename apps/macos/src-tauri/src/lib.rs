mod commands;
mod hotkey;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            tray::create_tray(app.handle())?;

            // Set default shortcut and start the modifier monitor
            if let Err(e) = hotkey::set_target_shortcut("Fn+Ctrl") {
                eprintln!("Warning: Failed to set default shortcut: {e}");
            }
            hotkey::start_monitor(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_tray_icon,
            commands::update_shortcut,
            commands::check_accessibility,
        ])
        .run(tauri::generate_context!())
        .expect("error while running StarTalk");
}
