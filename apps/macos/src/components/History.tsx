import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getRecordings, deleteRecording, type Recording } from '../db';

function formatDate(iso: string): string {
  const d = new Date(iso + 'Z');
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function History() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getRecordings(100);
      setRecordings(rows);
    } catch (e) {
      console.error('[History] Failed to load recordings:', e);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh when a new recording is saved
    const unlisten = listen('recording:saved', () => load());
    return () => { unlisten.then((fn) => fn()); };
  }, [load]);

  const handlePlay = (rec: Recording) => {
    if (audioEl) {
      audioEl.pause();
      setAudioEl(null);
    }
    if (playingId === rec.id) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(`data:${rec.audio_type};base64,${rec.audio_base64}`);
    audio.onended = () => {
      setPlayingId(null);
      setAudioEl(null);
    };
    audio.play();
    setPlayingId(rec.id);
    setAudioEl(audio);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (playingId === id && audioEl) {
        audioEl.pause();
        setPlayingId(null);
        setAudioEl(null);
      }
    } catch (e) {
      console.error('[History] Failed to delete:', e);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (recordings.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          color: 'var(--muted-foreground)',
          textAlign: 'center',
          marginTop: 40,
        }}
      >
        No recordings yet. Use your push-to-talk hotkey to get started.
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {recordings.map((rec) => (
        <div
          key={rec.id}
          style={{
            padding: 12,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            marginBottom: 8,
            background: 'var(--background)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              {formatDate(rec.created_at)} · {formatDuration(rec.duration_ms)} · {formatSize(Math.round(rec.audio_base64.length * 3 / 4))}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => handlePlay(rec)}
                style={pillBtnStyle}
                title={playingId === rec.id ? 'Stop' : 'Play'}
              >
                {playingId === rec.id ? '\u25A0' : '\u25B6'}
              </button>
              <button
                onClick={() => handleCopy(rec.transcription)}
                style={pillBtnStyle}
                title="Copy"
              >
                Copy
              </button>
              <button
                onClick={() => handleDelete(rec.id)}
                style={{ ...pillBtnStyle, color: 'var(--destructive)' }}
                title="Delete"
              >
                Del
              </button>
            </div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {rec.transcription}
          </div>
        </div>
      ))}
    </div>
  );
}

const pillBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--muted)',
  color: 'var(--foreground)',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
