import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { playStartSound, playStopSound } from '../sounds';
import { useAppStore } from '../store';
import { currentWindowLabel } from '../windowLabel';

/** Listen for recording pipeline events from the Rust backend and update UI state. */
export function useBackendEvents() {
  useEffect(() => {
    if (currentWindowLabel !== 'main') return;

    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<{ state: string }>('recording:state_changed', (event) => {
        const { state } = event.payload;
        const { setRecording, setProcessing } = useAppStore.getState();
        setRecording(state === 'recording');
        setProcessing(state === 'processing');
      }),
    );

    unlisteners.push(
      listen<{ text: string; cost: number | null }>('transcription:complete', (event) => {
        const { setLastTranscription } = useAppStore.getState();
        setLastTranscription(event.payload.text);
      }),
    );

    unlisteners.push(
      listen<{ message: string }>('recording:error', (event) => {
        const { setError } = useAppStore.getState();
        setError(event.payload.message);
      }),
    );

    unlisteners.push(
      listen('sound:start', () => {
        playStartSound();
      }),
    );

    unlisteners.push(
      listen('sound:stop', () => {
        playStopSound();
      }),
    );

    return () => {
      for (const p of unlisteners) {
        p.then((fn) => fn());
      }
    };
  }, []);
}
