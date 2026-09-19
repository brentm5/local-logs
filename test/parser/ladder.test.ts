import { describe, expect, test } from "bun:test";
import { parseLine } from "../../src/parser/ladder";
import type { ParseInput } from "../../src/parser/types";

function makeInput(overrides: Partial<ParseInput> = {}): ParseInput {
  return {
    line: "hello world",
    sourceId: "src-1",
    file: "/var/log/app.log",
    tags: {},
    ingestTs: 1_000,
    ...overrides,
  };
}

describe("parseLine", () => {
  describe("parse ladder rungs", () => {
    test("valid JSON becomes the record root", () => {
      const record = parseLine(makeInput({ line: '{"message":"starting up","count":3}' }));

      expect(record.fields).toEqual({ message: "starting up", count: 3 });
      expect(record.message).toBe("starting up");
    });

    test("JSON with msg normalizes msg -> message", () => {
      const record = parseLine(makeInput({ line: '{"msg":"starting up","count":3}' }));

      expect(record.fields).toEqual({ message: "starting up", count: 3 });
      expect(record.message).toBe("starting up");
      expect(record.fields.msg).toBeUndefined();
    });

    test("logfmt line is parsed into fields", () => {
      const record = parseLine(makeInput({ line: 'level=info msg="request completed" status=200' }));

      expect(record.fields).toEqual({ level: "info", message: "request completed", status: "200" });
      expect(record.message).toBe("request completed");
      expect(record.level).toBe("info");
    });

    test("a custom regex hit extracts named groups", () => {
      const record = parseLine(
        makeInput({
          line: "2026-09-18 12:00:00 ERROR could not connect",
          pattern: "^(?<time>\\S+ \\S+) (?<level>\\w+) (?<message>.*)$",
        }),
      );

      expect(record.fields).toEqual({
        time: "2026-09-18 12:00:00",
        level: "ERROR",
        message: "could not connect",
      });
      expect(record.level).toBe("error");
    });

    test("a custom regex miss falls through to the next rung (JSON)", () => {
      const record = parseLine(
        makeInput({
          line: '{"message":"fallback works"}',
          pattern: "^NEVER_MATCHES$",
        }),
      );

      expect(record.fields).toEqual({ message: "fallback works" });
    });

    test("an invalid regex pattern falls through without throwing", () => {
      const record = parseLine(
        makeInput({
          line: '{"message":"fallback works"}',
          pattern: "(unclosed",
        }),
      );

      expect(record.fields).toEqual({ message: "fallback works" });
    });

    test("plain text with no structure falls all the way to raw", () => {
      const record = parseLine(makeInput({ line: "just some plain text output" }));

      expect(record.fields).toEqual({ message: "just some plain text output" });
      expect(record.message).toBe("just some plain text output");
    });

    test("empty line falls to raw with an empty message", () => {
      const record = parseLine(makeInput({ line: "" }));

      expect(record.fields).toEqual({ message: "" });
      expect(record.message).toBe("");
      expect(record.raw).toBe("");
    });

    test("invalid UTF-8 (replacement characters) is treated as plain text, never throws", () => {
      const line = "bad bytes: ���";
      const record = parseLine(makeInput({ line }));

      expect(record.fields).toEqual({ message: line });
      expect(record.raw).toBe(line);
    });
  });

  describe("message resolution", () => {
    test("stringifies a non-string message field rather than discarding it for the raw line", () => {
      const record = parseLine(makeInput({ line: '{"message":42,"level":"info"}' }));

      expect(record.fields.message).toBe(42);
      expect(record.message).toBe("42");
    });

    test("promotes msg -> message when message is present but empty", () => {
      const record = parseLine(makeInput({ line: '{"msg":"real message","message":""}' }));

      expect(record.fields).toEqual({ message: "real message" });
      expect(record.message).toBe("real message");
    });
  });

  describe("raw preservation", () => {
    test("raw always holds the untouched original line, regardless of rung", () => {
      const line = '{"msg":"hi","level":"ERROR"}';
      const record = parseLine(makeInput({ line }));

      expect(record.raw).toBe(line);
    });
  });

  describe("tag merging", () => {
    test("merges watcher-assigned, user-defined, and parser-extracted tags", () => {
      const record = parseLine(
        makeInput({
          line: '{"message":"hi","level":"warn"}',
          sourceId: "src-42",
          file: "/var/log/api.log",
          tags: { service: "api", env: "local" },
        }),
      );

      expect(record.tags).toEqual({
        service: "api",
        env: "local",
        file: "/var/log/api.log",
        source_id: "src-42",
        level: "warn",
      });
    });

    test("omits the level tag when no level was extracted", () => {
      const record = parseLine(makeInput({ line: "no level here" }));

      expect(record.tags).toEqual({ file: "/var/log/app.log", source_id: "src-1" });
      expect(record.level).toBeNull();
    });
  });

  describe("level promotion", () => {
    test("promotes and lowercases level from JSON", () => {
      const record = parseLine(makeInput({ line: '{"message":"boom","level":"ERROR"}' }));

      expect(record.level).toBe("error");
      expect(record.tags.level).toBe("error");
    });

    test("promotes level from logfmt's lvl alias", () => {
      const record = parseLine(makeInput({ line: 'lvl=WARN msg="disk almost full"' }));

      expect(record.level).toBe("warn");
    });
  });

  describe("timestamp detection", () => {
    test("uses a parsed ts field when present", () => {
      const record = parseLine(makeInput({ line: '{"message":"hi","ts":"2026-01-01T00:00:00Z"}' }));

      expect(record.ts).toBe(Date.parse("2026-01-01T00:00:00Z"));
    });

    test("detects an inline ISO timestamp in plain text", () => {
      const record = parseLine(makeInput({ line: "2026-01-02T03:04:05Z something happened" }));

      expect(record.ts).toBe(Date.parse("2026-01-02T03:04:05Z"));
    });

    test("falls back to ingest time when no timestamp is found", () => {
      const record = parseLine(makeInput({ line: "no timestamp here", ingestTs: 12_345 }));

      expect(record.ts).toBe(12_345);
    });
  });

  describe("sourceId passthrough", () => {
    test("record.sourceId always matches the input sourceId", () => {
      const record = parseLine(makeInput({ sourceId: "src-99" }));
      expect(record.sourceId).toBe("src-99");
    });
  });
});
