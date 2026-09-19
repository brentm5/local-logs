/** A single tag key/value pair attached to a record. */
export type Tags = Record<string, string>;

/** A record as accepted by the store's write API, before an id is assigned. */
export interface RecordInput {
  ts: number;
  sourceId: string;
  level: string | null;
  message: string;
  raw: string;
  fields: Record<string, unknown>;
  tags: Tags;
}

/** A record as read back from the store. */
export interface StoredRecord {
  id: number;
  ts: number;
  sourceId: string;
  level: string | null;
  message: string;
  raw: string;
  fields: Record<string, unknown>;
  tags: Tags;
}

/** The persisted offset state for one watched source, used to resume tailing. */
export interface OffsetState {
  sourceId: string;
  inode: number;
  size: number;
  offset: number;
}
