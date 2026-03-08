use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::io::Cursor;
use std::sync::{Arc, Mutex};

pub struct RecordedAudio {
    pub wav_base64: String,
    pub duration_ms: u64,
}

pub struct AudioRecorder {
    samples: Arc<Mutex<Vec<i16>>>,
    stream: Option<cpal::Stream>,
    device_sample_rate: u32,
}

const TARGET_SAMPLE_RATE: u32 = 16_000;

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            stream: None,
            device_sample_rate: 0,
        }
    }

    pub fn start(&mut self) -> Result<(), String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No audio input device found")?;

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get input config: {e}"))?;

        self.device_sample_rate = config.sample_rate().0;
        let channels = config.channels() as usize;
        let samples = self.samples.clone();

        // Clear previous samples
        samples.lock().unwrap().clear();

        let err_fn = |e: cpal::StreamError| {
            eprintln!("[StarTalk] Audio stream error: {e}");
        };

        let stream = match config.sample_format() {
            cpal::SampleFormat::I16 => device
                .build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let mut buf = samples.lock().unwrap();
                        // Take first channel only (mono)
                        for chunk in data.chunks(channels) {
                            buf.push(chunk[0]);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build stream: {e}"))?,
            cpal::SampleFormat::F32 => {
                let samples = self.samples.clone();
                device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            let mut buf = samples.lock().unwrap();
                            for chunk in data.chunks(channels) {
                                // Convert f32 [-1.0, 1.0] to i16
                                let sample = (chunk[0] * 32767.0).clamp(-32768.0, 32767.0) as i16;
                                buf.push(sample);
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to build stream: {e}"))?
            }
            fmt => return Err(format!("Unsupported sample format: {fmt:?}")),
        };

        stream
            .play()
            .map_err(|e| format!("Failed to start stream: {e}"))?;
        self.stream = Some(stream);

        eprintln!("[StarTalk] Audio recording started");
        Ok(())
    }

    pub fn stop(&mut self) -> Result<RecordedAudio, String> {
        // Drop the stream to stop recording
        self.stream.take();

        let raw_samples = std::mem::take(&mut *self.samples.lock().unwrap());
        eprintln!(
            "[StarTalk] Captured {} samples at {}Hz",
            raw_samples.len(),
            self.device_sample_rate
        );

        if raw_samples.is_empty() {
            return Err("No audio captured".into());
        }

        // Downsample to target rate if needed
        let samples = if self.device_sample_rate != TARGET_SAMPLE_RATE {
            downsample(&raw_samples, self.device_sample_rate, TARGET_SAMPLE_RATE)
        } else {
            raw_samples
        };

        let duration_ms =
            (samples.len() as u64 * 1000) / TARGET_SAMPLE_RATE as u64;

        // Encode to WAV
        let wav_bytes = encode_wav(&samples, TARGET_SAMPLE_RATE)?;
        eprintln!(
            "[StarTalk] WAV encoded: {} bytes, {}ms",
            wav_bytes.len(),
            duration_ms
        );

        // Base64 encode
        use base64::Engine;
        let wav_base64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

        Ok(RecordedAudio {
            wav_base64,
            duration_ms,
        })
    }
}

fn downsample(samples: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (samples.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos as usize;
        let frac = src_pos - idx as f64;

        if idx + 1 < samples.len() {
            let s = samples[idx] as f64 * (1.0 - frac) + samples[idx + 1] as f64 * frac;
            output.push(s as i16);
        } else if idx < samples.len() {
            output.push(samples[idx]);
        }
    }

    output
}

fn encode_wav(samples: &[i16], sample_rate: u32) -> Result<Vec<u8>, String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer =
            hound::WavWriter::new(&mut cursor, spec).map_err(|e| format!("WAV writer error: {e}"))?;
        for &s in samples {
            writer
                .write_sample(s)
                .map_err(|e| format!("WAV write error: {e}"))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("WAV finalize error: {e}"))?;
    }

    Ok(cursor.into_inner())
}
