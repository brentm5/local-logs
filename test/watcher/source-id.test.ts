import { describe, expect, test } from "bun:test";
import { deriveSourceId } from "../../src/watcher/source-id";

describe("deriveSourceId", () => {
  test("combines source index and absolute path", () => {
    expect(deriveSourceId(0, "/var/log/app.log")).toBe("0:/var/log/app.log");
  });

  test("is stable across repeated calls with the same inputs", () => {
    expect(deriveSourceId(2, "/var/log/api.log")).toBe(deriveSourceId(2, "/var/log/api.log"));
  });

  test("differs by source index for the same path", () => {
    expect(deriveSourceId(0, "/var/log/app.log")).not.toBe(deriveSourceId(1, "/var/log/app.log"));
  });

  test("differs by path for the same source index", () => {
    expect(deriveSourceId(0, "/var/log/a.log")).not.toBe(deriveSourceId(0, "/var/log/b.log"));
  });
});
