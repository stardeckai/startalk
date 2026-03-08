import type { VocabularyEntry } from '@startalk/core';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

interface VocabularyEditorProps {
  value: VocabularyEntry[];
  onChange: (entries: VocabularyEntry[]) => void;
}

const inputClassName =
  'w-full px-2 py-1.5 border border-border text-sm bg-background text-foreground font-inherit outline-none focus:border-primary';

export function VocabularyEditor({ value, onChange }: VocabularyEditorProps) {
  const [word, setWord] = useState('');
  const [spoken, setSpoken] = useState('');
  const [correct, setCorrect] = useState('');

  const handleAddWord = () => {
    const w = word.trim();
    if (!w) return;
    onChange([...value, { correct: w }]);
    setWord('');
  };

  const handleAddCorrection = () => {
    const s = spoken.trim();
    const c = correct.trim();
    if (!s || !c) return;
    onChange([...value, { spoken: s, correct: c }]);
    setSpoken('');
    setCorrect('');
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const knownWords = value.filter((v) => !v.spoken);
  const corrections = value.filter((v) => v.spoken);

  return (
    <div className="space-y-3">
      {/* Known words */}
      <div>
        <span className="block mb-1.5 text-xs text-muted-foreground">Known words & phrases</span>
        {knownWords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {knownWords.map((entry) => {
              const idx = value.indexOf(entry);
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[13px] border border-border bg-muted text-foreground"
                >
                  {entry.correct}
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="shrink-0 p-0 text-muted-foreground hover:text-destructive cursor-pointer bg-transparent border-none"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddWord();
              }
            }}
            placeholder="e.g. Stardeck, OpenRouter..."
            className={`${inputClassName} flex-1`}
          />
          <button
            type="button"
            onClick={handleAddWord}
            disabled={!word.trim()}
            className="shrink-0 px-2 py-1.5 border border-border bg-muted text-foreground text-sm cursor-pointer font-inherit hover:bg-border disabled:opacity-40 disabled:cursor-default flex items-center gap-1"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Corrections */}
      <div>
        <span className="block mb-1.5 text-xs text-muted-foreground">Spelling corrections</span>
        {corrections.length > 0 && (
          <div className="border border-border divide-y divide-border mb-2">
            {corrections.map((entry) => {
              const idx = value.indexOf(entry);
              return (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                  <span className="text-muted-foreground flex-1 truncate">{entry.spoken}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-foreground flex-1 truncate font-medium">{entry.correct}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive cursor-pointer bg-transparent border-none"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={spoken}
            onChange={(e) => setSpoken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCorrection();
              }
            }}
            placeholder="Heard as..."
            className={`${inputClassName} flex-1`}
          />
          <input
            type="text"
            value={correct}
            onChange={(e) => setCorrect(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCorrection();
              }
            }}
            placeholder="Correct spelling"
            className={`${inputClassName} flex-1`}
          />
          <button
            type="button"
            onClick={handleAddCorrection}
            disabled={!spoken.trim() || !correct.trim()}
            className="shrink-0 px-2 py-1.5 border border-border bg-muted text-foreground text-sm cursor-pointer font-inherit hover:bg-border disabled:opacity-40 disabled:cursor-default flex items-center gap-1"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
