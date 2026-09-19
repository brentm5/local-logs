import { describe, expect, test } from "bun:test";
import { parseWithPattern } from "../../src/parser/regex";

describe("parseWithPattern", () => {
  test("extracts named capture groups", () => {
    expect(parseWithPattern("ERROR could not connect", "^(?<level>\\w+) (?<message>.*)$")).toEqual(
      { level: "ERROR", message: "could not connect" },
    );
  });

  test("returns null on no match", () => {
    expect(parseWithPattern("hello", "^(?<level>ERROR)$")).toBeNull();
  });

  test("returns null for an invalid pattern instead of throwing", () => {
    expect(parseWithPattern("hello", "(unclosed")).toBeNull();
  });

  test("returns null for a pattern with no named groups", () => {
    expect(parseWithPattern("hello", "^(\\w+)$")).toBeNull();
  });

  test("a cached compiled pattern still matches correctly across repeated calls", () => {
    const pattern = "^(?<level>\\w+) (?<message>.*)$";
    expect(parseWithPattern("INFO first", pattern)).toEqual({ level: "INFO", message: "first" });
    expect(parseWithPattern("WARN second", pattern)).toEqual({ level: "WARN", message: "second" });
    expect(parseWithPattern("ERROR third", pattern)).toEqual({ level: "ERROR", message: "third" });
  });

  test("a cached invalid pattern keeps returning null on repeated calls", () => {
    const pattern = "(also unclosed";
    expect(parseWithPattern("hello", pattern)).toBeNull();
    expect(parseWithPattern("world", pattern)).toBeNull();
  });
});
