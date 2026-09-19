import { type FSWatcher, watch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveSourceFiles } from "../config/load";
import type { OffsetState } from "../store/types";
import { deriveSourceId } from "./source-id";
import { decideTailStart, type FileStat, type NeverSeenPolicy } from "./tail";
import { LineBuffer } from "./line-buffer";
import type { WatchedLine, WatcherOptions, WatcherSourceConfig } from "./types";

const DEFAULT_RESCAN_INTERVAL_MS = 5_000;
const SAFETY_POLL_INTERVAL_MS = 2_000;
const READ_CHUNK_LIMIT = 8 * 1024 * 1024; // Cap one read so a huge burst can't blow up memory.

/** Stats `path` and maps it to the minimal `FileStat` shape, or `undefined` if it's gone. */
async function statFile(path: string): Promise<FileStat | undefined> {
  try {
    const s = await stat(path);
    return { inode: s.ino, size: s.size };
  } catch {
    return undefined;
  }
}

/** Persistence the watcher needs from the store: offset get/set. See ADR-0003. */
export interface OffsetStore {
  getOffset(sourceId: string): OffsetState | undefined;
  setOffset(state: OffsetState): void;
}

interface TrackedFile {
  sourceId: string;
  path: string;
  source: WatcherSourceConfig;
  inode: number;
  offset: number;
  /**
   * Chains directory-change handling for this file so overlapping fs.watch
   * events (rotation reliably fires several in quick succession: rename,
   * then create, then change) never run concurrently. Without this, two
   * `handleChange` calls can both observe the same pre-update offset and
   * both read and emit the same appended bytes.
   */
  changeQueue: Promise<void>;
}

/**
 * Tails config-declared sources, resuming across restarts and surviving
 * rotation/truncation, per ADR-0003 and issue #4. Emits `(tags, raw_line)`
 * (as `WatchedLine`) for appended data via `onLine`; parsing and storage are
 * downstream concerns the caller wires up.
 */
export class Watcher {
  private readonly store: OffsetStore;
  private readonly options: WatcherOptions;
  private readonly onLine: (line: WatchedLine) => void;
  private readonly lineBuffer = new LineBuffer();
  private readonly tracked = new Map<string, TrackedFile>(); // keyed by path
  private readonly dirWatchers = new Map<string, FSWatcher>(); // keyed by directory
  private rescanTimer: ReturnType<typeof setInterval> | undefined;
  private safetyPollTimer: ReturnType<typeof setInterval> | undefined;
  private started = false;

  constructor(store: OffsetStore, options: WatcherOptions, onLine: (line: WatchedLine) => void) {
    this.store = store;
    this.options = options;
    this.onLine = onLine;
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error("Watcher already started");
    }
    this.started = true;

    await Promise.all(
      this.options.sources.map((source, sourceIndex) => this.rescanSource(sourceIndex, source, "initial")),
    );

    const intervalMs = this.options.rescanIntervalMs ?? DEFAULT_RESCAN_INTERVAL_MS;
    this.rescanTimer = setInterval(() => {
      this.rescanAll().catch((err) => {
        console.error(`local-logs: watcher rescan failed: ${(err as Error).message}`);
      });
    }, intervalMs);
    this.rescanTimer.unref?.();

