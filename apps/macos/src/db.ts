import Database from '@tauri-apps/plugin-sql';
import type { HistoryRetention } from '@startalk/core';

const RETENTION_HOURS: Record<HistoryRetention, number> = {
  '24h': 24,
  '3d': 72,
  '7d': 168,
};

export interface Recording {
  id: number;
  created_at: string;
  duration_ms: number;
  transcription: string;
  audio_base64: string;
  audio_type: string;
}

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:startalk.db');
  }
  return db;
}

export async function saveRecording(
  durationMs: number,
  transcription: string,
  audioBase64: string,
  audioType: string,
): Promise<void> {
  const d = await getDb();
  await d.execute(
    'INSERT INTO recordings (duration_ms, transcription, audio_base64, audio_type) VALUES ($1, $2, $3, $4)',
    [durationMs, transcription, audioBase64, audioType],
  );
}

export async function getRecordings(limit = 50, offset = 0): Promise<Recording[]> {
  const d = await getDb();
  return d.select<Recording[]>(
    'SELECT id, created_at, duration_ms, transcription, audio_base64, audio_type FROM recordings ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
}

export async function deleteRecording(id: number): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM recordings WHERE id = $1', [id]);
}

export async function cleanupOldRecordings(retention: HistoryRetention): Promise<number> {
  const hours = RETENTION_HOURS[retention];
  const d = await getDb();
  const result = await d.execute(
    `DELETE FROM recordings WHERE created_at < datetime('now', '-${hours} hours')`,
  );
  return result.rowsAffected;
}
