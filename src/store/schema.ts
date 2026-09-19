import type { Database } from "bun:sqlite";

/**
 * Creates the schema if it doesn't already exist. Safe to call on every open.
 *
 * `auto_vacuum` and `journal_mode` are NOT set here: `auto_vacuum` must be set
 * before any table is created (see openDb), and both are connection-level
 * pragmas, not schema.
 */
export function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      level TEXT,
      message TEXT NOT NULL,
      raw TEXT NOT NULL,
      fields_json TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      record_id INTEGER NOT NULL REFERENCES records(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
      message,
      content=''
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS offsets (
      source_id TEXT PRIMARY KEY,
      inode INTEGER NOT NULL,
      size INTEGER NOT NULL,
      offset INTEGER NOT NULL
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_ts ON records (ts);`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_records_source_id_ts ON records (source_id, ts);`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_record_id ON tags (record_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_key_value ON tags (key, value);`);
}
