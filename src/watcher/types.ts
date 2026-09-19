import type { Tags } from "../store/types";

/**
 * One line the watcher has read and newline-terminated. Deliberately not a
 * `LogRecordInput` or `ParseInput` — the watcher's contract (issue #4) is
 * `(tags, raw_line)`; parsing is a separate concern (ADR-0004) applied
 * downstream by whoever consumes these events.
 */
export interface WatchedLine {
  sourceId: string;
  file: string;
  tags: Tags;
  pattern: string | undefined;
  rawLine: string;
  /** Wall-clock time the line was read, used as the parser's ingest-time fallback. */
  ingestTs: number;
}

export interface WatcherOptions {
  /** Config-declared sources to watch, in `[[source]]` order (for source_id derivation). */
  sources: WatcherSourceConfig[];
  /** First-seen files start at 0 (replay) instead of at end (tail semantics) when true. */
  replay: boolean;
  /** How often to re-scan glob sources for newly matching files, in ms. */
  rescanIntervalMs?: number;
  /** How often to re-stat every tracked file as a fallback in case an fs.watch event was missed/coalesced, in ms. */
  safetyPollIntervalMs?: number;
}

export interface WatcherSourceConfig {
  /** The glob/path pattern as declared in config, used only to re-resolve on rescan. */
  pattern: string;
  /** User-defined tags declared against this source. */
  tags: Tags;
  /** The source's custom regex pattern, if declared. */
  regexPattern: string | undefined;
  /** Directory to resolve relative globs against. */
  cwd: string;
}
