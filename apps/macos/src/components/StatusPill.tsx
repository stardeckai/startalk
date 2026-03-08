import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Mic, Loader, Star } from 'lucide-react';

type PillState = 'idle' | 'recording' | 'processing';

const pillStyles: Record<PillState, { bg: string; color: string; border: string; shadow: string }> = {
  recording: {
    bg: 'oklch(0.6297 0.1361 27.02 / 0.15)',
    color: 'oklch(0.55 0.15 27.02)',
    border: '1px solid oklch(0.6297 0.1361 27.02 / 0.25)',
    shadow: '0 2px 12px oklch(0.6297 0.1361 27.02 / 0.15)',
  },
  processing: {
    bg: 'oklch(0.7431 0.0391 258.37 / 0.15)',
    color: 'oklch(0.55 0.05 258.37)',
    border: '1px solid oklch(0.7431 0.0391 258.37 / 0.25)',
    shadow: '0 2px 12px oklch(0.7431 0.0391 258.37 / 0.15)',
  },
  idle: {
    bg: 'oklch(0.5 0 0 / 0.06)',
    color: 'oklch(0.4 0 0)',
    border: '1px solid oklch(0.5 0 0 / 0.1)',
    shadow: 'none',
  },
};

const dotColors: Record<PillState, string> = {
  recording: 'oklch(0.6297 0.1361 27.02)',
  processing: 'oklch(0.7431 0.0391 258.37)',
  idle: 'oklch(0.6297 0.1361 159.38 / 0.6)',
};

const icons: Record<PillState, React.ReactNode> = {
  recording: <Mic size={12} />,
  processing: <Loader size={12} className="animate-spin" />,
  idle: <Star size={12} />,
};

const labels: Record<PillState, string> = {
  recording: 'Recording',
  processing: 'Transcribing',
  idle: 'StarTalk',
};

export function StatusPill() {
  const [state, setState] = useState<PillState>('idle');

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    const unlisten = listen('pill:state', (event) => {
      setState(event.payload as PillState);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const s = pillStyles[state];

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent select-none">
      <div
        className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium font-sans backdrop-blur-[20px] transition-all duration-200"
        style={{
          background: s.bg,
          color: s.color,
          border: s.border,
          boxShadow: s.shadow,
        }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: dotColors[state],
            animation: state !== 'idle' ? `pulse ${state === 'recording' ? '1s' : '0.6s'} ease-in-out infinite` : 'none',
          }}
        />
        {icons[state]}
        <span>{labels[state]}</span>
      </div>
    </div>
  );
}
