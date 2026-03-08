use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Database(Mutex<Connection>);

impl Database {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        let db_path = app_data_dir.join("startalk.db");
        eprintln!("[StarTalk] Opening database at: {}", db_path.display());

        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {e}"))?;

        // Run migrations (idempotent, safe alongside tauri-plugin-sql)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                duration_ms INTEGER NOT NULL,
                transcription TEXT NOT NULL,
                audio_base64 TEXT NOT NULL,
                audio_type TEXT NOT NULL
            )",
        )
        .map_err(|e| format!("Migration v1 failed: {e}"))?;

        // Add cost column if it doesn't exist
        let has_cost: bool = conn
            .prepare("SELECT cost FROM recordings LIMIT 0")
            .is_ok();
        if !has_cost {
            conn.execute_batch("ALTER TABLE recordings ADD COLUMN cost REAL")
                .map_err(|e| format!("Migration v2 failed: {e}"))?;
        }

        Ok(Self(Mutex::new(conn)))
    }

    pub fn save_recording(
        &self,
        duration_ms: i64,
        transcription: &str,
        audio_base64: &str,
        audio_type: &str,
        cost: Option<f64>,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO recordings (duration_ms, transcription, audio_base64, audio_type, cost) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![duration_ms, transcription, audio_base64, audio_type, cost],
        )
        .map_err(|e| format!("Failed to save recording: {e}"))?;
        Ok(())
    }

    pub fn cleanup_old_recordings(&self, retention: &str) -> Result<usize, String> {
        let hours: i64 = match retention {
            "24h" => 24,
            "3d" => 72,
            "7d" => 168,
            _ => 24,
        };

        let conn = self.0.lock().unwrap();
        let deleted = conn
            .execute(
                "DELETE FROM recordings WHERE created_at < datetime('now', ?1)",
                [format!("-{hours} hours")],
            )
            .map_err(|e| format!("Failed to cleanup recordings: {e}"))?;

        Ok(deleted)
    }
}
