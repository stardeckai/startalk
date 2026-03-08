import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { VocabularyEntry } from '@startalk/core';

interface VocabularyEditorProps {
  value: VocabularyEntry[];
  onChange: (entries: VocabularyEntry[]) => void;
}

const inputClassName = 'w-full px-2 py-1.5 border border-border text-sm bg-background text-foreground font-inherit outline-none focus:border-primary';

export function VocabularyEditor({ value, onChange }: VocabularyEditorProps) {
  const [spoken, setSpoken] = useState('');
  const [correct, setCorrect] = useState('');

  const handleAdd = () => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      {value.length > 0 && (
        <div className="border border-border divide-y divide-border mb-2">
          {value.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
              <span className="text-muted-foreground flex-1 truncate">{entry.spoken}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground flex-1 truncate font-medium">{entry.correct}</span>
              <button
                onClick={() => handleRemove(i)}
                className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive cursor-pointer bg-transparent border-none"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={spoken}
          onChange={(e) => setSpoken(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Heard as..."
          className={`${inputClassName} flex-1`}
        />
        <input
          type="text"
          value={correct}
          onChange={(e) => setCorrect(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Correct spelling"
          className={`${inputClassName} flex-1`}
        />
        <button
          onClick={handleAdd}
          disabled={!spoken.trim() || !correct.trim()}
          className="shrink-0 px-2 py-1.5 border border-border bg-muted text-foreground text-sm cursor-pointer font-inherit hover:bg-border disabled:opacity-40 disabled:cursor-default flex items-center gap-1"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
