import { parseLine } from "../parser/ladder";
import type { Store } from "../store/store";
import type { LoadedConfig } from "../config/types";
import { Watcher } from "./watcher";
import type { WatchedLine, WatcherSourceConfig } from "./types";

/**
 * Builds the per-`[[source]]` watcher config from a loaded app config. Index
 * order matches `resolvedSources`, which is what `source_id` derivation
 * (see `deriveSourceId`) keys off.
 */
function toWatcherSources(config: LoadedConfig): WatcherSourceConfig[] {
  return config.resolvedSources.map((source) => ({
    pattern: source.path,
    tags: source.tags,
    regexPattern: source.pattern,
    cwd: process.cwd(),
  }));
}

/**
 * Wires the watcher's raw `(tags, raw_line)` events into the parse ladder
 * and the store, per CONTEXT.md's shape: `Watcher -> Parser -> Store`.
 */
function handleWatchedLine(store: Store, line: WatchedLine): void {
  const record = parseLine({
    line: line.rawLine,
    sourceId: line.sourceId,
    file: line.file,
    tags: line.tags,
    pattern: line.pattern,
    ingestTs: line.ingestTs,
  });
  store.enqueue(record);
}

/** Creates and starts the watcher for every configured source, per issue #4 / ADR-0003. */
export async function startWatcher(
  config: LoadedConfig,
  store: Store,
  replay: boolean,
): Promise<Watcher> {
  const watcher = new Watcher(
    store,
    { sources: toWatcherSources(config), replay },
    (line) => handleWatchedLine(store, line),
  );
  await watcher.start();
  return watcher;
}
