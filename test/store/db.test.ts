import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/store/db";

describe("openDb", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "local-logs-db-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("sets auto_vacuum = INCREMENTAL on a freshly created database", () => {
    const dbPath = join(dir, "fresh.db");
    const db = openDb(dbPath);

    expect(db.query("PRAGMA auto_vacuum").get()).toEqual({ auto_vacuum: 2 });

    db.close();
  });

  test("sets journal_mode = WAL", () => {
    const dbPath = join(dir, "wal.db");
    const db = openDb(dbPath);

    expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });

    db.close();
  });

  test("creates the log_records, tags, fts, and offsets tables", () => {
    const db = openDb(join(dir, "schema.db"));

    const tableNames = db
      .query("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tableNames).toContain("log_records");
    expect(tableNames).toContain("tags");
    expect(tableNames).toContain("offsets");
    expect(tableNames).toContain("log_records_fts");

    db.close();
  });

  test("creates indexes on (ts) and (source_id, ts)", () => {
    const db = openDb(join(dir, "indexes.db"));

    const indexNames = db
      .query("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(indexNames).toContain("idx_log_records_ts");
    expect(indexNames).toContain("idx_log_records_source_id_ts");

    db.close();
  });

  test("re-opening an existing database preserves auto_vacuum and does not recreate tables", () => {
    const dbPath = join(dir, "reopen.db");
    const first = openDb(dbPath);
    first.close();

    const second = openDb(dbPath);
    expect(second.query("PRAGMA auto_vacuum").get()).toEqual({ auto_vacuum: 2 });
    second.close();
  });
});
