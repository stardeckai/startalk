use cocoa::appkit::{
    NSColor, NSView, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask,
};
use cocoa::base::{id, nil, YES, NO};
use cocoa::foundation::{NSAutoreleasePool, NSPoint, NSRect, NSSize, NSString};
use core_graphics::display::CGDisplay;
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel};
use std::sync::{Mutex, Once};

// Wrapper to make id Send — safe because we only access from main thread via dispatch
struct SendId(id);
unsafe impl Send for SendId {}

static POPOVER_STATE: Mutex<Option<SendId>> = Mutex::new(None);

/// Show a native popover near the given screen coordinates with the translation text.
pub fn show(x: f64, y: f64, original: &str, translated: &str) {
    let original = original.to_string();
    let translated = translated.to_string();
    dispatch_main(move || show_inner(x, y, &original, &translated));
}

fn show_inner(x: f64, y: f64, original: &str, translated: &str) {
    unsafe {
        let _pool = NSAutoreleasePool::new(nil);

        // Dismiss existing popover
        dismiss_inner();

        // Get screen height for coordinate conversion (macOS uses bottom-left origin)
        let screen_height = CGDisplay::main().pixels_high() as f64
            / CGDisplay::main().pixels_wide() as f64
            * CGDisplay::main().pixels_wide() as f64;
        // Actually just get the main display bounds
        let main_display = CGDisplay::main();
        let display_bounds = main_display.bounds();
        let screen_h = display_bounds.size.height;

        let win_w = 340.0;
        let padding = 14.0;
        let spacing = 6.0;
        let header_h = 14.0;
        let orig_h = 16.0;
        let content_w = win_w - padding * 2.0;
        let max_trans_h = 300.0; // cap translated text height

        // Measure translated text height using NSAttributedString boundingRect
        let font_cls = Class::get("NSFont").unwrap();
        let trans_font: id = msg_send![font_cls, boldSystemFontOfSize: 14.0f64];
        let trans_h = measure_text_height(translated, trans_font, content_w).min(max_trans_h).max(20.0);

        // Calculate total window height
        let win_h = padding + trans_h + spacing + orig_h + spacing + header_h + padding;

        // Convert from top-left (CGEvent) to bottom-left (NSWindow) coordinates
        let ns_x = x + 12.0;
        let ns_y = screen_h - y - 12.0 - win_h;

        // Clamp to screen
        let ns_x = ns_x.max(8.0).min(display_bounds.size.width - win_w - 8.0);
        let ns_y = ns_y.max(8.0).min(screen_h - win_h - 8.0);

        let frame = NSRect::new(NSPoint::new(ns_x, ns_y), NSSize::new(win_w, win_h));

        // Create borderless panel
        let panel: id = msg_send![Class::get("NSPanel").unwrap(), alloc];
        let panel: id = msg_send![panel,
            initWithContentRect:frame
            styleMask:NSWindowStyleMask::NSBorderlessWindowMask
            backing:2u64 // NSBackingStoreBuffered
            defer:NO
        ];

        // Non-activating (doesn't steal focus) — set styleMask first since it can reset level
        let _: () = msg_send![panel, setStyleMask:
            NSWindowStyleMask::NSBorderlessWindowMask.bits() | (1u64 << 7) // NSNonactivatingPanel
        ];

        panel.setOpaque_(NO);
        panel.setHasShadow_(YES);

        // Rounded background with vibrancy effect
        let bg_color = NSColor::colorWithSRGBRed_green_blue_alpha_(nil, 0.97, 0.97, 0.97, 0.95);
        panel.setBackgroundColor_(bg_color);

        // Show on all spaces
        panel.setCollectionBehavior_(
            NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
        );

        // Keep visible when app is deactivated (NSPanel hides by default)
        let _: () = msg_send![panel, setHidesOnDeactivate: NO];

        // Set as floating panel and max level AFTER styleMask so they aren't reset
        let _: () = msg_send![panel, setFloatingPanel: YES];
        panel.setLevel_(i32::MAX as i64); // kCGMaximumWindowLevel — above everything

        // Round corners
        let content_view: id = panel.contentView();
        let _: () = msg_send![content_view, setWantsLayer: YES];
        let layer: id = msg_send![content_view, layer];
        let _: () = msg_send![layer, setCornerRadius: 10.0f64];
        let _: () = msg_send![layer, setMasksToBounds: YES];

        // Build content — layout from top to bottom (NSWindow y=0 is bottom)

        // "Translation" header
        let header_frame = NSRect::new(
            NSPoint::new(padding, win_h - padding - header_h),
            NSSize::new(content_w, header_h),
        );
        let header = create_label(header_frame, "Translation", 11.0, false, 0.45);
        content_view.addSubview_(header);

        // Original text (dimmed, single line)
        let orig_y = win_h - padding - header_h - spacing - orig_h;
        let orig_frame = NSRect::new(
            NSPoint::new(padding, orig_y),
            NSSize::new(content_w, orig_h),
        );
        let orig_label = create_label(orig_frame, original, 12.0, false, 0.5);
        let _: () = msg_send![orig_label, setLineBreakMode: 5u64]; // NSLineBreakByTruncatingTail
        content_view.addSubview_(orig_label);

        // Translated text (bold, wrapping)
        let trans_y = padding;
        let trans_frame = NSRect::new(
            NSPoint::new(padding, trans_y),
            NSSize::new(content_w, trans_h),
        );
        let trans_label = create_label(trans_frame, translated, 14.0, true, 0.1);
        let _: () = msg_send![trans_label, setLineBreakMode: 0u64]; // NSLineBreakByWordWrapping
        content_view.addSubview_(trans_label);

        // Close button (X) in top-right corner
        let btn_size = 20.0;
        let btn_frame = NSRect::new(
            NSPoint::new(win_w - btn_size - 8.0, win_h - btn_size - 8.0),
            NSSize::new(btn_size, btn_size),
        );
        let close_btn: id = msg_send![Class::get("NSButton").unwrap(), alloc];
        let close_btn: id = msg_send![close_btn, initWithFrame:btn_frame];
        let _: () = msg_send![close_btn, setBezelStyle: 0i64];
        let _: () = msg_send![close_btn, setBordered: NO];
        let title = NSString::alloc(nil).init_str("\u{2715}"); // ✕
        let _: () = msg_send![close_btn, setTitle: title];
        let btn_font: id = msg_send![font_cls, systemFontOfSize: 12.0f64];
        let _: () = msg_send![close_btn, setFont: btn_font];

        // Set target to our helper class that calls dismiss
        let helper_cls = register_close_helper();
        let helper: id = msg_send![helper_cls, new];
        let _: () = msg_send![close_btn, setTarget: helper];
        let _: () = msg_send![close_btn, setAction: sel!(closePopover:)];
        content_view.addSubview_(close_btn);

        // Show — orderFrontRegardless so it appears even when another app is focused
        let _: () = msg_send![panel, orderFrontRegardless];

        // Store reference for dismissal
        let _: () = msg_send![panel, retain];
        *POPOVER_STATE.lock().unwrap() = Some(SendId(panel));

        // Auto-dismiss after 8 seconds
        let panel_ptr = panel as usize;
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(8));
            dispatch_main(move || {
                let mut state = POPOVER_STATE.lock().unwrap();
                if let Some(ref current) = *state {
                    if current.0 as usize == panel_ptr {
                        unsafe {
                            let _pool = NSAutoreleasePool::new(nil);
                            current.0.orderOut_(nil);
                            let _: () = msg_send![current.0, release];
                        }
                        *state = None;
                    }
                }
            });
        });
    }
}