    // Safety net alongside fs.watch: OS file-change events can be missed or
    // coalesced under load (observed with FSEvents on macOS), which would
    // otherwise silently stall a file until some unrelated event nudges it.
    // Polling every tracked file on a short interval bounds that staleness
    // without giving up fs.watch's low latency for the common case —
    // `handleChange` re-stats and no-ops if nothing changed, so this is
    // cheap when idle.
    const safetyPollMs = this.options.safetyPollIntervalMs ?? SAFETY_POLL_INTERVAL_MS;
    this.safetyPollTimer = setInterval(() => {
      for (const tracked of this.tracked.values()) {
        tracked.changeQueue = tracked.changeQueue
          .then(() => this.handleChange(tracked))
          .catch((err) => {
            console.error(`local-logs: safety poll failed for ${tracked.path}: ${(err as Error).message}`);
          });
      }
    }, safetyPollMs);
    this.safetyPollTimer.unref?.();
  }

  stop(): void {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = undefined;
    }
    if (this.safetyPollTimer) {
      clearInterval(this.safetyPollTimer);
      this.safetyPollTimer = undefined;
    }
    for (const watcher of this.dirWatchers.values()) {
      watcher.close();
    }
    this.dirWatchers.clear();
    this.tracked.clear();
    this.started = false;
  }

  private async rescanAll(): Promise<void> {
    await Promise.all(
      this.options.sources.map((source, sourceIndex) => this.rescanSource(sourceIndex, source, "rescan")),
    );
  }

  /** Re-resolves one config source's glob/path and starts watching any newly matched files. */
  private async rescanSource(
    sourceIndex: number,
    source: WatcherSourceConfig,
    scanKind: "initial" | "rescan",
  ): Promise<void> {
    const files = await resolveSourceFiles(source.pattern, source.cwd);
    for (const path of files) {
      if (this.tracked.has(path)) {
        continue;
      }
      await this.addFile(sourceIndex, path, source, scanKind);
    }
  }

  /**
   * Starts tracking one file. `scanKind` controls the `NeverSeenPolicy` fed
   * to `decideTailStart` for a file with no prior offset record:
   *
   * - `"initial"` (present at `start()`): tail semantics per issue #4 —
   *   start at end, unless `--replay`.
   * - `"rescan"` (appeared after the watcher was already running): always
   *   `"replay"`. There's no pre-watcher history to skip, and racing the
   *   file's creation against our first stat would otherwise silently drop
   *   whatever was written before we noticed it.
   *
   * Either way, a file we've *seen before* (an offset row already exists,
   * e.g. across a restart) always resumes/rotates/truncates per
   * `decideTailStart`, regardless of `scanKind`.
   */
  private async addFile(
    sourceIndex: number,
    path: string,
    source: WatcherSourceConfig,
    scanKind: "initial" | "rescan",
  ): Promise<void> {
    const sourceId = deriveSourceId(sourceIndex, path);

    const fileStat = await statFile(path);
    if (!fileStat) {
      // File disappeared between glob resolution and stat; the next rescan
      // or directory event will pick it up again if it comes back.
      return;
    }

    const previous = this.store.getOffset(sourceId);
    const neverSeenPolicy: NeverSeenPolicy =
      scanKind === "initial" ? (this.options.replay ? "replay" : "tail") : "replay";
    const decision = decideTailStart(fileStat, previous, neverSeenPolicy);

    const tracked: TrackedFile = {
      sourceId,
      path,
      source,
      inode: fileStat.inode,
      offset: decision.readFrom,
      changeQueue: Promise.resolve(),
    };
    this.tracked.set(path, tracked);
    this.store.setOffset({ sourceId, inode: fileStat.inode, size: fileStat.size, offset: decision.readFrom });

    if (decision.readFrom < fileStat.size) {
      await this.readAppended(tracked, fileStat.size);
    }

    this.watchDirectoryOf(path);
  }

  /** One `fs.watch` per directory, shared by every tracked file inside it. */
  private watchDirectoryOf(path: string): void {
    const dir = dirname(path);
    if (this.dirWatchers.has(dir)) {
      return;
    }

    const watcher = watch(dir, (_event, filename) => {
      if (!filename) {
        return;
      }
      const changedPath = dir === "." ? filename : `${dir}/${filename}`;
      const tracked = this.tracked.get(changedPath);
      if (!tracked) {
        return;
      }
      // Chain onto the file's own queue rather than firing directly, so a
      // burst of events (rotation reliably fires several back-to-back)
      // resolves in order, one at a time. `.catch` on the chain itself, not
      // just this call, so one failed handler doesn't wedge the queue for
      // every event after it.
      tracked.changeQueue = tracked.changeQueue
        .then(() => this.handleChange(tracked))
        .catch((err) => {
          console.error(`local-logs: watcher failed handling ${changedPath}: ${(err as Error).message}`);
        });
    });
    watcher.on("error", (err) => {
      console.error(`local-logs: directory watch on ${dir} failed: ${(err as Error).message}`);
    });
    this.dirWatchers.set(dir, watcher);
  }

  /**
   * Re-stats a tracked file after a directory change event and applies the
   * same decision table used at startup: append, rotate, or truncate. The
   * event itself is never trusted to say which — only the stat comparison
   * decides (see ADR-0003 and `decideTailStart`).
   */
  private async handleChange(tracked: TrackedFile): Promise<void> {
    const fileStat = await statFile(tracked.path);
    if (!fileStat) {
      // Unlinked (e.g. mid-rotation between the old file's removal and the
      // new one's creation). Nothing to read; a later event or rescan will
      // pick up the recreated file.
      return;
    }

    const previous: OffsetState = {
      sourceId: tracked.sourceId,
      inode: tracked.inode,
      size: fileStat.size,
      offset: tracked.offset,
    };
    // Not a never-seen case (an offset row is always synthesized above), so
    // the never-seen policy is irrelevant here.
    const decision = decideTailStart(fileStat, previous, "tail");

    if (decision.reason === "new" || decision.reason === "truncated") {
      this.lineBuffer.reset(tracked.sourceId);
      tracked.inode = fileStat.inode;
      tracked.offset = 0;
    }

    if (decision.readFrom < fileStat.size) {
      await this.readAppended(tracked, fileStat.size);
    } else {
      this.store.setOffset({
        sourceId: tracked.sourceId,
        inode: tracked.inode,
        size: fileStat.size,
        offset: tracked.offset,
      });
    }
  }

  /**
   * Opens once, reads the delta from `tracked.offset` up to `endSize` in
   * `READ_CHUNK_LIMIT` chunks (so a burst larger than the cap still gets
   * fully drained from one event, rather than stalling until the next
   * directory event arrives), and closes — never a persistent fd (see
   * design notes).
   */
  private async readAppended(tracked: TrackedFile, endSize: number): Promise<void> {
    const handle = await open(tracked.path, "r");
    try {
      while (tracked.offset < endSize) {
        const length = Math.min(endSize - tracked.offset, READ_CHUNK_LIMIT);

        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, tracked.offset);
        if (bytesRead <= 0) {
          break;
        }
        const chunk = buffer.toString("utf8", 0, bytesRead);

        const lines = this.lineBuffer.append(tracked.sourceId, chunk);
        const ingestTs = Date.now();
        for (const rawLine of lines) {
          this.onLine({
            sourceId: tracked.sourceId,
            file: tracked.path,
            tags: tracked.source.tags,
            pattern: tracked.source.regexPattern,
            rawLine,
            ingestTs,
          });
        }

        tracked.offset += bytesRead;
        this.store.setOffset({
          sourceId: tracked.sourceId,
          inode: tracked.inode,
          size: endSize,
          offset: tracked.offset,
        });
      }
    } finally {
      await handle.close();
    }
  }
}
