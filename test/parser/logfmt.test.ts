import { describe, expect, test } from "bun:test";
import { parseLogfmt } from "../../src/parser/logfmt";

describe("parseLogfmt", () => {
  test("parses bare key=value pairs", () => {
    expect(parseLogfmt("level=info status=200")).toEqual({ level: "info", status: "200" });
  });

  test("parses double-quoted values, including embedded spaces", () => {
    expect(parseLogfmt('msg="request completed" level=info')).toEqual({
      msg: "request completed",
      level: "info",
    });
  });

  test("unescapes a backslash-escaped quote inside a double-quoted value", () => {
    expect(parseLogfmt('q="she said \\"hi\\"" level=info')).toEqual({
      q: 'she said "hi"',
      level: "info",
    });
  });

  test("parses single-quoted values", () => {
    expect(parseLogfmt("msg='hello there' level=info")).toEqual({
      msg: "hello there",
      level: "info",
    });
  });

  test("treats a bare key with no '=' as a boolean flag", () => {
    expect(parseLogfmt("cached level=info")).toEqual({ cached: "true", level: "info" });
  });

  test("returns null for plain text with no key=value pairs", () => {
    expect(parseLogfmt("just some plain text")).toBeNull();
  });

  test("returns null for an empty line", () => {
    expect(parseLogfmt("")).toBeNull();
    expect(parseLogfmt("   ")).toBeNull();
  });

  test("returns null for a JSON line", () => {
    expect(parseLogfmt('{"level":"info"}')).toBeNull();
  });
});
