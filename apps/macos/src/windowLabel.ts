import { getCurrentWindow } from '@tauri-apps/api/window';

export const currentWindowLabel = getCurrentWindow().label;
console.log('[StarTalk][windowLabel] resolved label:', currentWindowLabel);
