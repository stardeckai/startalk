import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
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
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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


  const expanded = state !== 'idle' || hovered;
  const s = pillStyles[state];

  const handleClick = () => {
    invoke('show_main_window').catch((e) => console.error('Failed to show main window:', e));
  };

  const handleMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => setHovered(false), 300);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      title="Open StarTalk Settings"
      className="fixed inset-0 flex flex-col justify-end items-center bg-transparent select-none cursor-pointer"
    >
      <div
        className="flex items-center justify-center rounded-full text-[13px] font-medium font-sans backdrop-blur-[20px] transition-all duration-300 overflow-hidden"
        style={{
          background: s.bg,
          color: s.color,
          border: s.border,
          boxShadow: s.shadow,
          padding: expanded ? '6px 16px' : '0',
          width: expanded ? 'auto' : '64px',
          height: expanded ? 'auto' : '12px',
          gap: expanded ? '8px' : '0',
          opacity: expanded ? 1 : 0.5,
        }}
      >
        {expanded && (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: dotColors[state],
                animation: state !== 'idle' ? `pulse ${state === 'recording' ? '1s' : '0.6s'} ease-in-out infinite` : 'none',
              }}
            />
            {icons[state]}
            <span className="whitespace-nowrap">{labels[state]}</span>
          </>
        )}
      </div>
    </div>
  );
}
