import { describe, expect, test } from "bun:test";
import { defaultConfigPath, defaultDbPath } from "../src/xdg";

describe("defaultConfigPath", () => {
  test("uses XDG_CONFIG_HOME when set", () => {
    expect(
      defaultConfigPath({ XDG_CONFIG_HOME: "/custom/config", HOME: "/home/user" }),
    ).toBe("/custom/config/local-logs/config.toml");
  });

  test("falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
    expect(defaultConfigPath({ HOME: "/home/user" })).toBe(
      "/home/user/.config/local-logs/config.toml",
    );
  });

  test("falls back to ~/.config when XDG_CONFIG_HOME is empty", () => {
    expect(defaultConfigPath({ XDG_CONFIG_HOME: "", HOME: "/home/user" })).toBe(
      "/home/user/.config/local-logs/config.toml",
    );
  });

  test("throws when HOME cannot be determined and XDG_CONFIG_HOME is unset", () => {
    expect(() => defaultConfigPath({})).toThrow(/HOME/);
  });
});

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