/// Show a loading popover while translation is in progress.
pub fn show_loading(x: f64, y: f64) {
    dispatch_main(move || show_inner(x, y, "...", "Translating..."));
}

/// Dismiss the popover if visible.
pub fn dismiss() {
    dispatch_main(|| {
        dismiss_inner();
    });
}

fn dismiss_inner() {
    let mut state = POPOVER_STATE.lock().unwrap();
    if let Some(panel) = state.take() {
        unsafe {
            let _pool = NSAutoreleasePool::new(nil);
            panel.0.orderOut_(nil);
            let _: () = msg_send![panel.0, release];
        }
    }
}

unsafe fn create_label(frame: NSRect, text: &str, size: f64, bold: bool, brightness: f64) -> id {
    let ns_text = NSString::alloc(nil).init_str(text);
    let label: id = msg_send![Class::get("NSTextField").unwrap(), alloc];
    let label: id = msg_send![label, initWithFrame:frame];

    // Make it a label (non-editable, no border)
    let _: () = msg_send![label, setEditable: NO];
    let _: () = msg_send![label, setBordered: NO];
    let _: () = msg_send![label, setDrawsBackground: NO];
    let _: () = msg_send![label, setSelectable: NO];
    let _: () = msg_send![label, setStringValue: ns_text];

    // Font
    let font_cls = Class::get("NSFont").unwrap();
    let font: id = if bold {
        msg_send![font_cls, boldSystemFontOfSize: size]
    } else {
        msg_send![font_cls, systemFontOfSize: size]
    };
    let _: () = msg_send![label, setFont: font];

    // Text color
    let color = NSColor::colorWithSRGBRed_green_blue_alpha_(nil, brightness, brightness, brightness, 1.0);
    let _: () = msg_send![label, setTextColor: color];

    label
}

