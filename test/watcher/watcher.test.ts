import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, rename, writeFile, appendFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import { Watcher } from "../../src/watcher/watcher";
import type { WatchedLine, WatcherSourceConfig } from "../../src/watcher/types";

/** Polls until `predicate` is true or the timeout elapses, for fs.watch-driven async assertions. */
async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out");
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("Watcher", () => {
  let dir: string;
  let dbDir: string;
  let store: Store;
  let watcher: Watcher | undefined;
  let received: WatchedLine[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "local-logs-watcher-test-"));
    dbDir = await mkdtemp(join(tmpdir(), "local-logs-watcher-db-"));
    store = new Store(join(dbDir, "test.db"));
    received = [];
  });

  afterEach(async () => {
    watcher?.stop();
    store.close();
    await rm(dir, { recursive: true, force: true });
    await rm(dbDir, { recursive: true, force: true });
  });

  function makeSource(filename: string, overrides: Partial<WatcherSourceConfig> = {}): WatcherSourceConfig {
    return {
      pattern: filename,
      tags: {},
      regexPattern: undefined,
      cwd: dir,
      ...overrides,
    };
  }

  function startWatcher(sources: WatcherSourceConfig[], replay: boolean): Watcher {
    const w = new Watcher(store, { sources, replay, rescanIntervalMs: 100 }, (line) => {
      received.push(line);
    });
    watcher = w;
    return w;
  }

  test("first-seen file with no --replay starts at end: pre-existing content is not emitted", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "old-line-1\nold-line-2\n");

    await startWatcher([makeSource("app.log")], false).start();
    await appendFile(path, "new-line\n");

    await waitFor(() => received.some((l) => l.rawLine === "new-line"));

    expect(received.map((l) => l.rawLine)).toEqual(["new-line"]);
  });

  test("--replay starts first-seen files at 0", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "old-line-1\nold-line-2\n");

    await startWatcher([makeSource("app.log")], true).start();

    await waitFor(() => received.length >= 2);

    expect(received.map((l) => l.rawLine)).toEqual(["old-line-1", "old-line-2"]);
  });

  test("emits appended lines as they're written", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    await startWatcher([makeSource("app.log")], false).start();
    await appendFile(path, "line-1\n");
    await waitFor(() => received.length >= 1);
    await appendFile(path, "line-2\n");
    await waitFor(() => received.length >= 2);

    expect(received.map((l) => l.rawLine)).toEqual(["line-1", "line-2"]);
  });

  test("buffers a partial trailing line until the newline arrives", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    await startWatcher([makeSource("app.log")], false).start();
    await appendFile(path, "partial-no-newline-yet");
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toEqual([]);

    await appendFile(path, " completed\n");
    await waitFor(() => received.length >= 1);

    expect(received.map((l) => l.rawLine)).toEqual(["partial-no-newline-yet completed"]);
  });

  test("survives rotation (mv + recreate) with no dropped or duplicated lines", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    await startWatcher([makeSource("app.log")], false).start();

    await appendFile(path, "before-rotation\n");
    await waitFor(() => received.length >= 1);

    // Rotate: move the file aside, recreate at the same path (new inode).
    await rename(path, join(dir, "app.log.1"));
    await writeFile(path, "");
    await appendFile(path, "after-rotation\n");

    await waitFor(() => received.length >= 2);

    expect(received.map((l) => l.rawLine)).toEqual(["before-rotation", "after-rotation"]);
  });

  test("detects truncation (size < offset, same inode) and restarts at 0", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    await startWatcher([makeSource("app.log")], false).start();

    await appendFile(path, "line-a\nline-b\n");
    await waitFor(() => received.length >= 2);

    await truncate(path, 0);
    await appendFile(path, "line-c\n");

    await waitFor(() => received.length >= 3);

    expect(received.map((l) => l.rawLine)).toEqual(["line-a", "line-b", "line-c"]);
  });

  test("resumes correctly across a simulated restart: no dropped or duplicated lines", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    const first = startWatcher([makeSource("app.log")], false);
    await first.start();

    await appendFile(path, "before-restart\n");
    await waitFor(() => received.length >= 1);

    first.stop();

    // While "down", more gets appended.
    await appendFile(path, "during-downtime\n");

    received = [];
    const second = startWatcher([makeSource("app.log")], false);
    await second.start();

    await waitFor(() => received.length >= 1);
    await appendFile(path, "after-restart\n");
    await waitFor(() => received.length >= 2);

    expect(received.map((l) => l.rawLine)).toEqual(["during-downtime", "after-restart"]);
  });

  test("full manual-test scenario: write, rotate, write, restart mid-stream — no drops or dupes", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    const first = startWatcher([makeSource("app.log")], false);
    await first.start();

    await appendFile(path, "line-1\n");
    await waitFor(() => received.length >= 1);

    await rename(path, join(dir, "app.log.1"));
    await writeFile(path, "");
    await appendFile(path, "line-2\n");
    await waitFor(() => received.length >= 2);

    first.stop();
    await appendFile(path, "line-3\n");

    received = [];
    const second = startWatcher([makeSource("app.log")], false);
    await second.start();
    await waitFor(() => received.length >= 1);

    await appendFile(path, "line-4\n");
    await waitFor(() => received.length >= 2);

    expect(received.map((l) => l.rawLine)).toEqual(["line-3", "line-4"]);
  });

  test("glob rescan picks up a new matching file created after start", async () => {
    await writeFile(join(dir, "existing.log"), "");

    await startWatcher([makeSource("*.log")], false).start();

    const newPath = join(dir, "new.log");
    await writeFile(newPath, "");
    await appendFile(newPath, "from-new-file\n");

    await waitFor(() => received.some((l) => l.rawLine === "from-new-file"), 3000);

    expect(received.map((l) => l.rawLine)).toContain("from-new-file");
  });

  test("persists tags and pattern from the source config onto each emitted line", async () => {
    const path = join(dir, "app.log");
    await writeFile(path, "");

    await startWatcher(
      [makeSource("app.log", { tags: { service: "api" }, regexPattern: "^(?<msg>.*)$" })],
      false,
    ).start();

    await appendFile(path, "hello\n");
    await waitFor(() => received.length >= 1);

    expect(received[0]!.tags).toEqual({ service: "api" });
    expect(received[0]!.pattern).toBe("^(?<msg>.*)$");
    expect(received[0]!.file).toBe(path);
  });
});
