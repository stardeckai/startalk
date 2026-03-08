use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CallbackResult, CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions,
    CGEventTapPlacement, CGEventType,
};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Runtime};

use crate::pipeline::PipelineCommand;

// We use keycodes to distinguish left/right modifiers.
// Each modifier gets its own bit in our custom bitmask.
const GLOBE: u64     = 1 << 0;
const FN: u64        = 1 << 1;
const L_CTRL: u64    = 1 << 2;
const R_CTRL: u64    = 1 << 3;
const L_ALT: u64     = 1 << 4;
const R_ALT: u64     = 1 << 5;
const L_SHIFT: u64   = 1 << 6;
const R_SHIFT: u64   = 1 << 7;
const L_CMD: u64     = 1 << 8;
const R_CMD: u64     = 1 << 9;

// macOS keycodes
const KC_L_CTRL: i64  = 59;
const KC_R_CTRL: i64  = 62;
const KC_L_ALT: i64   = 58;
const KC_R_ALT: i64   = 61;
const KC_L_SHIFT: i64  = 56;
const KC_R_SHIFT: i64  = 60;
const KC_L_CMD: i64   = 55;
const KC_R_CMD: i64   = 54;
const KC_FN: i64      = 63;
const KC_GLOBE: i64   = 179;

// macOS raw flag bits for detecting press vs release
const RAW_FN: u64     = 0x0080_0000;
const RAW_CTRL: u64   = 0x0004_0000;
const RAW_ALT: u64    = 0x0008_0000;
const RAW_SHIFT: u64  = 0x0002_0000;
const RAW_CMD: u64    = 0x0010_0000;

struct ModName {
    bit: u64,
    name: &'static str,
}

const MOD_NAMES: &[ModName] = &[
    ModName { bit: GLOBE,   name: "Globe" },
    ModName { bit: FN,      name: "Fn" },
    ModName { bit: L_CTRL,  name: "LCtrl" },
    ModName { bit: R_CTRL,  name: "RCtrl" },
    ModName { bit: L_ALT,   name: "LAlt" },
    ModName { bit: R_ALT,   name: "RAlt" },
    ModName { bit: L_SHIFT, name: "LShift" },
    ModName { bit: R_SHIFT, name: "RShift" },
    ModName { bit: L_CMD,   name: "LCmd" },
    ModName { bit: R_CMD,   name: "RCmd" },
];

pub fn parse_shortcut(shortcut: &str) -> Result<u64, String> {
    let mut mask: u64 = 0;
    for part in shortcut.split('+') {
        let bit = match part.trim() {
            "Globe" | "globe" => GLOBE,
            "Fn" | "fn" => FN,
            "LCtrl" | "LeftCtrl" => L_CTRL,
            "RCtrl" | "RightCtrl" => R_CTRL,
            "Ctrl" | "Control" => L_CTRL | R_CTRL, // either
            "LAlt" | "LeftAlt" | "LOption" => L_ALT,
            "RAlt" | "RightAlt" | "ROption" => R_ALT,
            "Alt" | "Option" => L_ALT | R_ALT,
            "LShift" | "LeftShift" => L_SHIFT,
            "RShift" | "RightShift" => R_SHIFT,
            "Shift" => L_SHIFT | R_SHIFT,
            "LCmd" | "LeftCmd" => L_CMD,
            "RCmd" | "RightCmd" => R_CMD,
            "Cmd" | "Super" | "Command" | "Meta" => L_CMD | R_CMD,
            other => return Err(format!("Unknown modifier: {other}")),
        };
        mask |= bit;
    }
    if mask == 0 {
        return Err("No modifiers specified".into());
    }
    Ok(mask)
}

pub fn format_shortcut(mask: u64) -> String {
    let mut parts = Vec::new();
    for m in MOD_NAMES {
        if mask & m.bit != 0 {
            parts.push(m.name);
        }
    }
    parts.join("+")
}

static TARGET_MASK: AtomicU64 = AtomicU64::new(0);
static TRANSLATE_MASK: AtomicU64 = AtomicU64::new(0);
static IS_ACTIVE: AtomicBool = AtomicBool::new(false);
static TRANSLATE_ACTIVE: AtomicBool = AtomicBool::new(false);
static PAUSED: AtomicBool = AtomicBool::new(false);
static CURRENT_MODS: AtomicU64 = AtomicU64::new(0);

