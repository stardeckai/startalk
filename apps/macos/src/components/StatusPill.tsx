import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { Loader, Mic, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import startalkMono from '../assets/Startalk-mono.png';

const PILL_W_EXPANDED = 180;
const PILL_H_EXPANDED = 60;
const PILL_W_COLLAPSED = 72;
const PILL_H_COLLAPSED = 24;

type PillState = 'idle' | 'recording' | 'processing' | 'thinking';

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
  thinking: {
    bg: 'oklch(0.7 0.12 310 / 0.15)',
    color: 'oklch(0.5 0.12 310)',
    border: '1px solid oklch(0.7 0.12 310 / 0.25)',
    shadow: '0 2px 12px oklch(0.7 0.12 310 / 0.15)',
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
  thinking: 'oklch(0.7 0.12 310)',
  idle: 'oklch(0.6297 0.1361 159.38 / 0.6)',
};

const icons: Record<PillState, React.ReactNode> = {
  recording: <Mic size={12} />,
  processing: <Loader size={12} className="animate-spin" />,
  thinking: <Sparkles size={12} />,
  idle: <img src={startalkMono} alt="" className="w-3 h-3 brightness-0 invert" />,
};

const labels: Record<PillState, string> = {
  recording: 'Recording',
  processing: 'Transcribing',
  thinking: 'Thinking',
  idle: 'StarTalk',
};

export function StatusPill() {
  const [state, setState] = useState<PillState>('idle');
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    const unlistenState = listen('pill:state', (event) => {
      setState(event.payload as PillState);
    });
    const unlistenHover = listen<boolean>('pill:hover', (event) => {
      setHovered(event.payload);
    });
    return () => {
      unlistenState.then((fn) => fn());
      unlistenHover.then((fn) => fn());
    };
  }, []);

  const expanded = state !== 'idle' || hovered;
  const s = pillStyles[state];

  // Resize the actual Tauri window to match visual state.
  // Grow upward from the bottom edge so the cursor stays inside on hover.
  const isActive = state !== 'idle';
  useEffect(() => {
    const win = getCurrentWindow();
    const shouldExpand = isActive || hovered;
    const w = shouldExpand ? PILL_W_EXPANDED : PILL_W_COLLAPSED;
    const h = shouldExpand ? PILL_H_EXPANDED : PILL_H_COLLAPSED;

    currentMonitor().then((monitor) => {
      if (!monitor) return;
      const screen = monitor.size;
      const scale = monitor.scaleFactor;
      const screenH = screen.height / scale;
      // Keep bottom edge fixed at 8px from screen bottom
      const bottomY = screenH - 8;
      const x = (screen.width / scale - w) / 2;
      const y = bottomY - h;
      // Set position first, then size — keeps bottom edge anchored
      win.setPosition(new LogicalPosition(x, y));
      win.setSize(new LogicalSize(w, h));
    });

    if (!isActive && !hovered) {
      setHovered(false);
    }
  }, [isActive, hovered]);

  const handleClick = () => {
    invoke('show_main_window').catch((e) => console.error('Failed to show main window:', e));
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: No keyboard interaction in overlay window
    // biome-ignore lint/a11y/noStaticElementInteractions: Overlay window container
    <div
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
          opacity: expanded ? 1 : 0.7,
        }}
      >
        {expanded && (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: dotColors[state],
                animation:
                  state !== 'idle' ? `pulse ${state === 'recording' ? '1s' : '0.6s'} ease-in-out infinite` : 'none',
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
