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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  fontSize: 14,
  boxSizing: 'border-box',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export function Settings() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const lastTranscription = useAppStore((s) => s.lastTranscription);
  const error = useAppStore((s) => s.error);
  const isRecording = useAppStore((s) => s.isRecording);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const [hasAccessibility, setHasAccessibility] = useState<boolean | null>(null);

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

  useEffect(() => {
    (async () => {
      const store = await getStore();
      const saved = await store.get<AppConfig>('config');
      if (saved) {
        setConfig(saved);
        if (saved.hotkey) {
          try {
            await invoke('update_shortcut', { shortcut: saved.hotkey });
          } catch (e) {
            console.error('Failed to restore shortcut:', e);
          }
        }
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
          console.log('[Settings] Updating shortcut to:', partial.hotkey);
          await invoke('update_shortcut', { shortcut: partial.hotkey });
          console.log('[Settings] Shortcut updated successfully');
        } catch (e) {
          console.error('[Settings] Failed to update shortcut:', e);
        }
      }
    },
    [setConfig],
  );

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 20, color: 'var(--foreground)' }}>
        StarTalk Settings
      </h1>

      {hasAccessibility === false && (
        <div
          style={{
            padding: 12,
            background: 'oklch(0.6297 0.1361 27.02 / 0.1)',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--destructive)',
            border: '1px solid oklch(0.6297 0.1361 27.02 / 0.2)',
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
            background: isRecording
              ? 'oklch(0.6297 0.1361 159.38 / 0.1)'
              : 'oklch(0.7431 0.0391 258.37 / 0.15)',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 500,
            color: isRecording ? 'var(--success)' : 'var(--accent-blue)',
            border: isRecording
              ? '1px solid oklch(0.6297 0.1361 159.38 / 0.2)'
              : '1px solid oklch(0.7431 0.0391 258.37 / 0.25)',
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
          type="text"
          value={config.apiKey}
          onChange={(e) => updateConfig({ apiKey: e.target.value })}
          placeholder="sk-or-..."
          style={inputStyle}
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
          style={inputStyle}
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
        <small style={{ color: 'var(--muted-foreground)' }}>
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
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {!config.apiKey && (
        <div
          style={{
            padding: 12,
            background: 'oklch(0.6297 0.1361 73.45 / 0.1)',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--warning)',
            border: '1px solid oklch(0.6297 0.1361 73.45 / 0.2)',
          }}
        >
          Enter your OpenRouter API key to start using StarTalk.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            background: 'oklch(0.6297 0.1361 27.02 / 0.1)',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--destructive)',
            border: '1px solid oklch(0.6297 0.1361 27.02 / 0.2)',
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
              background: 'var(--muted)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          >
            {lastTranscription}
          </div>
        </div>
      )}
    </div>
  );
}
