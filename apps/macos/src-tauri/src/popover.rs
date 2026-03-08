use cocoa::appkit::{NSColor, NSWindow, NSWindowCollectionBehavior};
use cocoa::base::{id, nil};
use core_graphics::display::CGDisplay;
use objc::runtime::{Class, Object};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

extern "C" {
    fn object_setClass(obj: *mut Object, cls: *const Class) -> *const Class;
}

const POPOVER_LABEL: &str = "popover";
const WIN_W: f64 = 380.0;
const WIN_H: f64 = 200.0;

// NSEvent mask constants
const NS_LEFT_MOUSE_DOWN_MASK: u64 = 1 << 1;
const NS_RIGHT_MOUSE_DOWN_MASK: u64 = 1 << 25;

#[derive(Clone, Serialize, Default)]
pub struct PopoverData {
    pub header: String,
    pub original: String,
    pub result: String,
    pub loading: bool,
}

/// Global latest popover data — React reads this on mount via get_popover_data command.
static POPOVER_DATA: Mutex<Option<PopoverData>> = Mutex::new(None);

/// Whether the popover is currently visible. Mirrors `POPOVER_DATA.is_some()` as an
/// AtomicBool to avoid locking the Mutex on every global mouse click in the monitor.
static POPOVER_VISIBLE: AtomicBool = AtomicBool::new(false);

/// Whether the global click monitor has been installed.
static MONITOR_INSTALLED: AtomicBool = AtomicBool::new(false);

/// Update both POPOVER_DATA and POPOVER_VISIBLE atomically.
fn set_popover_state(data: Option<PopoverData>) {
    POPOVER_VISIBLE.store(data.is_some(), Ordering::Relaxed);
    *POPOVER_DATA.lock().unwrap() = data;
}

/// Tauri command: React popover calls this on mount to get initial data.
#[tauri::command]
pub fn get_popover_data() -> Option<PopoverData> {
    POPOVER_DATA.lock().unwrap().clone()
}

/// Tauri command: React popover calls this to dismiss (X button).
#[tauri::command]
pub fn dismiss_popover(app: AppHandle) {
    dismiss(&app);
}

/// Show the popover with content near the cursor.
pub fn show<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    header: &str,
    original: &str,
    result: &str,
) {
    show_inner(
        app,
        x,
        y,
        PopoverData {
            header: header.to_string(),
            original: original.to_string(),
            result: result.to_string(),
            loading: false,
        },
    );
}

/// Show a loading popover while processing.
pub fn show_loading<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) {
    show_inner(
        app,
        x,
        y,
        PopoverData {
            loading: true,
            ..Default::default()
        },
    );
}

fn show_inner<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, data: PopoverData) {
    set_popover_state(Some(data.clone()));
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        ensure_window_main_thread(&app2, x, y);
        let _ = app2.emit_to(POPOVER_LABEL, "popover:data", &data);
    });
}

/// Dismiss the popover if visible. Hides instead of closing to avoid
/// crash from Tauri's NSWindow cleanup on the swizzled NSPanel.
pub fn dismiss<R: Runtime>(app: &AppHandle<R>) {
    set_popover_state(None);
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

    let style: u64 = msg_send![ns_win, styleMask];
    let _: () = msg_send![ns_win, setStyleMask: style | (1u64 << 7)];
    let _: () = msg_send![ns_win, setFloatingPanel: cocoa::base::YES];
    let _: () = msg_send![ns_win, setHidesOnDeactivate: cocoa::base::NO];
}

/// Install a global mouse click monitor that dismisses the popover when
/// clicking outside it. Uses NSEvent addGlobalMonitorForEventsMatchingMask.
/// Installs once and persists for the app lifetime (monitor handle is
/// intentionally leaked since the app is a long-running menu bar process).
fn install_click_outside_monitor<R: Runtime>(app: &AppHandle<R>) {
    if MONITOR_INSTALLED.swap(true, Ordering::Relaxed) {
        return;
    }

    let app2 = app.clone();
    unsafe {
        let mask = NS_LEFT_MOUSE_DOWN_MASK | NS_RIGHT_MOUSE_DOWN_MASK;
        let block = block::ConcreteBlock::new(move |event: id| {
            if !POPOVER_VISIBLE.load(Ordering::Relaxed) {
                return;
            }
            let Some(win) = app2.get_webview_window(POPOVER_LABEL) else {
                return;
            };
            let Ok(size) = win.outer_size() else { return };

            // Global monitor events report locationInWindow in screen coordinates
            // (origin bottom-left). Tauri's outer_position returns physical pixels,
            // and outer_size returns physical pixels, so use NSWindow frame directly
            // to stay in the same coordinate space as the event.
            let ns_win: id = win.ns_window().unwrap() as id;
            let frame: cocoa::foundation::NSRect = msg_send![ns_win, frame];
            let click: cocoa::foundation::NSPoint = msg_send![event, locationInWindow];

            let in_bounds = click.x >= frame.origin.x
                && click.x <= frame.origin.x + frame.size.width
                && click.y >= frame.origin.y
                && click.y <= frame.origin.y + frame.size.height;

            if !in_bounds {
                set_popover_state(None);
                let _ = win.hide();
            }
        });
        let block = block.copy();
        let ns_event_class = Class::get("NSEvent").unwrap();
        let _: id = msg_send![ns_event_class, addGlobalMonitorForEventsMatchingMask: mask handler: &*block];
        std::mem::forget(block);
    }
}

/// Ensure the popover window exists. If it already exists, reposition it.
/// MUST be called on the main thread.
fn ensure_window_main_thread<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) {
    let main_display = CGDisplay::main();
    let display_bounds = main_display.bounds();
    let screen_h = display_bounds.size.height;

    let pos_x = (x + 12.0).max(8.0).min(display_bounds.size.width - WIN_W - 8.0);
    let pos_y = (y + 12.0).max(8.0).min(screen_h - WIN_H - 8.0);

    if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
        let _ = win.set_position(tauri::LogicalPosition::new(pos_x, pos_y));
        let _ = win.show();
        return;
    }

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

    install_click_outside_monitor(app);
}
