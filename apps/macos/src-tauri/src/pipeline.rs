use std::sync::mpsc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

use crate::config::ConfigState;
use crate::db::Database;
use crate::popover;
use crate::recording::AudioRecorder;
use crate::tray;
use crate::transcription;
use crate::translate;
use crate::injector;

const MIN_RECORDING_MS: u64 = 1000;

#[derive(Debug)]
pub enum PipelineCommand {
    Start,
    Stop,
    TranslatePress,
    TranslateRelease,
}

pub fn spawn_pipeline_thread<R: Runtime + 'static>(
    app: AppHandle<R>,
    config_state: std::sync::Arc<ConfigState>,
    db: std::sync::Arc<Database>,
    rx: mpsc::Receiver<PipelineCommand>,
) {
    std::thread::spawn(move || {
        eprintln!("[StarTalk] Pipeline thread started");
        pipeline_loop(app, config_state, db, rx);
    });
}

fn emit_state<R: Runtime>(app: &AppHandle<R>, state: &str) {
    let _ = app.emit("pill:state", state);
    let _ = app.emit("recording:state_changed", serde_json::json!({ "state": state }));
    tray::update_icon(app, state);
}

fn pipeline_loop<R: Runtime>(
    app: AppHandle<R>,
    config_state: std::sync::Arc<ConfigState>,
    db: std::sync::Arc<Database>,
    rx: mpsc::Receiver<PipelineCommand>,
) {
    let http_client = reqwest::blocking::Client::new();
    let mut recorder: Option<AudioRecorder> = None;
    let mut recording_start: Option<Instant> = None;

    // Ask context — set on TranslatePress, consumed on Stop
    let mut ask_context: Option<String> = None;
    let mut ask_cursor: (f64, f64) = (0.0, 0.0);

    loop {
        let cmd = match rx.recv() {
            Ok(cmd) => cmd,
            Err(_) => {
                eprintln!("[StarTalk] Pipeline channel closed, exiting");
                break;
            }
        };

        match cmd {
            PipelineCommand::Start | PipelineCommand::TranslatePress => {
                if recorder.is_some() {
                    eprintln!("[StarTalk] Already recording, ignoring start");
                    continue;
                }

                let config = config_state.get();
                if config.api_key.is_empty() {
                    let _ = app.emit(
                        "recording:error",
                        serde_json::json!({ "message": "Set your OpenRouter API key first." }),
                    );
                    continue;
                }

                // For translate: grab selected text before starting mic
                if matches!(cmd, PipelineCommand::TranslatePress) {
                    match translate::get_selected_text() {
                        Ok(text) => {
                            eprintln!("[StarTalk] Ask context: \"{}\"", text);
                            ask_cursor = get_cursor_position();
                            ask_context = Some(text);
                        }
                        Err(e) => {
                            eprintln!("[StarTalk] Failed to get selected text: {e}");
                            let _ = app.emit(
                                "recording:error",
                                serde_json::json!({ "message": format!("No text selected: {e}") }),
                            );
                            continue;
                        }
                    }
                }

                // Start acquiring mic
                emit_state(&app, "recording");
                let _ = app.emit("sound:start", ());

                match {
                    let mut r = AudioRecorder::new();
                    r.start().map(|()| r)
                } {
                    Ok(r) => {
                        // Wait 300ms for audio pipeline stabilization
                        std::thread::sleep(std::time::Duration::from_millis(300));

                        // Check if user released during startup
                        match rx.try_recv() {
                            Ok(PipelineCommand::Stop) | Ok(PipelineCommand::TranslateRelease) => {
                                eprintln!("[StarTalk] Released during startup — cancelling");
                                let mut rec = r;
                                let _ = rec.stop();

                                // If translate tap (released quickly), do translation
                                if let Some(context) = ask_context.take() {
                                    let _ = app.emit("sound:stop", ());
                                    emit_state(&app, "processing");
                                    popover::show_loading(&app, ask_cursor.0, ask_cursor.1);
                                    match translate::translate(&http_client, &context, &config) {
                                        Ok(result) => popover::show(&app, ask_cursor.0, ask_cursor.1, "Translation", &context, &result.translated),
                                        Err(e) => popover::show(&app, ask_cursor.0, ask_cursor.1, "Translation", &context, &format!("Error: {e}")),
                                    }
                                }

                                emit_state(&app, "idle");
                                continue;
                            }
                            _ => {}
                        }

                        recorder = Some(r);
                        recording_start = Some(Instant::now());
                        eprintln!("[StarTalk] Recording started");
                    }
                    Err(e) => {
                        eprintln!("[StarTalk] Failed to start recording: {e}");
                        let _ = app.emit(
                            "recording:error",
                            serde_json::json!({ "message": format!("Failed to start recording: {e}") }),
                        );
                        ask_context = None;
                        emit_state(&app, "idle");
                    }
                }
            }
            PipelineCommand::Stop | PipelineCommand::TranslateRelease => {
                let Some(mut rec) = recorder.take() else {
                    continue;
                };
                let Some(start) = recording_start.take() else {
                    continue;
                };

                let elapsed = start.elapsed().as_millis() as u64;
                let context = ask_context.take();

                if elapsed < MIN_RECORDING_MS {
                    eprintln!("[StarTalk] Recording too short ({elapsed}ms), discarding");
                    let _ = rec.stop();

                    // Translate tap: short hold with context → translate
                    if let Some(ctx) = context {
                        let config = config_state.get();
                        let _ = app.emit("sound:stop", ());
                        emit_state(&app, "processing");
                        popover::show_loading(&app, ask_cursor.0, ask_cursor.1);
                        match translate::translate(&http_client, &ctx, &config) {
                            Ok(result) => popover::show(&app, ask_cursor.0, ask_cursor.1, "Translation", &ctx, &result.translated),
                            Err(e) => popover::show(&app, ask_cursor.0, ask_cursor.1, "Translation", &ctx, &format!("Error: {e}")),
                        }
                    }

                    emit_state(&app, "idle");
                    continue;
                }

                // Processing phase
                emit_state(&app, "processing");
                let _ = app.emit("sound:stop", ());

                if let Some(ctx) = context {
                    // Ask mode: transcribe question, then answer
                    match process_ask(&app, &config_state, &http_client, &mut rec, &ctx, ask_cursor) {
                        Ok(_) => {}
                        Err(e) => {
                            eprintln!("[StarTalk] Ask pipeline error: {e}");
                            popover::show(&app, ask_cursor.0, ask_cursor.1, "Error", &ctx, &format!("Error: {e}"));
                        }
                    }
                } else {
                    // Normal mode: transcribe and inject
                    match process_recording(&app, &config_state, &db, &http_client, &mut rec, elapsed) {
                        Ok(_) => {}
                        Err(e) => {
                            eprintln!("[StarTalk] Pipeline error: {e}");
                            let _ = app.emit(
                                "recording:error",
                                serde_json::json!({ "message": format!("Transcription failed: {e}") }),
                            );
                        }
                    }
                }

                emit_state(&app, "idle");
            }
        }
    }
}

