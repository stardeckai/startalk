import { Command } from '@tauri-apps/plugin-shell';

async function runOsascript(script: string): Promise<string> {
  const result = await Command.create('osascript', ['-e', script]).execute();
  if (result.code !== 0) {
    throw new Error(`osascript failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function escapeForAppleScript(str: string): string {
  const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export async function injectText(text: string): Promise<void> {
  // Save current clipboard
  let prevClipboard = '';
  try {
    prevClipboard = await runOsascript('the clipboard');
  } catch {
    // Clipboard might be empty or contain non-text data
  }

  // Set clipboard to transcribed text
  await runOsascript(`set the clipboard to ${escapeForAppleScript(text)}`);

  // Simulate Cmd+V
  await runOsascript(
    'tell application "System Events" to keystroke "v" using command down',
  );

  // Restore clipboard after a short delay
  if (prevClipboard) {
    setTimeout(async () => {
      try {
        await runOsascript(
          `set the clipboard to ${escapeForAppleScript(prevClipboard)}`,
        );
      } catch {
        // Best-effort restore
      }
    }, 300);
  }
}
