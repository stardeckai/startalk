import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Keyboard } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface HotkeyRecorderProps {
  value: string;
  onChange: (shortcut: string) => void | Promise<void>;
}

const DISPLAY_MAP: Record<string, string> = {
  Globe: '\uD83C\uDF10',
  Fn: 'fn',
  LCtrl: 'L\u2303',
  RCtrl: 'R\u2303',
  LAlt: 'L\u2325',
  RAlt: 'R\u2325',
  LShift: 'L\u21E7',
  RShift: 'R\u21E7',
  LCmd: 'L\u2318',
  RCmd: 'R\u2318',
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

  const stopRecording = useCallback(
    async (newShortcut?: string) => {
      console.log('[HotkeyRecorder] stopRecording, newShortcut:', newShortcut);
      setRecording(false);
      setCurrentModifiers('');
      didCapture.current = false;
      peakMods.current = '';
      if (newShortcut) {
        await Promise.resolve(onChange(newShortcut));
      }
      console.log('[HotkeyRecorder] unpausing hotkey');
      await invoke('set_hotkey_paused', { paused: false });
    },
    [onChange],
  );

  const startRecording = useCallback(async () => {
    console.log('[HotkeyRecorder] startRecording');
    didCapture.current = false;
    peakMods.current = '';
    setRecording(true);
    setCurrentModifiers('');
    await invoke('set_hotkey_paused', { paused: true });
    console.log('[HotkeyRecorder] paused hotkey');
  }, []);

  useEffect(() => {
    if (!recording) return;

    let cancelled = false;

    const unlisten = listen<string>('modifiers:changed', (event) => {
      if (cancelled || didCapture.current) return;
      const mods = event.payload;
      console.log('[HotkeyRecorder] modifiers:changed:', mods);
      setCurrentModifiers(mods);

      if (mods) {
        const currentCount = mods.split('+').length;
        const peakCount = peakMods.current ? peakMods.current.split('+').length : 0;
        if (currentCount >= peakCount) {
          peakMods.current = mods;
        }
      } else if (peakMods.current) {
        didCapture.current = true;
        stopRecording(peakMods.current);
      }
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [recording, stopRecording]);

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
        type="button"
        onClick={recording ? () => stopRecording() : startRecording}
        className={`w-full px-3 py-2 text-base text-left cursor-pointer font-inherit tracking-widest flex items-center gap-2 ${
          recording ? 'border-2 border-primary bg-muted' : 'border border-border bg-background'
        } text-foreground`}
      >
        <Keyboard size={16} className="shrink-0 text-muted-foreground" />
        {recording
          ? currentModifiers
            ? displayShortcut(currentModifiers)
            : 'Press your combo...'
          : displayShortcut(value)}
      </button>
    </div>
  );
}
