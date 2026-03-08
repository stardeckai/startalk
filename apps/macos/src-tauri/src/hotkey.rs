use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CallbackResult, CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions,
    CGEventTapPlacement, CGEventType,
};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Runtime};

// macOS modifier flags
const FN_FLAG: u64 = 0x0080_0000;
const CTRL_FLAG: u64 = CGEventFlags::CGEventFlagControl.bits();
const ALT_FLAG: u64 = CGEventFlags::CGEventFlagAlternate.bits();
const SHIFT_FLAG: u64 = CGEventFlags::CGEventFlagShift.bits();
const CMD_FLAG: u64 = CGEventFlags::CGEventFlagCommand.bits();

const ALL_MODIFIER_FLAGS: u64 = FN_FLAG | CTRL_FLAG | ALT_FLAG | SHIFT_FLAG | CMD_FLAG;

/// Parse a shortcut string like "Fn+Ctrl" into a bitmask
pub fn parse_shortcut(shortcut: &str) -> Result<u64, String> {
    let mut mask: u64 = 0;
    for part in shortcut.split('+') {
        match part.trim() {
            "Fn" | "fn" | "Function" => mask |= FN_FLAG,
            "Ctrl" | "Control" => mask |= CTRL_FLAG,
            "Alt" | "Option" => mask |= ALT_FLAG,
            "Shift" => mask |= SHIFT_FLAG,
            "Cmd" | "Super" | "Command" | "Meta" => mask |= CMD_FLAG,
            other => return Err(format!("Unknown modifier: {other}")),
        }
    }
    if mask == 0 {
        return Err("No modifiers specified".into());
    }
    Ok(mask)
}

pub fn format_shortcut(mask: u64) -> String {
    let mut parts = Vec::new();
    if mask & FN_FLAG != 0 { parts.push("Fn"); }
    if mask & CTRL_FLAG != 0 { parts.push("Ctrl"); }
    if mask & ALT_FLAG != 0 { parts.push("Alt"); }
    if mask & SHIFT_FLAG != 0 { parts.push("Shift"); }
    if mask & CMD_FLAG != 0 { parts.push("Cmd"); }
    parts.join("+")
}

static TARGET_MASK: AtomicU64 = AtomicU64::new(0);
static IS_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn set_target_shortcut(shortcut: &str) -> Result<(), String> {
    let mask = parse_shortcut(shortcut)?;
    TARGET_MASK.store(mask, Ordering::SeqCst);
    IS_ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn start_monitor<R: Runtime>(app_handle: AppHandle<R>) {
    std::thread::spawn(move || {
        let tap = CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::FlagsChanged],
            move |_proxy, _event_type, event: &CGEvent| {
                let flags = event.get_flags().bits() & ALL_MODIFIER_FLAGS;

                // Always emit current modifier state (for the hotkey recorder UI)
                if flags != 0 {
                    let _ = app_handle.emit("modifiers:changed", format_shortcut(flags));
                } else {
                    let _ = app_handle.emit("modifiers:changed", "");
                }

                // Check if target shortcut is matched
                let target = TARGET_MASK.load(Ordering::SeqCst);
                if target != 0 {
                    let was_active = IS_ACTIVE.load(Ordering::SeqCst);
                    let is_match = (flags & target) == target;

                    if is_match && !was_active {
                        IS_ACTIVE.store(true, Ordering::SeqCst);
                        let _ = app_handle.emit("shortcut:pressed", format_shortcut(target));
                    } else if !is_match && was_active {
                        IS_ACTIVE.store(false, Ordering::SeqCst);
                        let _ = app_handle.emit("shortcut:released", format_shortcut(target));
                    }
                }

                CallbackResult::Keep
            },
        );

        match tap {
            Ok(tap) => {
                unsafe {
                    let source = tap.mach_port().create_runloop_source(0).unwrap();
                    let run_loop = CFRunLoop::get_current();
                    run_loop.add_source(&source, kCFRunLoopCommonModes);
                }
                CFRunLoop::run_current();
            }
            Err(_) => {
                eprintln!("[StarTalk] Failed to create CGEventTap. Grant Accessibility permission in System Settings → Privacy & Security → Accessibility.");
            }
        }
    });
}
