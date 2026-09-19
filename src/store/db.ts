import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { initSchema } from "./schema";

/**
 * Opens (creating if necessary) the SQLite database at `path`, or an
 * in-memory database when `path` is ":memory:".
 *
 * `auto_vacuum = INCREMENTAL` is set before the schema is created: per
 * ADR-0002, `auto_vacuum` cannot be changed after tables exist without a
 * dump/rebuild, so this ordering matters and must not be reshuffled.
 */
export function openDb(path: string): Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(path, { create: true });

  db.exec("PRAGMA auto_vacuum = INCREMENTAL;");
  db.exec("PRAGMA journal_mode = WAL;");

  initSchema(db);

  return db;
}
