import { describe, expect, test } from "bun:test";
import { LineBuffer } from "../../src/watcher/line-buffer";

describe("LineBuffer", () => {
  test("emits complete lines and holds back a trailing partial line", () => {
    const buffer = new LineBuffer();
    const lines = buffer.append("src-1", "hello\nworld\npartial");
    expect(lines).toEqual(["hello", "world"]);
  });

  test("completes a partial line once its newline arrives in a later chunk", () => {
    const buffer = new LineBuffer();
    expect(buffer.append("src-1", "hel")).toEqual([]);
    expect(buffer.append("src-1", "lo\n")).toEqual(["hello"]);
  });

  test("a chunk ending exactly on a newline emits no trailing empty line", () => {
    const buffer = new LineBuffer();
    expect(buffer.append("src-1", "one\ntwo\n")).toEqual(["one", "two"]);
    // Next chunk starts fresh, not with a spurious leading empty line.
    expect(buffer.append("src-1", "three\n")).toEqual(["three"]);
  });

  test("tracks separate sources independently", () => {
    const buffer = new LineBuffer();
    buffer.append("src-1", "a-partial");
    expect(buffer.append("src-2", "b\n")).toEqual(["b"]);
    expect(buffer.append("src-1", "-line\n")).toEqual(["a-partial-line"]);
  });

  test("reset discards a source's buffered partial line", () => {
    const buffer = new LineBuffer();
    buffer.append("src-1", "half");
    buffer.reset("src-1");
    expect(buffer.append("src-1", "-line\n")).toEqual(["-line"]);
  });

  test("empty chunk with no newline stays buffered", () => {
    const buffer = new LineBuffer();
    expect(buffer.append("src-1", "no newline yet")).toEqual([]);
    expect(buffer.append("src-1", " still going")).toEqual([]);
    expect(buffer.append("src-1", "\n")).toEqual(["no newline yet still going"]);
  });
});
