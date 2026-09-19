import type { Tags } from "../store/types";

/**
 * Input to the parse ladder for one raw log line. See ADR-0004.
 */
export interface ParseInput {
  /** The raw line as read from disk, exactly as it will be preserved in `raw`. */
  line: string;
  /** The source's id, merged onto tags as the watcher-assigned `source_id`. */
  sourceId: string;
  /** The absolute path of the file the line was read from, merged onto tags as `file`. */
  file: string;
  /** User-defined tags declared against the source in config, e.g. `service=api`. */
  tags: Tags;
  /** The source's custom regex, if declared. Named capture groups become record fields. */
  pattern?: string | undefined;
  /** Ingest time (epoch ms), used as the record's `ts` when no timestamp can be detected in the line. */
  ingestTs: number;
}
