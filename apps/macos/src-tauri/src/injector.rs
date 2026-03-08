use std::process::Command;

fn run_osascript(script: &str) -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("osascript failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn escape_for_applescript(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn switch_to_english_input() -> Option<String> {
    let current = run_osascript(
        "tell application \"System Events\" to get input source id of current input source",
    )
    .ok()?;

    if current.contains("ABC")
        || current.contains("US")
        || current.contains("British")
        || current.contains("Australian")
        || current.contains("English")
    {
        return None;
    }

    let _ = run_osascript(
        "tell application \"System Events\" to tell (first input source whose input source id is \"com.apple.keylayout.ABC\") to select",
    );

    Some(current)
}

fn restore_input_source(source_id: &str) {
    let escaped = escape_for_applescript(source_id);
    let _ = run_osascript(&format!(
        "tell application \"System Events\" to tell (first input source whose input source id is {escaped}) to select"
    ));
}

pub fn inject_text(text: &str) -> Result<(), String> {
    eprintln!("[StarTalk] Injecting text: \"{}\"", text);

    // Switch to English input source
    let prev_input_source = switch_to_english_input();

    // Save current clipboard
    let prev_clipboard = run_osascript("the clipboard").unwrap_or_default();

    // Set clipboard to transcribed text
    let escaped = escape_for_applescript(text);
    run_osascript(&format!("set the clipboard to {escaped}"))?;

    // Simulate Cmd+V
    run_osascript("tell application \"System Events\" to keystroke \"v\" using command down")?;

    // Restore clipboard and input source after delay
    std::thread::sleep(std::time::Duration::from_millis(300));

    if !prev_clipboard.is_empty() {
        let escaped_prev = escape_for_applescript(&prev_clipboard);
        let _ = run_osascript(&format!("set the clipboard to {escaped_prev}"));
    }

    if let Some(source_id) = prev_input_source {
        restore_input_source(&source_id);
    }

    Ok(())
}
