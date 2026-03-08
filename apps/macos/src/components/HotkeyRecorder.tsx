import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface HotkeyRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
}

const DISPLAY_MAP: Record<string, string> = {
  'Fn': 'fn',
  'Ctrl': '\u2303',
  'Alt': '\u2325',
  'Shift': '\u21E7',
  'Cmd': '\u2318',
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
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastModifiers = useRef('');

  useEffect(() => {
    if (!recording) return;

    let cancelled = false;

    const unlisten = listen<string>('modifiers:changed', (event) => {
      if (cancelled) return;
      const mods = event.payload;
      setCurrentModifiers(mods);

      // Clear pending confirm
      if (confirmTimer.current) {
        clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }

      // If modifiers are held, start a confirm timer
      // When they hold steady for 800ms, capture it
      if (mods && mods.includes('+')) {
        lastModifiers.current = mods;
        confirmTimer.current = setTimeout(() => {
          if (!cancelled && lastModifiers.current === mods) {
            setRecording(false);
            onChange(mods);
          }
        }, 800);
      }
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
      if (confirmTimer.current) {
        clearTimeout(confirmTimer.current);
      }
    };
  }, [recording, onChange]);

  return (
    <button
      onClick={() => {
        setRecording(true);
        setCurrentModifiers('');
      }}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: 6,
        border: recording ? '2px solid #007aff' : '1px solid #ccc',
        fontSize: 16,
        background: recording ? '#e8f0fe' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'inherit',
        boxSizing: 'border-box',
        letterSpacing: 2,
      }}
    >
      {recording
        ? currentModifiers
          ? `${displayShortcut(currentModifiers)} — hold to set...`
          : 'Press & hold your shortcut...'
        : displayShortcut(value)}
    </button>
  );
}
