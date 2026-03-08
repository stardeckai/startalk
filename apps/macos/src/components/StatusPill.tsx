import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

type PillState = 'idle' | 'recording' | 'processing';

export function StatusPill() {
  const [state, setState] = useState<PillState>('idle');

  // Make the window background transparent
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    const unlisteners = [
      listen('pill:state', (event) => {
        setState(event.payload as PillState);
      }),
    ];

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          borderRadius: 20,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'Wix Madefor Text', -apple-system, system-ui, sans-serif",
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition: 'all 0.2s ease',
          ...(state === 'recording'
            ? {
                background: 'oklch(0.6297 0.1361 27.02 / 0.15)',
                color: 'oklch(0.55 0.15 27.02)',
                border: '1px solid oklch(0.6297 0.1361 27.02 / 0.25)',
                boxShadow: '0 2px 12px oklch(0.6297 0.1361 27.02 / 0.15)',
              }
            : state === 'processing'
              ? {
                  background: 'oklch(0.7431 0.0391 258.37 / 0.15)',
                  color: 'oklch(0.55 0.05 258.37)',
                  border: '1px solid oklch(0.7431 0.0391 258.37 / 0.25)',
                  boxShadow: '0 2px 12px oklch(0.7431 0.0391 258.37 / 0.15)',
                }
              : {
                  background: 'oklch(0.5 0 0 / 0.06)',
                  color: 'oklch(0.4 0 0)',
                  border: '1px solid oklch(0.5 0 0 / 0.1)',
                }),
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            ...(state === 'recording'
              ? {
                  background: 'oklch(0.6297 0.1361 27.02)',
                  animation: 'pulse 1s ease-in-out infinite',
                }
              : state === 'processing'
                ? {
                    background: 'oklch(0.7431 0.0391 258.37)',
                    animation: 'pulse 0.6s ease-in-out infinite',
                  }
                : {
                    background: 'oklch(0.6297 0.1361 159.38 / 0.6)',
                  }),
          }}
        />
        <span>
          {state === 'recording'
            ? 'Recording'
            : state === 'processing'
              ? 'Transcribing'
              : 'StarTalk'}
        </span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
