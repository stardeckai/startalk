import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { transcribe, blobToBase64, type AudioData } from '@startalk/core';
import { AudioRecorder } from '../recorder';
import { listenForHotkey } from '../hotkey';
import { injectText } from '../injector';
import { setTrayState } from '../tray';
import { useAppStore } from '../store';
import { playStartSound, playStopSound } from '../sounds';
import { saveRecording } from '../db';
import { currentWindowLabel } from '../windowLabel';

const MIN_RECORDING_MS = 1000;

function setPillState(state: 'idle' | 'recording' | 'processing') {
  invoke('set_pill_state', { state });
}

export function useRecordingFlow() {
  const recorder = useRef(new AudioRecorder());
  const recordingStart = useRef<number>(0);
  const config = useAppStore((s) => s.config);
  const setRecording = useAppStore((s) => s.setRecording);
  const setProcessing = useAppStore((s) => s.setProcessing);
  const setLastTranscription = useAppStore((s) => s.setLastTranscription);
  const setError = useAppStore((s) => s.setError);

  useEffect(() => {
    // Only run in the main window
    console.log('[StarTalk][useRecordingFlow] useEffect firing, currentWindowLabel:', currentWindowLabel);
    if (currentWindowLabel !== 'main') {
      console.log('[StarTalk][useRecordingFlow] Skipping — not main window');
      return;
    }

    const handlePressed = async () => {
      console.log('[StarTalk] Hotkey pressed — starting recording, apiKey:', config.apiKey ? `${config.apiKey.slice(0, 8)}...` : '(empty)');
      if (!config.apiKey) {
        setError('Set your OpenRouter API key first.');
        return;
      }
      try {
        setError(null);
        setRecording(true);
        setPillState('recording');
        playStartSound();
        await setTrayState('recording');
        recordingStart.current = Date.now();
        await recorder.current.start();
      } catch (e) {
        setError(`Failed to start recording: ${e}`);
        setRecording(false);
        setPillState('idle');
        await setTrayState('idle');
      }
    };

    const handleReleased = async () => {
      console.log('[StarTalk] Hotkey released');
      if (!recorder.current.isRecording) return;

      const elapsed = Date.now() - recordingStart.current;
      if (elapsed < MIN_RECORDING_MS) {
        try { await recorder.current.stop(); } catch {}
        setRecording(false);
        setPillState('idle');
        await setTrayState('idle');
        return;
      }

      try {
        const recDurationMs = Date.now() - recordingStart.current;
        setRecording(false);
        setProcessing(true);
        setPillState('processing');
        playStopSound();
        await setTrayState('processing');

        const blob = await recorder.current.stop();
        console.log(`[StarTalk] Recorded ${blob.size} bytes (${blob.type}), duration: ${recDurationMs}ms`);

        let t0 = Date.now();
        const base64 = await blobToBase64(blob);
        console.log(`[StarTalk] Base64 encoding: ${Date.now() - t0}ms (${base64.length} chars)`);

        const mediaType = blob.type.startsWith('audio/webm')
          ? 'audio/webm'
          : blob.type.startsWith('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav';

        const audio: AudioData = { base64, mediaType };

        console.log('[StarTalk] Sending to OpenRouter for transcription...');
        t0 = Date.now();
        const result = await transcribe(audio, {
          apiKey: config.apiKey,
          model: config.model,
          prompt: config.transcriptionPrompt,
        });
        console.log(`[StarTalk] Transcription complete: "${result.text}" (API: ${Date.now() - t0}ms, model reported: ${result.durationMs}ms)`);

        if (result.text) {
          setLastTranscription(result.text);
          await injectText(result.text);
          // Save to history
          console.log(`[StarTalk] Saving recording: ${recDurationMs}ms, ${base64.length} chars`);
          try {
            await saveRecording(recDurationMs, result.text, base64, mediaType);
            console.log('[StarTalk] Recording saved to DB');
            await invoke('emit_recording_saved');
          } catch (saveErr) {
            console.error('[StarTalk] Failed to save recording:', saveErr);
          }
        }
      } catch (e) {
        setError(`Transcription failed: ${e}`);
        console.error('[StarTalk] Error:', e);
      } finally {
        setProcessing(false);
        setPillState('idle');
        await setTrayState('idle');
      }
    };

    let unlisten: (() => void) | null = null;

    // Pre-acquire mic so start() is instant (no getUserMedia delay)
    recorder.current.warmup().catch((e) =>
      console.warn('[StarTalk] Mic warmup failed:', e)
    );

    console.log('[StarTalk] Registering hotkey listener');
    listenForHotkey({
      onPressed: handlePressed,
      onReleased: handleReleased,
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
      recorder.current.release();
    };
  }, [config.apiKey, config.model, config.transcriptionPrompt, setRecording, setProcessing, setLastTranscription, setError]);
}
