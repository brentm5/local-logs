import { describe, expect, test } from "bun:test";
import { defaultDbPath } from "../../src/store/xdg";

describe("defaultDbPath", () => {
  test("uses XDG_DATA_HOME when set", () => {
    expect(defaultDbPath({ XDG_DATA_HOME: "/custom/data", HOME: "/home/user" })).toBe(
      "/custom/data/local-logs/local-logs.db",
    );
  });

  test("falls back to ~/.local/share when XDG_DATA_HOME is unset", () => {
    expect(defaultDbPath({ HOME: "/home/user" })).toBe(
      "/home/user/.local/share/local-logs/local-logs.db",
    );
  });

  test("falls back to ~/.local/share when XDG_DATA_HOME is empty", () => {
    expect(defaultDbPath({ XDG_DATA_HOME: "", HOME: "/home/user" })).toBe(
      "/home/user/.local/share/local-logs/local-logs.db",
    );
  });

  test("throws when HOME cannot be determined and XDG_DATA_HOME is unset", () => {
    expect(() => defaultDbPath({})).toThrow(/HOME/);
  });
});
