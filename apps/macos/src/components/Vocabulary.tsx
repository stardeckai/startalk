import { useCallback } from 'react';
import { load, type Store } from '@tauri-apps/plugin-store';
import { Field } from '@base-ui/react/field';
import { useAppStore } from '../store';
import { VocabularyEditor } from './VocabularyEditor';
import type { AppConfig } from '@startalk/core';

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) {
    storePromise = load('settings.json', { defaults: {}, autoSave: true });
  }
  return storePromise;
}

const inputClassName = 'w-full px-3 py-2 border border-border text-sm bg-background text-foreground font-inherit outline-none focus:border-primary';

export function Vocabulary() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);

  const updateConfig = useCallback(
    async (partial: Partial<AppConfig>) => {
      setConfig(partial);
      const store = await getStore();
      const fullConfig = useAppStore.getState().config;
      await store.set('config', fullConfig);
    },
    [setConfig],
  );

  return (
    <div className="px-4 py-4 space-y-4">
      <Field.Root>
        <Field.Label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">Custom Prompt</Field.Label>
        <textarea
          value={config.transcriptionPrompt}
          onChange={(e) => updateConfig({ transcriptionPrompt: e.target.value })}
          rows={3}
          placeholder="Optional additional instructions..."
          className={`${inputClassName} resize-y`}
        />
        <Field.Description className="text-xs text-muted-foreground mt-1.5">
          Added to the system prompt. Use for context like "I'm dictating code" or "This is a medical conversation".
        </Field.Description>
      </Field.Root>

      <Field.Root>
        <Field.Label className="block mb-1.5 text-[13px] font-medium text-muted-foreground">Vocabulary</Field.Label>
        <VocabularyEditor
          value={config.vocabulary ?? []}
          onChange={(vocabulary) => updateConfig({ vocabulary })}
        />
        <Field.Description className="text-xs text-muted-foreground mt-1.5">
          Add words you use often, or correct common mishearings.
        </Field.Description>
      </Field.Root>
    </div>
  );
}
