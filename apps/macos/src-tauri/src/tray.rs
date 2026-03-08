use std::path::PathBuf;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconEvent,
    AppHandle, Manager, Runtime,
};

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit StarTalk", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &quit])?;

    let tray = app.tray_by_id("main").expect("tray not found");
    tray.set_menu(Some(menu))?;
    tray.set_tooltip(Some("StarTalk"))?;

    tray.on_menu_event(move |app, event| match event.id.as_ref() {
        "settings" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    });

    tray.on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { .. } = event {
            if let Some(window) = tray.app_handle().get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });

    Ok(())
}

/// Update the tray icon to match the given state. Callable from any thread.
pub fn update_icon<R: Runtime>(app: &AppHandle<R>, state: &str) {
    let icon_name = match state {
        "recording" => "tray-recording.png",
        "processing" | "thinking" => "tray-processing.png",
        _ => "tray-idle.png",
    };

    let Some(tray) = app.tray_by_id("main") else {
        return;
    };

    let resource_path = match app.path().resource_dir() {
        Ok(p) => p,
        Err(_) => return,
    };

    let icon_path = resource_path.join("icons").join(icon_name);
    let icon_bytes = std::fs::read(&icon_path).or_else(|_| {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("icons")
            .join(icon_name);
        std::fs::read(&dev_path)
    });

    if let Ok(bytes) = icon_bytes {
        if let Ok(icon) = Image::from_bytes(&bytes) {
            let _ = tray.set_icon(Some(icon));
        }
    }
}
