import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface HotkeyHandlers {
  onPressed: () => void;
  onReleased: () => void;
}

export async function listenForHotkey(handlers: HotkeyHandlers): Promise<UnlistenFn> {
  const unlistenPressed = await listen<string>('shortcut:pressed', () => {
    handlers.onPressed();
  });

  const unlistenReleased = await listen<string>('shortcut:released', () => {
    handlers.onReleased();
  });

  return () => {
    unlistenPressed();
    unlistenReleased();
  };
}
