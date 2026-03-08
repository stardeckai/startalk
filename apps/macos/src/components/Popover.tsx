import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Loader, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PopoverData {
  header: string;
  original: string;
  result: string;
  loading: boolean;
}

export function Popover() {
  const [data, setData] = useState<PopoverData | null>(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  // Poll for data until we have a non-loading result.
  // This covers the race where emit_to fires before the JS listener is ready.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      invoke<PopoverData | null>('get_popover_data').then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        // Keep polling while we have no data or still loading
        if (!d || d.loading) {
          setTimeout(poll, 100);
        }
      });
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Also listen for live updates (handles data arriving after initial load)
  useEffect(() => {
    const unlisten = listen<PopoverData>('popover:data', (event) => {
      setData(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const close = () => {
    invoke('dismiss_popover');
  };

  if (!data) {
    return (
      <div className="popover-container">
        <div className="popover-card">
          <div className="flex items-center justify-center py-6">
            <Loader size={16} className="animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  if (data.loading) {
    return (
      <div className="popover-container">
        <div className="popover-card">
          <div className="flex items-center gap-2 py-4 px-4 text-[13px] text-muted-foreground">
            <Loader size={14} className="animate-spin" />
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="popover-container">
      <div className="popover-card flex flex-col max-h-[min(400px,100vh)]">
        {/* Header row */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-1 shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{data.header}</span>
          <button
            type="button"
            onClick={close}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={12} />
          </button>
        </div>

        {/* Original text */}
        {data.original && (
          <div className="px-3.5 pb-1 shrink-0">
            <p className="text-[12px] text-muted-foreground truncate m-0">{data.original}</p>
          </div>
        )}

        {/* Divider */}
        <div className="mx-3.5 border-t border-border shrink-0" />

        {/* Result — scrollable */}
        <div className="px-3.5 pt-2 pb-3 overflow-y-auto min-h-0">
          <p className="text-[14px] text-foreground font-medium leading-relaxed m-0 whitespace-pre-wrap">
            {data.result}
          </p>
        </div>
      </div>
    </div>
  );
}
