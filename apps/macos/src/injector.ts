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

async function switchToEnglishInput(): Promise<string | null> {
  try {
    // Get current input source ID
    const current = await runOsascript(
      'tell application "System Events" to get input source id of current input source',
    );
    // If already English, no switch needed
    if (
      current.includes('ABC') ||
      current.includes('US') ||
      current.includes('British') ||
      current.includes('Australian') ||
      current.includes('English')
    ) {
      return null;
    }
    // Switch to ABC (standard English) input source
    await runOsascript(
      'tell application "System Events" to tell (first input source whose input source id is "com.apple.keylayout.ABC") to select',
    );
    return current;
  } catch {
    return null;
  }
}

async function restoreInputSource(sourceId: string): Promise<void> {
  try {
    await runOsascript(
      `tell application "System Events" to tell (first input source whose input source id is ${escapeForAppleScript(sourceId)}) to select`,
    );
  } catch {
    // Best-effort restore
  }
}

export async function injectText(text: string): Promise<void> {
  // Switch to English input source so Cmd+V works correctly
  const prevInputSource = await switchToEnglishInput();

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
  await runOsascript('tell application "System Events" to keystroke "v" using command down');

  // Restore clipboard and input source after a short delay
  setTimeout(async () => {
    if (prevClipboard) {
      try {
        await runOsascript(`set the clipboard to ${escapeForAppleScript(prevClipboard)}`);
      } catch {
        // Best-effort restore
      }
    }
    if (prevInputSource) {
      await restoreInputSource(prevInputSource);
    }
  }, 300);
}
