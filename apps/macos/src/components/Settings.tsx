import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';
import { useAppStore } from '../store';
import { HotkeyRecorder } from './HotkeyRecorder';
import type { AppConfig } from '@startalk/core';

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) {
    storePromise = load('settings.json', { defaults: {}, autoSave: true });
  }
  return storePromise;
}

export function Settings() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const lastTranscription = useAppStore((s) => s.lastTranscription);
  const error = useAppStore((s) => s.error);
  const isRecording = useAppStore((s) => s.isRecording);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const [hasAccessibility, setHasAccessibility] = useState<boolean | null>(null);

  // Check accessibility permission on mount and periodically
  useEffect(() => {
    const check = async () => {
      try {
        const result = await invoke<boolean>('check_accessibility');
        setHasAccessibility(result);
      } catch {
        setHasAccessibility(null);
      }
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load saved config on mount
  useEffect(() => {
    (async () => {
      const store = await getStore();
      const saved = await store.get<AppConfig>('config');
      if (saved) {
        setConfig(saved);
      }
    })();
  }, [setConfig]);

  const updateConfig = useCallback(
    async (partial: Partial<AppConfig>) => {
      setConfig(partial);
      const store = await getStore();
      const fullConfig = useAppStore.getState().config;
      await store.set('config', fullConfig);

      if (partial.hotkey) {
        try {
          await invoke('update_shortcut', { shortcut: partial.hotkey });
        } catch (e) {
          console.error('Failed to update shortcut:', e);
        }
      }
    },
    [setConfig],
  );

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 20 }}>StarTalk Settings</h1>

      {hasAccessibility === false && (
        <div
          style={{
            padding: 12,
            background: '#f8d7da',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            color: '#721c24',
          }}
        >
          <strong>Accessibility permission required.</strong> StarTalk needs this to
          detect global hotkeys and type text.
          <br />
          Go to <strong>System Settings → Privacy & Security → Accessibility</strong> and
          enable StarTalk. You may need to restart the app after granting permission.
        </div>
      )}

      {(isRecording || isProcessing) && (
        <div
          style={{
            padding: 12,
            background: isRecording ? '#d4edda' : '#cce5ff',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {isRecording ? 'Recording... release to transcribe' : 'Transcribing...'}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          OpenRouter API Key
        </label>
        <input
          type="password"
          value={config.apiKey}
          onChange={(e) => updateConfig({ apiKey: e.target.value })}
          placeholder="sk-or-..."
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Model
        </label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => updateConfig({ model: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Push-to-Talk Hotkey
        </label>
        <HotkeyRecorder
          value={config.hotkey}
          onChange={(shortcut) => updateConfig({ hotkey: shortcut })}
        />
        <small style={{ color: '#666' }}>
          Click, then hold your desired modifier combo for 1 second.
          {hasAccessibility === false && ' (Requires accessibility permission)'}
        </small>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Transcription Prompt
        </label>
        <textarea
          value={config.transcriptionPrompt}
          onChange={(e) => updateConfig({ transcriptionPrompt: e.target.value })}
          rows={3}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 14,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {!config.apiKey && (
        <div
          style={{
            padding: 12,
            background: '#fff3cd',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          Enter your OpenRouter API key to start using StarTalk.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            background: '#f8d7da',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            color: '#721c24',
          }}
        >
          {error}
        </div>
      )}

      {lastTranscription && (
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Last Transcription
          </label>
          <div
            style={{
              padding: 12,
              background: '#f0f0f0',
              borderRadius: 6,
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            {lastTranscription}
          </div>
        </div>
      )}
    </div>
  );
}
