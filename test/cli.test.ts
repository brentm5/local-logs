import { describe, expect, test } from "bun:test";
import { CliExit, parseArgs } from "../src/cli";

describe("parseArgs", () => {
  test("returns undefined configPath and replay=false when no flags are given", () => {
    expect(parseArgs([])).toEqual({ configPath: undefined, replay: false });
  });

  test("reads --config <path>", () => {
    expect(parseArgs(["--config", "foo.toml"])).toEqual({ configPath: "foo.toml", replay: false });
  });

  test("reads --config=<path>", () => {
    expect(parseArgs(["--config=foo.toml"])).toEqual({ configPath: "foo.toml", replay: false });
  });

  test("reads --replay", () => {
    expect(parseArgs(["--replay"])).toEqual({ configPath: undefined, replay: true });
  });

  test("throws when --config is missing its value", () => {
    expect(() => parseArgs(["--config"])).toThrow(/--config/);
  });

  test("throws CliExit on --help without printing an error", () => {
    expect(() => parseArgs(["--help"])).toThrow(CliExit);
  });

  test("throws on an unknown option", () => {
    expect(() => parseArgs(["--bogus"])).toThrow();
  });
});
