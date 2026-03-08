import { useEffect, useRef } from 'react';
import { transcribe, blobToBase64, type AudioData } from '@startalk/core';
import { AudioRecorder } from '../recorder';
import { listenForHotkey } from '../hotkey';
import { injectText } from '../injector';
import { setTrayState } from '../tray';
import { useAppStore } from '../store';
import { playStartSound, playStopSound } from '../sounds';

const MIN_RECORDING_MS = 300;

export function useRecordingFlow() {
  const recorder = useRef(new AudioRecorder());
  const recordingStart = useRef<number>(0);
  const config = useAppStore((s) => s.config);
  const setRecording = useAppStore((s) => s.setRecording);
  const setProcessing = useAppStore((s) => s.setProcessing);
  const setLastTranscription = useAppStore((s) => s.setLastTranscription);
  const setError = useAppStore((s) => s.setError);

  useEffect(() => {
    const handlePressed = async () => {
      console.log('[StarTalk] Hotkey pressed — starting recording');
      if (!config.apiKey) {
        setError('Set your OpenRouter API key first.');
        return;
      }
      try {
        setError(null);
        setRecording(true);
        playStartSound();
        await setTrayState('recording');
        recordingStart.current = Date.now();
        await recorder.current.start();
      } catch (e) {
        setError(`Failed to start recording: ${e}`);
        setRecording(false);
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
        await setTrayState('idle');
        return;
      }

      try {
        setRecording(false);
        setProcessing(true);
        playStopSound();
        await setTrayState('processing');

        const blob = await recorder.current.stop();
        console.log(`[StarTalk] Recorded ${blob.size} bytes (${blob.type})`);
        const base64 = await blobToBase64(blob);

        const mediaType = blob.type.startsWith('audio/webm')
          ? 'audio/webm'
          : blob.type.startsWith('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav';

        const audio: AudioData = { base64, mediaType };

        console.log('[StarTalk] Sending to OpenRouter for transcription...');
        const result = await transcribe(audio, {
          apiKey: config.apiKey,
          model: config.model,
          prompt: config.transcriptionPrompt,
        });

        console.log(`[StarTalk] Transcription: "${result.text}" (${result.durationMs}ms)`);
        if (result.text) {
          setLastTranscription(result.text);
          await injectText(result.text);
        }
      } catch (e) {
        setError(`Transcription failed: ${e}`);
        console.error('[StarTalk] Error:', e);
      } finally {
        setProcessing(false);
        await setTrayState('idle');
      }
    };

    let unlisten: (() => void) | null = null;

    console.log('[StarTalk] Registering hotkey listener');
    listenForHotkey({
      onPressed: handlePressed,
      onReleased: handleReleased,
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [config.apiKey, config.model, config.transcriptionPrompt, setRecording, setProcessing, setLastTranscription, setError]);
}
