import { describe, expect, test } from "bun:test";
import { parseConfig } from "../src/config/parse";

describe("parseConfig", () => {
  test("applies defaults when [server] is omitted", () => {
    const config = parseConfig("");

    expect(config.server).toEqual({
      port: 4000,
      retention_hours: 24,
      max_files: 25,
    });
    expect(config.sources).toEqual([]);
  });

  test("applies per-field defaults when [server] is partially specified", () => {
    const config = parseConfig(`
[server]
port = 5000
`);

    expect(config.server).toEqual({
      port: 5000,
      retention_hours: 24,
      max_files: 25,
    });
  });

  test("parses declared sources", () => {
    const config = parseConfig(`
[[source]]
path = "logs/*.log"
tags = { service = "api" }

[[source]]
path = "worker.log"
pattern = "^(?<level>\\\\w+) (?<message>.*)$"
`);

    expect(config.sources).toEqual([
      { path: "logs/*.log", tags: { service: "api" }, pattern: undefined },
      { path: "worker.log", tags: {}, pattern: "^(?<level>\\w+) (?<message>.*)$" },
    ]);
  });

  test("throws when max_files is not a positive number", () => {
    expect(() =>
      parseConfig(`
[server]
max_files = -1
`),
    ).toThrow(/positive/i);
  });

  test("throws when max_files is zero", () => {
    expect(() =>
      parseConfig(`
[server]
max_files = 0
`),
    ).toThrow(/positive/i);
  });

  test("throws on unknown top-level keys", () => {
    expect(() => parseConfig(`unknown = true`)).toThrow(/unknown key/i);
  });

  test("throws on unknown [server] keys", () => {
    expect(() =>
      parseConfig(`
[server]
port = 4000
bogus = 1
`),
    ).toThrow(/unknown key/i);
  });

  test("throws on unknown [[source]] keys", () => {
    expect(() =>
      parseConfig(`
[[source]]
path = "a.log"
bogus = 1
`),
    ).toThrow(/unknown key/i);
  });

  test("throws when a source is missing path", () => {
    expect(() =>
      parseConfig(`
[[source]]
tags = { service = "api" }
`),
    ).toThrow(/path/i);
  });

  test("throws on malformed TOML", () => {
    expect(() => parseConfig("this is not valid toml [[[")).toThrow();
  });

  test("throws when a tag value is not a string", () => {
    expect(() =>
      parseConfig(`
[[source]]
path = "a.log"
tags = { count = 5 }
`),
    ).toThrow();
  });

  test("throws when pattern is not a string", () => {
    expect(() =>
      parseConfig(`
[[source]]
path = "a.log"
pattern = true
`),
    ).toThrow();
  });
});
