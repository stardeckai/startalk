import { invoke } from '@tauri-apps/api/core';

export type TrayState = 'idle' | 'recording' | 'processing';

export async function setTrayState(state: TrayState): Promise<void> {
  await invoke('set_tray_icon', { state });
}
