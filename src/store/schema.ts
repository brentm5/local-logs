import type { Database } from "bun:sqlite";

/**
 * Creates the schema if it doesn't already exist. Safe to call on every open.
 *
 * `auto_vacuum` and `journal_mode` are NOT set here: `auto_vacuum` must be set
 * before any table is created (see openDb), and both are connection-level
 * pragmas, not schema.
 */
export function initSchema(db: Database): void {
  // id: SQLite rowid alias (cheapest possible index; what log_records_fts
  // joins against via its own rowid). Duplicate ingestion is prevented
  // upstream by offset tracking (see `offsets` below and ADR-0003), not by
  // a content hash here — two identical log lines are two real records, not
  // one duplicated write.
  //
  // ts: UTC epoch, per SQLite convention (cheap arithmetic, compact index;
  // SQLite has no dedicated timestamp type).
  //
  // source_id: identifies which watched file/glob this record came from
  // (CONTEXT.md's "Source"). Promoted to a real column rather than left in
  // `tags` because it's on the hot path for nearly every query — the UI's
  // source selector and live tail both filter by it — and resolving it
  // through the tags table would mean a join on that path (ADR-0002).
  //
  // fields_json: the full parsed record root, JSON-encoded. Plain TEXT, not
  // a declared JSON/JSONB column — SQLite has no dedicated JSON storage
  // class, and its JSON1 functions (json_extract, ->, ->>) work directly on
  // a TEXT column, including under an expression index, e.g.
  // `SELECT fields_json ->> '$.status' FROM log_records` or
  // `CREATE INDEX ... ON log_records (json_extract(fields_json, '$.status'))`.
  // So per-field querying into `fields` doesn't require a schema change.
  // JSONB (SQLite's binary JSON storage, >=3.45) would only be worth
  // revisiting if `fields_json` access becomes a measured hot path — it
  // trades ~3x faster re-parsing and a smaller on-disk footprint for
  // losing plain-text readability via `SELECT *`, and bun:sqlite doesn't
  // encode into it automatically.
  //
  // Table is `log_records`, not the bare `records`: specific to this
  // domain's use of the word (CONTEXT.md's "Record") rather than a generic
  // SQL noun.
  db.run(`
    CREATE TABLE IF NOT EXISTS log_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      level TEXT,
      message TEXT NOT NULL,
      raw TEXT NOT NULL,
      fields_json TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      log_record_id INTEGER NOT NULL REFERENCES log_records(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Full-text index over message, kept separate from log_records so a
  // search hit can be joined back to its row (contentless: the FTS index
  // does not duplicate message text on disk, see ADR-0002).
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS log_records_fts USING fts5(
      message,
      content=''
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS offsets (
      source_id TEXT PRIMARY KEY,
      inode INTEGER NOT NULL,
      size INTEGER NOT NULL,
      offset INTEGER NOT NULL
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_log_records_ts ON log_records (ts);`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_log_records_source_id_ts ON log_records (source_id, ts);`,
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_log_record_id ON tags (log_record_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_key_value ON tags (key, value);`);
}
