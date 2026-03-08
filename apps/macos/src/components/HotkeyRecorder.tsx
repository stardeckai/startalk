import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface HotkeyRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
}

const DISPLAY_MAP: Record<string, string> = {
  'Globe': '\uD83C\uDF10',
  'Fn': 'fn',
  'LCtrl': 'L\u2303',
  'RCtrl': 'R\u2303',
  'LAlt': 'L\u2325',
  'RAlt': 'R\u2325',
  'LShift': 'L\u21E7',
  'RShift': 'R\u21E7',
  'LCmd': 'L\u2318',
  'RCmd': 'R\u2318',
};

function displayShortcut(shortcut: string): string {
  if (!shortcut) return '(none)';
  return shortcut
    .split('+')
    .map((part) => DISPLAY_MAP[part] ?? part)
    .join(' ');
}

export function HotkeyRecorder({ value, onChange }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [currentModifiers, setCurrentModifiers] = useState('');
  const didCapture = useRef(false);
  const peakMods = useRef('');

  const stopRecording = useCallback(async (newShortcut?: string) => {
    setRecording(false);
    setCurrentModifiers('');
    didCapture.current = false;
    peakMods.current = '';
    if (newShortcut) {
      onChange(newShortcut);
    }
    await invoke('set_hotkey_paused', { paused: false });
  }, [onChange]);

  const startRecording = useCallback(async () => {
    didCapture.current = false;
    peakMods.current = '';
    setRecording(true);
    setCurrentModifiers('');
    await invoke('set_hotkey_paused', { paused: true });
  }, []);

  // Listen for modifier events — track peak state, capture on full release
  useEffect(() => {
    if (!recording) return;

    let cancelled = false;

    const unlisten = listen<string>('modifiers:changed', (event) => {
      if (cancelled || didCapture.current) return;
      const mods = event.payload;
      setCurrentModifiers(mods);

      if (mods) {
        // Track the peak (most modifiers held at once)
        const currentCount = mods.split('+').length;
        const peakCount = peakMods.current ? peakMods.current.split('+').length : 0;
        if (currentCount >= peakCount) {
          peakMods.current = mods;
        }
      } else if (peakMods.current) {
        // All modifiers released — capture the peak combo
        didCapture.current = true;
        stopRecording(peakMods.current);
      }
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [recording, stopRecording]);

  // Escape key / click outside to cancel
  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopRecording();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-hotkey-recorder]')) {
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
      clearTimeout(timer);
    };
  }, [recording, stopRecording]);

  return (
    <div data-hotkey-recorder>
      <button
        onClick={recording ? () => stopRecording() : startRecording}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 'var(--radius)',
          border: recording ? '2px solid var(--primary)' : '1px solid var(--border)',
          fontSize: 16,
          background: recording ? 'var(--muted)' : 'var(--background)',
          color: 'var(--foreground)',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          letterSpacing: 2,
        }}
      >
        {recording
          ? currentModifiers
            ? displayShortcut(currentModifiers)
            : 'Press your combo...'
          : displayShortcut(value)}
      </button>
    </div>
  );
}
