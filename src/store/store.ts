import type { Database } from "bun:sqlite";
import { openDb } from "./db";
import type { OffsetState, RecordInput, StoredRecord, Tags } from "./types";

const FLUSH_INTERVAL_MS = 100;
const FLUSH_BATCH_SIZE = 500;

export interface TimeRangeQuery {
  from: number;
  to: number;
  sourceId?: string;
}

interface RecordRow {
  id: number;
  ts: number;
  source_id: string;
  level: string | null;
  message: string;
  raw: string;
  fields_json: string;
}

/**
 * The SQLite-backed store: schema, batched writes, and queries by time
 * range, tag, and full-text match. See ADR-0002 and ADR-0003.
 */
export class Store {
  private readonly db: Database;
  private readonly insertRecordStmt;
  private readonly insertFtsStmt;
  private readonly insertTagStmt;
  private readonly selectTagsStmt;
  private readonly upsertOffsetStmt;
  private readonly selectOffsetStmt;
  private readonly runInsertBatch;

  private queue: RecordInput[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;

  constructor(path: string) {
    this.db = openDb(path);

    this.insertRecordStmt = this.db.prepare(
      `INSERT INTO records (ts, source_id, level, message, raw, fields_json)
       VALUES ($ts, $source_id, $level, $message, $raw, $fields_json)`,
    );
    this.insertFtsStmt = this.db.prepare(
      `INSERT INTO records_fts (rowid, message) VALUES ($rowid, $message)`,
    );
    this.insertTagStmt = this.db.prepare(
      `INSERT INTO tags (record_id, key, value) VALUES ($record_id, $key, $value)`,
    );
    this.selectTagsStmt = this.db.prepare(
      `SELECT key, value FROM tags WHERE record_id = $record_id`,
    );
    this.upsertOffsetStmt = this.db.prepare(
      `INSERT INTO offsets (source_id, inode, size, offset)
       VALUES ($source_id, $inode, $size, $offset)
       ON CONFLICT(source_id) DO UPDATE SET
         inode = excluded.inode,
         size = excluded.size,
         offset = excluded.offset`,
    );
    this.selectOffsetStmt = this.db.prepare(
      `SELECT source_id, inode, size, offset FROM offsets WHERE source_id = $source_id`,
    );

    this.runInsertBatch = this.db.transaction((records: RecordInput[]) => {
      for (const record of records) {
        const { lastInsertRowid } = this.insertRecordStmt.run({
          $ts: record.ts,
          $source_id: record.sourceId,
          $level: record.level,
          $message: record.message,
          $raw: record.raw,
          $fields_json: JSON.stringify(record.fields),
        });
        const recordId = Number(lastInsertRowid);

        this.insertFtsStmt.run({ $rowid: recordId, $message: record.message });

        for (const [key, value] of Object.entries(record.tags)) {
          this.insertTagStmt.run({ $record_id: recordId, $key: key, $value: value });
        }
      }
    });
  }

  /** Access to the underlying bun:sqlite Database, for diagnostics/tests. */
  raw(): Database {
    return this.db;
  }

  /**
   * Writes a batch of records in one transaction. Use this directly for a
   * caller-controlled batch, or `enqueue` for the time/size-triggered
   * batching described in ADR-0003.
   */
  async insertBatch(records: RecordInput[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    this.runInsertBatch(records);
  }

  /**
   * Buffers a record for the next automatic flush, which happens every
   * ~100ms or once 500 records have queued, whichever comes first.
   */
  enqueue(record: RecordInput): void {
    this.queue.push(record);

    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      // Don't hold the process open just for the flush timer.
      this.flushTimer.unref?.();
    }
  }

  /** Flushes any queued records immediately, e.g. on shutdown. */
  flush(): void {
    if (this.queue.length === 0) {
      return;
    }
    const pending = this.queue;
    this.queue = [];
    this.runInsertBatch(pending);

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  queryByTimeRange(query: TimeRangeQuery): StoredRecord[] {
    const rows = query.sourceId
      ? (this.db
          .query(
            `SELECT id, ts, source_id, level, message, raw, fields_json
             FROM records
             WHERE ts >= $from AND ts <= $to AND source_id = $source_id
             ORDER BY ts ASC`,
          )
          .all({ $from: query.from, $to: query.to, $source_id: query.sourceId }) as RecordRow[])
      : (this.db
          .query(
            `SELECT id, ts, source_id, level, message, raw, fields_json
             FROM records
             WHERE ts >= $from AND ts <= $to
             ORDER BY ts ASC`,
          )
          .all({ $from: query.from, $to: query.to }) as RecordRow[]);

    return rows.map((row) => this.hydrate(row));
  }

  queryByTag(key: string, value: string): StoredRecord[] {
    const rows = this.db
      .query(
        `SELECT r.id, r.ts, r.source_id, r.level, r.message, r.raw, r.fields_json
         FROM records r
         JOIN tags t ON t.record_id = r.id
         WHERE t.key = $key AND t.value = $value
         ORDER BY r.ts ASC`,
      )
      .all({ $key: key, $value: value }) as RecordRow[];

    return rows.map((row) => this.hydrate(row));
  }

  queryByText(term: string): StoredRecord[] {
    const rows = this.db
      .query(
        `SELECT r.id, r.ts, r.source_id, r.level, r.message, r.raw, r.fields_json
         FROM records_fts f
         JOIN records r ON r.id = f.rowid
         WHERE f.message MATCH $term
         ORDER BY r.ts ASC`,
      )
      .all({ $term: term }) as RecordRow[];

    return rows.map((row) => this.hydrate(row));
  }

  getOffset(sourceId: string): OffsetState | undefined {
    const row = this.selectOffsetStmt.get({ $source_id: sourceId }) as
      | { source_id: string; inode: number; size: number; offset: number }
      | null;

    if (!row) {
      return undefined;
    }

    return {
      sourceId: row.source_id,
      inode: row.inode,
      size: row.size,
      offset: row.offset,
    };
  }

  setOffset(state: OffsetState): void {
    this.upsertOffsetStmt.run({
      $source_id: state.sourceId,
      $inode: state.inode,
      $size: state.size,
      $offset: state.offset,
    });
  }

  private hydrate(row: RecordRow): StoredRecord {
    const tagRows = this.selectTagsStmt.all({ $record_id: row.id }) as {
      key: string;
      value: string;
    }[];
    const tags: Tags = {};
    for (const tagRow of tagRows) {
      tags[tagRow.key] = tagRow.value;
    }

    return {
      id: row.id,
      ts: row.ts,
      sourceId: row.source_id,
      level: row.level,
      message: row.message,
      raw: row.raw,
      fields: JSON.parse(row.fields_json),
      tags,
    };
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flush();
    this.db.close();
  }
}