unsafe fn measure_text_height(text: &str, font: id, width: f64) -> f64 {
    let ns_text = NSString::alloc(nil).init_str(text);

    // Create dictionary with font attribute
    let font_key: id = msg_send![Class::get("NSAttributedString").unwrap(), alloc];
    let _ = font_key; // unused, we need NSFontAttributeName
    let font_attr_key = NSString::alloc(nil).init_str("NSFont");
    let attrs: id = msg_send![Class::get("NSDictionary").unwrap(),
        dictionaryWithObject:font forKey:font_attr_key];

    // Create attributed string
    let attr_str: id = msg_send![Class::get("NSAttributedString").unwrap(), alloc];
    let attr_str: id = msg_send![attr_str, initWithString:ns_text attributes:attrs];

    // boundingRectWithSize:options:context: to measure wrapped text height
    let constraint = NSSize::new(width, 10000.0);
    let options: u64 = (1 << 0) | (1 << 1); // NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading
    let bounding: NSRect = msg_send![attr_str, boundingRectWithSize:constraint options:options context:nil];

    let _: () = msg_send![attr_str, release];

    bounding.size.height.ceil()
}

fn register_close_helper() -> &'static Class {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| {
        let superclass = Class::get("NSObject").unwrap();
        let mut decl = ClassDecl::new("STCloseHelper", superclass).unwrap();
        extern "C" fn close_popover(_this: &Object, _cmd: Sel, _sender: id) {
            dismiss_inner();
        }
        unsafe {
            decl.add_method(
                sel!(closePopover:),
                close_popover as extern "C" fn(&Object, Sel, id),
            );
        }
        decl.register();
    });
    Class::get("STCloseHelper").unwrap()
}

fn dispatch_main<F: FnOnce() + Send + 'static>(f: F) {
    use std::os::raw::c_void;

    extern "C" {
        fn dispatch_async_f(queue: *mut c_void, context: *mut c_void, work: extern "C" fn(*mut c_void));
        // dispatch_get_main_queue() is a macro in C; the actual symbol is _dispatch_main_q
        static _dispatch_main_q: c_void;
    }

    extern "C" fn call_closure<F: FnOnce()>(context: *mut c_void) {
        unsafe {
            let f = Box::from_raw(context as *mut F);
            f();
        }
    }

    let context = Box::into_raw(Box::new(f)) as *mut c_void;
    unsafe {
        let main_queue = &_dispatch_main_q as *const c_void as *mut c_void;
        dispatch_async_f(main_queue, context, call_closure::<F>);
    }
}
