import { describe, expect, test } from "bun:test";
import { defaultConfigPath } from "../src/config/xdg";

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
