use tauri::{
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
