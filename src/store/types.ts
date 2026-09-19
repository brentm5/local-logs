/** A single tag key/value pair attached to a log record. */
export type Tags = Record<string, string>;

/** A log record as accepted by the store's write API, before an id is assigned. */
export interface LogRecordInput {
  ts: number;
  sourceId: string;
  level: string | null;
  message: string;
  raw: string;
  fields: Record<string, unknown>;
  tags: Tags;
}

/**
 * A log record as read back from the store: the same shape as
 * `LogRecordInput`, plus the id SQLite assigned on insert.
 */
export interface StoredLogRecord extends LogRecordInput {
  id: number;
}

/** The persisted offset state for one watched source, used to resume tailing. */
export interface OffsetState {
  sourceId: string;
  inode: number;
  size: number;
  offset: number;
}