fn get_cursor_position() -> (f64, f64) {
    let event = core_graphics::event::CGEvent::new(core_graphics::event_source::CGEventSource::new(
        core_graphics::event_source::CGEventSourceStateID::CombinedSessionState,
    ).unwrap());
    match event {
        Ok(e) => {
            let loc = e.location();
            (loc.x, loc.y)
        }
        Err(_) => (0.0, 0.0),
    }
}

fn process_ask<R: Runtime>(
    app: &AppHandle<R>,
    config_state: &ConfigState,
    http_client: &reqwest::blocking::Client,
    recorder: &mut AudioRecorder,
    context: &str,
    cursor: (f64, f64),
) -> Result<(), String> {
    let audio = recorder.stop()?;
    let config = config_state.get();

    eprintln!(
        "[StarTalk] Ask audio: {}ms, base64 len: {}",
        audio.duration_ms,
        audio.wav_base64.len()
    );

    // Transcribe the voice question
    let question = transcription::transcribe(http_client, &audio.wav_base64, &config)?;

    if question.text.is_empty() {
        eprintln!("[StarTalk] Empty question, falling back to translate");
        popover::show_loading(app, cursor.0, cursor.1);
        match translate::translate(http_client, context, &config) {
            Ok(result) => popover::show(app, cursor.0, cursor.1, "Translation", context, &result.translated),
            Err(e) => popover::show(app, cursor.0, cursor.1, "Translation", context, &format!("Error: {e}")),
        }
        return Ok(());
    }

    eprintln!("[StarTalk] Ask: \"{}\" about \"{}\"", question.text, context);

    // Thinking phase
    emit_state(app, "thinking");
    popover::show_loading(app, cursor.0, cursor.1);

    match translate::ask(http_client, context, &question.text, &config) {
        Ok(answer) => {
            popover::show(app, cursor.0, cursor.1, "Answer", &question.text, &answer.translated);
        }
        Err(e) => {
            popover::show(app, cursor.0, cursor.1, "Answer", &question.text, &format!("Error: {e}"));
        }
    }

    Ok(())
}

fn process_recording<R: Runtime>(
    app: &AppHandle<R>,
    config_state: &ConfigState,
    db: &Database,
    http_client: &reqwest::blocking::Client,
    recorder: &mut AudioRecorder,
    duration_ms: u64,
) -> Result<(), String> {
    // Stop recording and encode to WAV
    let audio = recorder.stop()?;

    eprintln!(
        "[StarTalk] Audio: {}ms, base64 len: {}",
        audio.duration_ms,
        audio.wav_base64.len()
    );

    // Transcribe
    let config = config_state.get();
    let result = transcription::transcribe(http_client, &audio.wav_base64, &config)?;

    if result.text.is_empty() {
        eprintln!("[StarTalk] Empty transcription, skipping injection");
        return Ok(());
    }

    // Emit transcription to frontend
    let _ = app.emit(
        "transcription:complete",
        serde_json::json!({ "text": result.text, "cost": result.cost }),
    );

    // Inject text
    injector::inject_text(&result.text)?;

    // Save to database
    match db.save_recording(
        duration_ms as i64,
        &result.text,
        &audio.wav_base64,
        "audio/wav",
        result.cost,
    ) {
        Ok(_) => {
            eprintln!("[StarTalk] Recording saved to DB");
            let _ = app.emit("recording:saved", ());
            // Clean up old recordings based on retention setting
            let retention = config.history_retention.clone();
            if let Ok(n) = db.cleanup_old_recordings(&retention) {
                if n > 0 {
                    eprintln!("[StarTalk] Cleaned up {n} old recording(s)");
                }
            }
        }
        Err(e) => {
            eprintln!("[StarTalk] Failed to save recording: {e}");
        }
    }

    Ok(())
}
