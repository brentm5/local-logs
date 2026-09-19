import { describe, expect, test } from "bun:test";
import { extractLevel } from "../../src/parser/level";

describe("extractLevel", () => {
  test("returns an exact canonical level lowercased", () => {
    expect(extractLevel({ level: "ERROR" })).toBe("error");
    expect(extractLevel({ level: "Debug" })).toBe("debug");
  });

  test("checks level, then lvl, then severity, in that order", () => {
    expect(extractLevel({ lvl: "warn" })).toBe("warn");
    expect(extractLevel({ severity: "error" })).toBe("error");
    expect(extractLevel({ level: "debug", lvl: "error" })).toBe("debug");
  });

  test("maps known aliases onto the canonical five levels", () => {
    expect(extractLevel({ level: "trace" })).toBe("debug");
    expect(extractLevel({ level: "warning" })).toBe("warn");
    expect(extractLevel({ level: "err" })).toBe("error");
    expect(extractLevel({ level: "critical" })).toBe("fatal");
    expect(extractLevel({ level: "panic" })).toBe("fatal");
  });

  test("defaults to info when no level field is present", () => {
    expect(extractLevel({})).toBe("info");
    expect(extractLevel({ message: "hi" })).toBe("info");
  });

  test("defaults to info when the level value is not a string", () => {
    expect(extractLevel({ level: 3 })).toBe("info");
    expect(extractLevel({ level: null })).toBe("info");
  });

  test("defaults to info when the level value doesn't match a known level or alias", () => {
    expect(extractLevel({ level: "" })).toBe("info");
    expect(extractLevel({ level: "verbose" })).toBe("info");
  });
});
