import { create } from 'zustand';
import { DEFAULT_CONFIG, type AppConfig } from '@startalk/core';

interface AppState {
  config: AppConfig;
  isRecording: boolean;
  isProcessing: boolean;
  lastTranscription: string;
  error: string | null;

  setConfig: (config: Partial<AppConfig>) => void;
  setRecording: (recording: boolean) => void;
  setProcessing: (processing: boolean) => void;
  setLastTranscription: (text: string) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  config: { ...DEFAULT_CONFIG },
  isRecording: false,
  isProcessing: false,
  lastTranscription: '',
  error: null,

  setConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),
  setRecording: (isRecording) => set({ isRecording }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setLastTranscription: (lastTranscription) => set({ lastTranscription }),
  setError: (error) => set({ error }),
}));
