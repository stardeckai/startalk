import { type AudioData, blobToBase64, transcribe } from '@startalk/core';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { cleanupOldRecordings, saveRecording } from '../db';
import { listenForHotkey } from '../hotkey';
import { injectText } from '../injector';
import { AudioRecorder } from '../recorder';
import { playStartSound, playStopSound } from '../sounds';
import { useAppStore } from '../store';
import { setTrayState } from '../tray';
import { formatSize } from '../utils/format';
import { currentWindowLabel } from '../windowLabel';

const MIN_RECORDING_MS = 1000;

function setPillState(state: 'idle' | 'recording' | 'processing') {
  invoke('set_pill_state', { state });
}

/** Read current config/actions from store without subscribing (no re-renders). */
function getState() {
  return useAppStore.getState();
}

export function useRecordingFlow() {
  const recorder = useRef(new AudioRecorder());
  const recordingStart = useRef<number>(0);
  const handling = useRef(false);
  const starting = useRef(false);
  const releasedEarly = useRef(false);

  useEffect(() => {
    console.log('[StarTalk][useRecordingFlow] useEffect firing, currentWindowLabel:', currentWindowLabel);
    if (currentWindowLabel !== 'main') {
      console.log('[StarTalk][useRecordingFlow] Skipping — not main window');
      return;
    }

    const handlePressed = async () => {
      const { config, setError, setRecording } = getState();
      console.log(
        '[StarTalk] Hotkey pressed — acquiring mic, apiKey:',
        config.apiKey ? `${config.apiKey.slice(0, 8)}...` : '(empty)',
      );
      if (!config.apiKey) {
        setError('Set your OpenRouter API key first.');
        return;
      }
      try {
        setError(null);
        starting.current = true;
        releasedEarly.current = false;
        await recorder.current.start();
        // Small delay for audio pipeline to stabilize — audio is already being captured
        await new Promise((r) => setTimeout(r, 300));
        starting.current = false;

        // If user released during startup, cancel immediately
        if (releasedEarly.current) {
          console.log('[StarTalk] Released during startup — cancelling');
          try {
            await recorder.current.stop();
          } catch {}
          return;
        }

        playStartSound();
        setRecording(true);
        setPillState('recording');
        await setTrayState('recording');
        recordingStart.current = Date.now();
        console.log('[StarTalk] Recording started');
      } catch (e) {
        starting.current = false;
        setError(`Failed to start recording: ${e}`);
        setRecording(false);
        setPillState('idle');
        await setTrayState('idle');
      }
    };

    const handleReleased = async () => {
      console.log('[StarTalk] Hotkey released');
      // If still acquiring mic, flag early release so handlePressed can cancel
      if (starting.current) {
        console.log('[StarTalk] Released during mic acquisition');
        releasedEarly.current = true;
        return;
      }
      if (!recorder.current.isRecording || handling.current) return;
      handling.current = true;

      const { config, setRecording, setProcessing, setLastTranscription, setError } = getState();

      const elapsed = Date.now() - recordingStart.current;
      if (elapsed < MIN_RECORDING_MS) {
        try {
          await recorder.current.stop();
        } catch {}
        setRecording(false);
        setPillState('idle');
        await setTrayState('idle');
        handling.current = false;
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
        console.log(`[StarTalk] Recorded ${formatSize(blob.size)} (${blob.type}), duration: ${recDurationMs}ms`);

        let t0 = Date.now();
        const base64 = await blobToBase64(blob);
        console.log(`[StarTalk] Base64 encoding: ${Date.now() - t0}ms (${formatSize(base64.length)})`);

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
          vocabulary: config.vocabulary,
        });
        console.log(
          `[StarTalk] Transcription complete: "${result.text}" (API: ${Date.now() - t0}ms, model reported: ${
            result.durationMs
          }ms, cost: ${result.cost != null ? `$${result.cost.toFixed(6)}` : 'n/a'})`,
        );

        if (result.text) {
          setLastTranscription(result.text);
          await injectText(result.text);
          console.log(`[StarTalk] Saving recording: ${recDurationMs}ms, ${base64.length} chars`);
          try {
            await saveRecording(recDurationMs, result.text, base64, mediaType, result.cost);
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
        handling.current = false;
      }
    };

    // Clean up old recordings on startup
    const retention = getState().config.historyRetention ?? '24h';
    cleanupOldRecordings(retention)
      .then((n) => {
        if (n > 0) console.log(`[StarTalk] Cleaned up ${n} old recording(s)`);
      })
      .catch((e) => console.warn('[StarTalk] Cleanup failed:', e));

    console.log('[StarTalk] Registering hotkey listener');
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listenForHotkey({
      onPressed: handlePressed,
      onReleased: handleReleased,
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
      recorder.current.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
