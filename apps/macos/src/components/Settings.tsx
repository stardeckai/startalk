import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';
import { Field } from '@base-ui/react/field';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, ShieldAlert, Mic, Loader, KeyRound, AlertTriangle, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { HotkeyRecorder } from './HotkeyRecorder';
import type { AppConfig, HistoryRetention } from '@startalk/core';
import startalkIcon from '../assets/Startalk.png';

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) {
    storePromise = load('settings.json', { defaults: {}, autoSave: true });
  }
  return storePromise;
}

const retentionOptions = [
  { label: '24 hours', value: '24h' },
  { label: '3 days', value: '3d' },
  { label: '7 days', value: '7d' },
] as const;

const inputClassName = 'w-full px-3 py-2 border border-border text-sm bg-background text-foreground font-inherit outline-none focus:border-primary';

export function Settings() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const lastTranscription = useAppStore((s) => s.lastTranscription);
  const error = useAppStore((s) => s.error);
  const isRecording = useAppStore((s) => s.isRecording);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const [hasAccessibility, setHasAccessibility] = useState<boolean | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const check = async () => {
      try {
        const result = await invoke<boolean>('check_accessibility');
        setHasAccessibility(result);
        if (result && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        setHasAccessibility(null);
      }
    };
    check();
    interval = setInterval(check, 3000);
    return () => { if (interval) clearInterval(interval); };
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
    <div>
      {/* Title block */}
      <div className="border-b border-border px-4 py-4 flex items-center gap-3">
        <img src={startalkIcon} alt="StarTalk" className="h-8 w-auto" />
        <h1 className="text-lg font-light text-foreground">StarTalk</h1>
      </div>

      {/* Alerts — full-bleed borders */}
      {hasAccessibility === false && (
        <div className="flex items-start gap-3 px-4 py-3 text-[13px] text-destructive bg-destructive/10 border-b border-destructive/20">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Accessibility permission required.</strong> StarTalk needs this to
            detect global hotkeys and type text.
            <br />
            Go to <strong>System Settings → Privacy & Security → Accessibility</strong> and
            enable StarTalk. You may need to restart the app after granting permission.
          </div>
        </div>
      )}

      {(isRecording || isProcessing) && (
        <div className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b ${
          isRecording
            ? 'text-success bg-success/10 border-success/20'
            : 'text-accent-blue bg-accent-blue/15 border-accent-blue/25'
        }`}>
          {isRecording ? <Mic size={14} /> : <Loader size={14} className="animate-spin" />}
          {isRecording ? 'Recording... release to transcribe' : 'Transcribing...'}
        </div>
      )}

      {!config.apiKey && (
        <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-warning bg-warning/10 border-b border-warning/20">
          <AlertTriangle size={14} className="shrink-0" />
          Enter your OpenRouter API key to start using StarTalk.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-destructive bg-destructive/10 border-b border-destructive/20">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Form fields */}
      <div className="px-4 py-4 space-y-4">
        <Field.Root>
          <Field.Label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><KeyRound size={13} /> OpenRouter API Key</span>
          </Field.Label>
          <input
            type="text"
            value={config.apiKey}
            onChange={(e) => updateConfig({ apiKey: e.target.value })}
            placeholder="sk-or-..."
            className={inputClassName}
          />
        </Field.Root>

        <Field.Root>
          <Field.Label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">Model</Field.Label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => updateConfig({ model: e.target.value })}
            className={inputClassName}
          />
        </Field.Root>

        <Field.Root>
          <Field.Label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">Push-to-Talk Hotkey</Field.Label>
          <HotkeyRecorder
            value={config.hotkey}
            onChange={(shortcut) => updateConfig({ hotkey: shortcut })}
          />
          <Field.Description className="text-xs text-muted-foreground mt-1.5">
            Click, then hold your desired modifier combo for 1 second.
            {hasAccessibility === false && ' (Requires accessibility permission)'}
          </Field.Description>
        </Field.Root>

        <Field.Root>
          <Field.Label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">History Retention</Field.Label>
          <Select.Root
            value={config.historyRetention ?? '24h'}
            onValueChange={(val) => updateConfig({ historyRetention: val as HistoryRetention })}
          >
            <Select.Trigger className={`${inputClassName} flex items-center justify-between cursor-pointer`}>
              <Select.Value placeholder="Select..." />
              <Select.Icon><ChevronDown size={14} /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={4}>
                <Select.Popup className="select-popup">
                  <Select.List>
                    {retentionOptions.map(({ label, value }) => (
                      <Select.Item
                        key={value}
                        value={value}
                        className="flex items-center gap-2 px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-muted"
                      >
                        <Select.ItemIndicator className="w-4 flex items-center justify-center">
                          <Check size={12} />
                        </Select.ItemIndicator>
                        <Select.ItemText>{label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </Field.Root>

      </div>

      {/* Last transcription */}
      {lastTranscription && (
        <div className="border-t border-border px-4 py-3">
          <label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">Last Transcription</label>
          <div className="px-3 py-2 bg-muted text-[13px] whitespace-pre-wrap text-foreground border border-border">
            {lastTranscription}
          </div>
        </div>
      )}
    </div>
  );
}
