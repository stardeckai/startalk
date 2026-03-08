mod commands;
mod hotkey;
mod tray;

#[macro_use]
extern crate objc;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn db_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create recordings table",
        sql: "CREATE TABLE IF NOT EXISTS recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            duration_ms INTEGER NOT NULL,
            transcription TEXT NOT NULL,
            audio_base64 TEXT NOT NULL,
            audio_type TEXT NOT NULL
        )",
        kind: MigrationKind::Up,
    }, Migration {
        version: 2,
        description: "add cost column",
        sql: "ALTER TABLE recordings ADD COLUMN cost REAL",
        kind: MigrationKind::Up,
    }]
}

#[cfg(target_os = "macos")]
fn configure_pill_window(pill: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSColor, NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::{id, nil};

    let ns_win: id = pill.ns_window().unwrap() as id;
    unsafe {
        // Make window background fully transparent
        let clear = NSColor::clearColor(nil);
        ns_win.setBackgroundColor_(clear);
        ns_win.setOpaque_(cocoa::base::NO);
        ns_win.setHasShadow_(cocoa::base::NO);

        // Show on all spaces including fullscreen
        ns_win.setCollectionBehavior_(
            NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
        );

        // kCGMaximumWindowLevel to float above everything including fullscreen
        ns_win.setLevel_(i32::MAX as i64);

        // Accept mouse events without requiring a click to activate first
        ns_win.setAcceptsMouseMovedEvents_(cocoa::base::YES);
        // NSNonactivatingPanelMask — window receives events without becoming key/main
        let style: u64 = msg_send![ns_win, styleMask];
        let _: () = msg_send![ns_win, setStyleMask: style | (1u64 << 7)]; // NSWindowStyleMaskNonactivatingPanel
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:startalk.db", db_migrations())
                .build(),
        )
        .setup(|app| {
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

            // Set default shortcut and start the modifier monitor
            if let Err(e) = hotkey::set_target_shortcut("Globe") {
                eprintln!("Warning: Failed to set default shortcut: {e}");
            }
            hotkey::start_monitor(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_tray_icon,
            commands::update_shortcut,
            commands::check_accessibility,
            commands::set_hotkey_paused,
            commands::set_pill_interactive,
            commands::set_pill_state,
            commands::show_main_window,
            commands::emit_recording_saved,
            commands::proxy_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running StarTalk");
}
