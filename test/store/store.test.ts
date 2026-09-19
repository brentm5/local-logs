import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import type { RecordInput } from "../../src/store/types";

function makeRecord(overrides: Partial<RecordInput> = {}): RecordInput {
  return {
    ts: 1_000,
    sourceId: "src-1",
    level: "info",
    message: "hello world",
    raw: "hello world",
    fields: { message: "hello world" },
    tags: {},
    ...overrides,
  };
}

describe("Store", () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "local-logs-store-test-"));
    store = new Store(join(dir, "test.db"));
  });

  afterEach(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  describe("insertBatch", () => {
    test("inserts records and they are queryable immediately", async () => {
      await store.insertBatch([makeRecord()]);

      const results = store.queryByTimeRange({ from: 0, to: 2_000 });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        ts: 1_000,
        sourceId: "src-1",
        level: "info",
        message: "hello world",
        raw: "hello world",
      });
    });

    test("persists tags alongside the record", async () => {
      await store.insertBatch([
        makeRecord({ tags: { service: "api", env: "local" } }),
      ]);

      const results = store.queryByTag("service", "api");
      expect(results).toHaveLength(1);
      expect(results[0]!.tags).toEqual({ service: "api", env: "local" });
    });

    test("round-trips embedded newlines in message", async () => {
      const multiline = "line one\nline two\nline three";
      await store.insertBatch([makeRecord({ message: multiline, raw: multiline })]);

      const results = store.queryByTimeRange({ from: 0, to: 2_000 });
      expect(results[0]!.message).toBe(multiline);
    });

    test("round-trips fields_json", async () => {
      await store.insertBatch([
        makeRecord({ fields: { message: "hello world", count: 42, nested: { a: 1 } } }),
      ]);

      const results = store.queryByTimeRange({ from: 0, to: 2_000 });
      expect(results[0]!.fields).toEqual({
        message: "hello world",
        count: 42,
        nested: { a: 1 },
      });
    });

    test("does nothing on an empty batch", async () => {
      await store.insertBatch([]);
      expect(store.queryByTimeRange({ from: 0, to: Number.MAX_SAFE_INTEGER })).toHaveLength(0);
    });
  });

  describe("queries", () => {
    beforeEach(async () => {
      await store.insertBatch([
        makeRecord({ ts: 1_000, sourceId: "a", message: "starting up", tags: { service: "api" } }),
        makeRecord({ ts: 2_000, sourceId: "b", message: "request failed", level: "error", tags: { service: "worker" } }),
        makeRecord({ ts: 3_000, sourceId: "a", message: "request completed", tags: { service: "api" } }),
      ]);
    });

    test("queryByTimeRange returns records within [from, to] ordered by ts", () => {
      const results = store.queryByTimeRange({ from: 1_500, to: 3_000 });
      expect(results.map((r) => r.ts)).toEqual([2_000, 3_000]);
    });

    test("queryByTimeRange can scope to a source", () => {
      const results = store.queryByTimeRange({ from: 0, to: 5_000, sourceId: "a" });
      expect(results.map((r) => r.ts)).toEqual([1_000, 3_000]);
    });

    test("queryByTag filters by exact key/value", () => {
      const results = store.queryByTag("service", "worker");
      expect(results).toHaveLength(1);
      expect(results[0]!.message).toBe("request failed");
    });

    test("queryByText matches via FTS5 over message", () => {
      const results = store.queryByText("request");
      expect(results.map((r) => r.message).sort()).toEqual([
        "request completed",
        "request failed",
      ]);
    });

    test("queryByText returns no results for non-matching terms", () => {
      expect(store.queryByText("nonexistent")).toHaveLength(0);
    });
  });

  describe("enqueue", () => {
    test("flushes automatically after ~100ms", async () => {
      store.enqueue(makeRecord({ ts: 5_000 }));

      expect(store.queryByTimeRange({ from: 0, to: 10_000 })).toHaveLength(0);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(store.queryByTimeRange({ from: 0, to: 10_000 })).toHaveLength(1);
    });

    test("flushes immediately once 500 records are queued", () => {
      for (let i = 0; i < 500; i++) {
        store.enqueue(makeRecord({ ts: i }));
      }

      // No await/timer needed: the 500th enqueue triggers a synchronous flush.
      expect(store.queryByTimeRange({ from: 0, to: 1_000 })).toHaveLength(500);
    });

    test("flush() drains the queue synchronously", () => {
      store.enqueue(makeRecord({ ts: 6_000 }));
      store.flush();

      expect(store.queryByTimeRange({ from: 0, to: 10_000 })).toHaveLength(1);
    });
  });

  describe("offsets", () => {
    test("getOffset returns undefined when no offset is recorded", () => {
      expect(store.getOffset("src-1")).toBeUndefined();
    });

    test("setOffset then getOffset round-trips", () => {
      store.setOffset({ sourceId: "src-1", inode: 42, size: 100, offset: 50 });
      expect(store.getOffset("src-1")).toEqual({
        sourceId: "src-1",
        inode: 42,
        size: 100,
        offset: 50,
      });
    });

    test("setOffset upserts on repeated calls for the same source", () => {
      store.setOffset({ sourceId: "src-1", inode: 42, size: 100, offset: 50 });
      store.setOffset({ sourceId: "src-1", inode: 42, size: 200, offset: 150 });

      expect(store.getOffset("src-1")).toEqual({
        sourceId: "src-1",
        inode: 42,
        size: 200,
        offset: 150,
      });
    });
  });

  describe("scale", () => {
    test("inserts 10k records across sources in batches and all three query types return correct results", async () => {
      const sources = ["svc-a", "svc-b", "svc-c"];
      const batch: RecordInput[] = [];
      for (let i = 0; i < 10_000; i++) {
        const sourceId = sources[i % sources.length]!;
        batch.push(
          makeRecord({
            ts: i,
            sourceId,
            level: i % 97 === 0 ? "error" : "info",
            message: i % 97 === 0 ? `boom ${i}` : `tick ${i}`,
            raw: `tick ${i}`,
            fields: { seq: i },
            tags: { service: sourceId },
          }),
        );
      }

      // Insert in chunks to exercise the batched write path rather than one
      // giant transaction.
      const chunkSize = 500;
      for (let i = 0; i < batch.length; i += chunkSize) {
        await store.insertBatch(batch.slice(i, i + chunkSize));
      }

      const byTime = store.queryByTimeRange({ from: 100, to: 199 });
      expect(byTime).toHaveLength(100);
      expect(byTime.every((r) => r.ts >= 100 && r.ts <= 199)).toBe(true);

      const byTag = store.queryByTag("service", "svc-b");
      expect(byTag).toHaveLength(3_333);
      expect(byTag.every((r) => r.sourceId === "svc-b")).toBe(true);

      const byText = store.queryByText("boom");
      const expectedBoomCount = Math.floor(9_999 / 97) + 1;
      expect(byText).toHaveLength(expectedBoomCount);

      expect(db_autoVacuum(store)).toBe(2);
    });
  });
});

function db_autoVacuum(store: Store): number {
  return (store.raw().query("PRAGMA auto_vacuum").get() as { auto_vacuum: number })
    .auto_vacuum;
}
