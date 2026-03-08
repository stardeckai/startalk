mod commands;
mod config;
mod db;
mod hotkey;
mod injector;
mod pipeline;
mod popover;
mod recording;
mod transcription;
mod translate;
mod tray;

#[macro_use]
extern crate objc;

use std::sync::Arc;

use tauri::Manager;

#[cfg(target_os = "macos")]
fn configure_pill_window(pill: &tauri::WebviewWindow) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::id;

    let ns_win: id = pill.ns_window().unwrap() as id;
    unsafe {
        popover::configure_overlay_window(ns_win);
        ns_win.setHasShadow_(cocoa::base::NO);
        ns_win.setAcceptsMouseMovedEvents_(cocoa::base::YES);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create shared state
    let config_state = Arc::new(config::ConfigState::new());

    // Create pipeline channel
    let (pipeline_tx, pipeline_rx) = std::sync::mpsc::channel();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(config_state.clone())
        .setup(move |app| {
            tray::create_tray(app.handle())?;

            // Position pill window at bottom center of screen
            if let Some(pill) = app.get_webview_window("pill") {
                if let Some(monitor) = pill.current_monitor().ok().flatten() {
                    let screen = monitor.size();
                    let scale = monitor.scale_factor();
                    let pill_w = 180.0;
                    let pill_h = 60.0;
                    let x = (screen.width as f64 / scale - pill_w) / 2.0;
                    let y = screen.height as f64 / scale - pill_h - 8.0;
                    let _ = pill.set_position(tauri::LogicalPosition::new(x, y));
                }
                #[cfg(target_os = "macos")]
                configure_pill_window(&pill);
            }

            // Minimize main window on close instead of destroying it
            if let Some(main_win) = app.get_webview_window("main") {
                let win = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.minimize();
                    }
                });
            }

            // Initialize database for pipeline
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {e}"))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data dir: {e}"))?;
            let database = Arc::new(
                db::Database::open(&app_data_dir)
                    .map_err(|e| format!("Failed to open database: {e}"))?,
            );

            // Clean up old recordings
            let retention = config_state.get().history_retention.clone();
            match database.cleanup_old_recordings(&retention) {
                Ok(n) if n > 0 => eprintln!("[StarTalk] Cleaned up {n} old recording(s)"),
                _ => {}
            }

            // Spawn pipeline thread
            pipeline::spawn_pipeline_thread(
                app.handle().clone(),
                config_state.clone(),
                database,
                pipeline_rx,
            );

            // Set default shortcuts and start the modifier monitor
            if let Err(e) = hotkey::set_target_shortcut("Globe") {
                eprintln!("Warning: Failed to set default shortcut: {e}");
            }
            if let Err(e) = hotkey::set_ask_shortcut("Cmd+Shift") {
                eprintln!("Warning: Failed to set default ask shortcut: {e}");
            }
            hotkey::start_monitor(app.handle().clone(), pipeline_tx);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::update_shortcut,
            commands::update_config,
            commands::check_accessibility,
            commands::set_hotkey_paused,
            commands::set_pill_interactive,
            commands::set_pill_state,
            commands::show_main_window,
            popover::get_popover_data,
            popover::dismiss_popover,
        ])
        .run(tauri::generate_context!())
        .expect("error while running StarTalk");
}
