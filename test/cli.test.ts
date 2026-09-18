import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli";

describe("parseArgs", () => {
  test("returns undefined configPath when --config is absent", () => {
    expect(parseArgs([])).toEqual({ configPath: undefined });
  });

  test("reads --config <path>", () => {
    expect(parseArgs(["--config", "foo.toml"])).toEqual({ configPath: "foo.toml" });
  });

  test("reads --config=<path>", () => {
    expect(parseArgs(["--config=foo.toml"])).toEqual({ configPath: "foo.toml" });
  });

  test("throws when --config is missing its value", () => {
    expect(() => parseArgs(["--config"])).toThrow(/--config/);
  });
});
