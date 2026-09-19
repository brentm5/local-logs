import { describe, expect, test } from "bun:test";
import { decideTailStart } from "../../src/watcher/tail";
import type { OffsetState } from "../../src/store/types";

const SOURCE_ID = "0:/var/log/app.log";

describe("decideTailStart", () => {
  test("never seen, tail policy: starts at end (tail semantics)", () => {
    const decision = decideTailStart({ inode: 1, size: 500 }, undefined, "tail");
    expect(decision).toEqual({ readFrom: 500, reason: "never-seen" });
  });

  test("never seen, replay policy: starts at 0", () => {
    const decision = decideTailStart({ inode: 1, size: 500 }, undefined, "replay");
    expect(decision).toEqual({ readFrom: 0, reason: "never-seen" });
  });

  test("same inode, size >= offset: resumes at offset", () => {
    const previous: OffsetState = { sourceId: SOURCE_ID, inode: 1, size: 100, offset: 100 };
    const decision = decideTailStart({ inode: 1, size: 250 }, previous, "tail");
    expect(decision).toEqual({ readFrom: 100, reason: "resume" });
  });

  test("same inode, size === offset exactly: resumes at offset (no-op read)", () => {
    const previous: OffsetState = { sourceId: SOURCE_ID, inode: 1, size: 100, offset: 100 };
    const decision = decideTailStart({ inode: 1, size: 100 }, previous, "tail");
    expect(decision).toEqual({ readFrom: 100, reason: "resume" });
  });

  test("inode changed: new file, starts at 0 regardless of never-seen policy", () => {
    const previous: OffsetState = { sourceId: SOURCE_ID, inode: 1, size: 500, offset: 500 };
    const decision = decideTailStart({ inode: 2, size: 20 }, previous, "tail");
    expect(decision).toEqual({ readFrom: 0, reason: "new" });
  });

  test("same inode, size < offset: truncated, starts at 0", () => {
    const previous: OffsetState = { sourceId: SOURCE_ID, inode: 1, size: 500, offset: 500 };
    const decision = decideTailStart({ inode: 1, size: 10 }, previous, "tail");
    expect(decision).toEqual({ readFrom: 0, reason: "truncated" });
  });

  test("inode change takes priority over the size/offset comparison", () => {
    // Even though the new file's size looks "truncated" relative to the old
    // offset, a changed inode means it's a different file, not truncation.
    const previous: OffsetState = { sourceId: SOURCE_ID, inode: 1, size: 500, offset: 500 };
    const decision = decideTailStart({ inode: 2, size: 5 }, previous, "tail");
    expect(decision.reason).toBe("new");
  });
});
