import { listen } from '@tauri-apps/api/event';
import { Copy, Play, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { deleteRecording, getRecordingAudio, getRecordings, type Recording } from '../db';
import { formatCost, formatDate, formatDuration, formatSize } from '../utils/format';

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
    const unlisten = listen('recording:saved', () => load());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  const stopPlayback = () => {
    audioEl?.pause();
    setPlayingId(null);
    setAudioEl(null);
  };

  const handlePlay = async (rec: Recording) => {
    stopPlayback();
    if (playingId === rec.id) return;

    const data = await getRecordingAudio(rec.id);
    if (!data) return;

    const audio = new Audio(`data:${data.audio_type};base64,${data.audio_base64}`);
    audio.onended = () => stopPlayback();
    audio.play();
    setPlayingId(rec.id);
    setAudioEl(audio);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (playingId === id) stopPlayback();
    } catch (e) {
      console.error('[History] Failed to delete:', e);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (recordings.length === 0) {
    return (
      <div className="px-4 py-10 text-muted-foreground text-center text-[13px]">
        No recordings yet. Use your push-to-talk hotkey to get started.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {recordings.map((rec) => (
        <div key={rec.id} className="px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              {formatDate(rec.created_at)} · {formatDuration(rec.duration_ms)} · {formatSize(rec.audio_size)}
              {rec.cost != null && ` · ${formatCost(rec.cost)}`}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handlePlay(rec)}
                className="inline-flex items-center px-1.5 py-0.5 border border-border bg-muted text-foreground text-[11px] cursor-pointer font-inherit hover:bg-border"
                title={playingId === rec.id ? 'Stop' : 'Play'}
              >
                {playingId === rec.id ? <Square size={10} /> : <Play size={10} />}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(rec.transcription)}
                className="inline-flex items-center px-1.5 py-0.5 border border-border bg-muted text-foreground text-[11px] cursor-pointer font-inherit hover:bg-border"
                title="Copy"
              >
                <Copy size={10} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(rec.id)}
                className="inline-flex items-center px-1.5 py-0.5 border border-border bg-muted text-destructive text-[11px] cursor-pointer font-inherit hover:bg-border"
                title="Delete"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{rec.transcription}</div>
        </div>
      ))}
    </div>
  );
}
