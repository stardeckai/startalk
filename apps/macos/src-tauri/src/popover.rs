use cocoa::appkit::{NSColor, NSWindow, NSWindowCollectionBehavior};
use cocoa::base::{id, nil};
use core_graphics::display::CGDisplay;
use objc::runtime::{Class, Object};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

extern "C" {
    fn object_setClass(obj: *mut Object, cls: *const Class) -> *const Class;
}

const POPOVER_LABEL: &str = "popover";
const WIN_W: f64 = 380.0;
const WIN_H: f64 = 200.0;

#[derive(Clone, Serialize, Default)]
pub struct PopoverData {
    pub header: String,
    pub original: String,
    pub result: String,
    pub loading: bool,
}

/// Global latest popover data — React reads this on mount via get_popover_data command.
static POPOVER_DATA: Mutex<Option<PopoverData>> = Mutex::new(None);

/// Tauri command: React popover calls this on mount to get initial data.
#[tauri::command]
pub fn get_popover_data() -> Option<PopoverData> {
    POPOVER_DATA.lock().unwrap().clone()
}

/// Show the popover with content near the cursor.
pub fn show<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, header: &str, original: &str, result: &str) {
    let data = PopoverData {
        header: header.to_string(),
        original: original.to_string(),
        result: result.to_string(),
        loading: false,
    };
    *POPOVER_DATA.lock().unwrap() = Some(data.clone());
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        ensure_window_main_thread(&app2, x, y);
        let _ = app2.emit_to(POPOVER_LABEL, "popover:data", &data);
    });
}

/// Show a loading popover while processing.
pub fn show_loading<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) {
    let data = PopoverData {
        header: String::new(),
        original: String::new(),
        result: String::new(),
        loading: true,
    };
    *POPOVER_DATA.lock().unwrap() = Some(data.clone());
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        ensure_window_main_thread(&app2, x, y);
        let _ = app2.emit_to(POPOVER_LABEL, "popover:data", &data);
    });
}

/// Dismiss the popover if visible. Hides instead of closing to avoid
/// crash from Tauri's NSWindow cleanup on the swizzled NSPanel.
pub fn dismiss<R: Runtime>(app: &AppHandle<R>) {
    *POPOVER_DATA.lock().unwrap() = None;
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app2.get_webview_window(POPOVER_LABEL) {
            let _ = win.hide();
        }
    });
}

/// Configure an NSWindow to float above all spaces including fullscreen apps.
///
/// Swizzles the Objective-C class from NSWindow → NSPanel using `object_setClass`
/// so that panel-only features (non-activating, floating, fullscreen auxiliary) work.
/// NSPanel is a subclass of NSWindow with the same ivar layout, so this is safe.
pub unsafe fn configure_overlay_window(ns_win: id) {
    // Swizzle isa from NSWindow → NSPanel via the ObjC runtime
    // This enables panel-only features that are required for fullscreen overlay.
    if let Some(panel_class) = Class::get("NSPanel") {
        object_setClass(ns_win as *mut Object, panel_class);
    }

    let clear = NSColor::clearColor(nil);
    ns_win.setBackgroundColor_(clear);
    ns_win.setOpaque_(cocoa::base::NO);

    ns_win.setCollectionBehavior_(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary,
    );

    ns_win.setLevel_(i32::MAX as i64);

    // Panel-only features — safe after class swizzle to NSPanel
    let style: u64 = msg_send![ns_win, styleMask];
    let _: () = msg_send![ns_win, setStyleMask: style | (1u64 << 7)]; // NSWindowStyleMaskNonactivatingPanel
    let _: () = msg_send![ns_win, setFloatingPanel: cocoa::base::YES];
    let _: () = msg_send![ns_win, setHidesOnDeactivate: cocoa::base::NO];
}

/// Ensure the popover window exists. If it already exists, reposition it.
/// MUST be called on the main thread.
fn ensure_window_main_thread<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) {
    let main_display = CGDisplay::main();
    let display_bounds = main_display.bounds();
    let screen_h = display_bounds.size.height;

    let pos_x = (x + 12.0).max(8.0).min(display_bounds.size.width - WIN_W - 8.0);
    let pos_y = (y + 12.0).max(8.0).min(screen_h - WIN_H - 8.0);

    // If window already exists, just reposition and bring to front
    if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
        let _ = win.set_position(tauri::LogicalPosition::new(pos_x, pos_y));
        let _ = win.show();
        return;
    }

    // Create new window
    let win = match WebviewWindowBuilder::new(
        app,
        POPOVER_LABEL,
        WebviewUrl::App("index.html#popover".into()),
    )
    .title("")
    .inner_size(WIN_W, WIN_H)
    .position(pos_x, pos_y)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(true)
    .build()
    {
        Ok(win) => win,
        Err(e) => {
            eprintln!("[StarTalk] Failed to create popover window: {e}");
            return;
        }
    };

    #[cfg(target_os = "macos")]
    {
        let ns_win: id = win.ns_window().unwrap() as id;
        unsafe {
            configure_overlay_window(ns_win);
        }
    }

    // Hide on focus lost (click outside) — hide instead of close to avoid crash
    let app_handle = app.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            if let Some(w) = app_handle.get_webview_window(POPOVER_LABEL) {
                let _ = w.hide();
            }
        }
    });
}
