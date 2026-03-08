import Database from '@tauri-apps/plugin-sql';

export interface Recording {
  id: number;
  created_at: string;
  duration_ms: number;
  transcription: string;
  audio_size: number;
  audio_type: string;
  cost: number | null;
}

export interface RecordingAudio {
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

export async function getRecordings(limit = 50, offset = 0): Promise<Recording[]> {
  const d = await getDb();
  return d.select<Recording[]>(
    'SELECT id, created_at, duration_ms, transcription, length(audio_base64) * 3 / 4 as audio_size, audio_type, cost FROM recordings ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
}

export async function getRecordingAudio(id: number): Promise<RecordingAudio | null> {
  const d = await getDb();
  const rows = await d.select<RecordingAudio[]>('SELECT audio_base64, audio_type FROM recordings WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function deleteRecording(id: number): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM recordings WHERE id = $1', [id]);
}
