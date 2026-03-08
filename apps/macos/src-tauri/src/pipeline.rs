use std::sync::mpsc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

use crate::config::ConfigState;
use crate::db::Database;
use crate::recording::AudioRecorder;
use crate::tray;
use crate::transcription;
use crate::injector;

const MIN_RECORDING_MS: u64 = 1000;

#[derive(Debug)]
pub enum PipelineCommand {
    Start,
    Stop,
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

    loop {
        let cmd = match rx.recv() {
            Ok(cmd) => cmd,
            Err(_) => {
                eprintln!("[StarTalk] Pipeline channel closed, exiting");
                break;
            }
        };

        match cmd {
            PipelineCommand::Start => {
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
                        if let Ok(PipelineCommand::Stop) = rx.try_recv() {
                            eprintln!("[StarTalk] Released during startup — cancelling");
                            let mut rec = r;
                            let _ = rec.stop();
                            emit_state(&app, "idle");
                            continue;
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
                        emit_state(&app, "idle");
                    }
                }
            }
            PipelineCommand::Stop => {
                let Some(mut rec) = recorder.take() else {
                    continue;
                };
                let Some(start) = recording_start.take() else {
                    continue;
                };

                let elapsed = start.elapsed().as_millis() as u64;
                if elapsed < MIN_RECORDING_MS {
                    eprintln!("[StarTalk] Recording too short ({elapsed}ms), discarding");
                    let _ = rec.stop();
                    emit_state(&app, "idle");
                    continue;
                }

                // Processing phase
                emit_state(&app, "processing");
                let _ = app.emit("sound:stop", ());

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

                emit_state(&app, "idle");
            }
        }
    }
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
