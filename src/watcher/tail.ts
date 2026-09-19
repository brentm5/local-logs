import type { OffsetState } from "../store/types";

/** The minimal stat info the tail decision needs: identity (inode) and size. */
export interface FileStat {
  inode: number;
  size: number;
}

/**
 * A decision about where to start (or resume) reading a file, plus a
 * classification of why. `readFrom` is always a valid position to read
 * from up to the file's current size.
 */
export interface TailDecision {
  readFrom: number;
  reason: "resume" | "new" | "truncated" | "never-seen";
}

/**
 * How a never-seen file should start, per ADR-0003 / issue #4:
 *
 * - `"tail"`: start at the end (default tail semantics).
 * - `"replay"`: start at 0 — either `--replay` was passed, or the file was
 *   discovered by a rescan rather than present at startup, so there's no
 *   pre-watcher history to skip and starting at "end" would race the file's
 *   creation and silently drop whatever was written before we noticed it.
 */
export type NeverSeenPolicy = "tail" | "replay";

/**
 * Implements the offset-resume decision table from ADR-0003 / issue #4,
 * given a file's current stat and its last-persisted offset state (if any).
 * This is the single source of truth for "where do we start reading a
 * file" — every caller feeds its specific circumstances (CLI `--replay`,
 * initial scan vs. rescan) in as `neverSeenPolicy` rather than special-casing
 * the decision itself.
 *
 * - No prior offset record → never seen: start at `size` (tail) or `0`
 *   (replay), per `neverSeenPolicy`.
 * - Same inode, `size >= offset` → resume at `offset`.
 * - Different inode → rotated/replaced: new file, start at `0`.
 * - Same inode, `size < offset` → truncated: start at `0`.
 *
 * This same table is used both at startup (per source) and on every
 * subsequent file-change event, so rotation and truncation are handled
 * identically whether they happen while the process is down or while it's
 * running.
 */
export function decideTailStart(
  stat: FileStat,
  previous: OffsetState | undefined,
  neverSeenPolicy: NeverSeenPolicy,
): TailDecision {
  if (!previous) {
    return neverSeenPolicy === "replay"
      ? { readFrom: 0, reason: "never-seen" }
      : { readFrom: stat.size, reason: "never-seen" };
  }

  if (stat.inode !== previous.inode) {
    return { readFrom: 0, reason: "new" };
  }

  if (stat.size < previous.offset) {
    return { readFrom: 0, reason: "truncated" };
  }

  return { readFrom: previous.offset, reason: "resume" };
}