pub fn set_target_shortcut(shortcut: &str) -> Result<(), String> {
    let mask = parse_shortcut(shortcut)?;
    eprintln!("[StarTalk] set_target_shortcut: \"{}\" -> mask=0b{:b}", shortcut, mask);
    TARGET_MASK.store(mask, Ordering::SeqCst);
    IS_ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn set_translate_shortcut(shortcut: &str) -> Result<(), String> {
    let mask = parse_shortcut(shortcut)?;
    eprintln!("[StarTalk] set_translate_shortcut: \"{}\" -> mask=0b{:b}", shortcut, mask);
    TRANSLATE_MASK.store(mask, Ordering::SeqCst);
    TRANSLATE_ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn set_paused(paused: bool) {
    eprintln!("[StarTalk] set_paused: {}", paused);
    PAUSED.store(paused, Ordering::SeqCst);
    if paused {
        IS_ACTIVE.store(false, Ordering::SeqCst);
    }
}

/// Build modifier bitmask from a FlagsChanged event using keycode + raw flags
fn update_mods_from_flags(keycode: i64, raw_flags: u64) -> u64 {
    let mut mods = CURRENT_MODS.load(Ordering::SeqCst);

    // For each modifier keycode, check if the corresponding raw flag is set
    match keycode {
        KC_L_CTRL  => { if raw_flags & RAW_CTRL != 0  { mods |= L_CTRL; }  else { mods &= !L_CTRL; } }
        KC_R_CTRL  => { if raw_flags & RAW_CTRL != 0  { mods |= R_CTRL; }  else { mods &= !R_CTRL; } }
        KC_L_ALT   => { if raw_flags & RAW_ALT != 0   { mods |= L_ALT; }   else { mods &= !L_ALT; } }
        KC_R_ALT   => { if raw_flags & RAW_ALT != 0   { mods |= R_ALT; }   else { mods &= !R_ALT; } }
        KC_L_SHIFT => { if raw_flags & RAW_SHIFT != 0 { mods |= L_SHIFT; } else { mods &= !L_SHIFT; } }
        KC_R_SHIFT => { if raw_flags & RAW_SHIFT != 0 { mods |= R_SHIFT; } else { mods &= !R_SHIFT; } }
        KC_L_CMD   => { if raw_flags & RAW_CMD != 0   { mods |= L_CMD; }   else { mods &= !L_CMD; } }
        KC_R_CMD   => { if raw_flags & RAW_CMD != 0   { mods |= R_CMD; }   else { mods &= !R_CMD; } }
        KC_FN      => { if raw_flags & RAW_FN != 0    { mods |= FN; }      else { mods &= !(FN | GLOBE); } }
        _ => {}
    }

    CURRENT_MODS.store(mods, Ordering::SeqCst);
    mods
}

pub fn start_monitor<R: Runtime>(app_handle: AppHandle<R>, pipeline_tx: mpsc::Sender<PipelineCommand>) {
    std::thread::spawn(move || {
        let status_handle = app_handle.clone();
        let tap = CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::FlagsChanged, CGEventType::KeyDown, CGEventType::KeyUp],
            move |_proxy, event_type, event: &CGEvent| {
                let raw_flags = event.get_flags().bits();
                let keycode = event.get_integer_value_field(
                    core_graphics::event::EventField::KEYBOARD_EVENT_KEYCODE,
                );

                let mods = match event_type {
                    CGEventType::FlagsChanged => {
                        update_mods_from_flags(keycode, raw_flags)
                    }
                    CGEventType::KeyDown if keycode == KC_GLOBE => {
                        let mut m = CURRENT_MODS.load(Ordering::SeqCst);
                        m |= GLOBE;
                        CURRENT_MODS.store(m, Ordering::SeqCst);
                        m
                    }
                    CGEventType::KeyUp if keycode == KC_GLOBE => {
                        let mut m = CURRENT_MODS.load(Ordering::SeqCst);
                        m &= !GLOBE;
                        CURRENT_MODS.store(m, Ordering::SeqCst);
                        m
                    }
                    _ => {
                        return CallbackResult::Keep;
                    }
                };

                // Emit current modifier state for the recorder UI
                if mods != 0 {
                    let _ = app_handle.emit("modifiers:changed", format_shortcut(mods));
                } else {
                    let _ = app_handle.emit("modifiers:changed", "");
                }

                let paused = PAUSED.load(Ordering::SeqCst);

                // Check if recording shortcut is matched (hold-based)
                let target = TARGET_MASK.load(Ordering::SeqCst);
                if target != 0 {
                    let was_active = IS_ACTIVE.load(Ordering::SeqCst);
                    let is_match = (mods & target) == target;

                    if paused {
                        if is_match {
                            eprintln!("[StarTalk] match ignored (paused), mods=0b{:b} target=0b{:b}", mods, target);
                        }
                    } else if is_match && !was_active {
                        eprintln!("[StarTalk] shortcut:pressed mods=0b{:b} target=0b{:b}", mods, target);
                        IS_ACTIVE.store(true, Ordering::SeqCst);
                        let _ = app_handle.emit("shortcut:pressed", format_shortcut(target));
                        let _ = pipeline_tx.send(PipelineCommand::Start);
                    } else if !is_match && was_active {
                        eprintln!("[StarTalk] shortcut:released mods=0b{:b} target=0b{:b}", mods, target);
                        IS_ACTIVE.store(false, Ordering::SeqCst);
                        let _ = app_handle.emit("shortcut:released", format_shortcut(target));
                        let _ = pipeline_tx.send(PipelineCommand::Stop);
                    }
                }

                // Check if translate shortcut is matched (tap-based, fires once on press)
                let translate = TRANSLATE_MASK.load(Ordering::SeqCst);
                if translate != 0 && !paused {
                    let was_translate_active = TRANSLATE_ACTIVE.load(Ordering::SeqCst);
                    let translate_match = (mods & translate) == translate;

                    if translate_match && !was_translate_active {
                        eprintln!("[StarTalk] translate:triggered mods=0b{:b} target=0b{:b}", mods, translate);
                        TRANSLATE_ACTIVE.store(true, Ordering::SeqCst);
                        let _ = pipeline_tx.send(PipelineCommand::Translate);
                    } else if !translate_match && was_translate_active {
                        TRANSLATE_ACTIVE.store(false, Ordering::SeqCst);
                    }
                }

                CallbackResult::Keep
            },
        );

        match tap {
            Ok(tap) => {
                eprintln!("[StarTalk] CGEventTap created successfully.");
                let _ = status_handle.emit("hotkey:status", "ok");
                unsafe {
                    let source = tap.mach_port().create_runloop_source(0).unwrap();
                    let run_loop = CFRunLoop::get_current();
                    run_loop.add_source(&source, kCFRunLoopCommonModes);
                }
                CFRunLoop::run_current();
            }
            Err(_) => {
                eprintln!("[StarTalk] FAILED to create CGEventTap. Grant Accessibility/Input Monitoring permission.");
                let _ = status_handle.emit("hotkey:status", "failed");
            }
        }
    });
}
