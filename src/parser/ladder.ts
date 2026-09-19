import type { LogRecordInput } from "../store/types";
import { extractLevel } from "./level";
import { parseLogfmt } from "./logfmt";
import { parseWithPattern } from "./regex";
import { detectTimestamp } from "./timestamp";
import type { ParseInput } from "./types";

/**
 * Parses one raw log line into a `LogRecordInput`, per the parse ladder in
 * ADR-0004:
 *
 * 1. Source's custom regex, if declared (named capture groups -> fields).
 * 2. JSON.
 * 3. logfmt.
 * 4. Raw: `{ message: <line> }`.
 *
 * First match wins. `raw` always preserves the original line untouched. `msg`
 * is normalized to `message`; `level` is promoted to a tag and lowercased.
 * Tags are merged from three origins: watcher-assigned (`file`, `source_id`),
 * user-defined (config), and parser-extracted (`level`).
 */
export function parseLine(input: ParseInput): LogRecordInput {
  const root = parseRoot(input.line, input.pattern);
  const fields = normalizeMessage(root);
  const level = extractLevel(fields);
  const ts = detectTimestamp(fields, input.line) ?? input.ingestTs;

  const tags: Record<string, string> = {
    ...input.tags,
    file: input.file,
    source_id: input.sourceId,
  };
  if (level !== null) {
    tags.level = level;
  }

  return {
    ts,
    sourceId: input.sourceId,
    level,
    message: resolveMessage(fields, input.line),
    raw: input.line,
    fields,
    tags,
  };
}

/**
 * Resolves the record's top-level `message` from the parsed root. A string
 * `message` field is used as-is; a non-string one (e.g. a JSON line with a
 * numeric `message`) is stringified rather than discarded, so the top-level
 * `message` never diverges from `fields.message`. Only a root with no
 * `message` field at all (raw fallback) uses the original line.
 */
function resolveMessage(fields: Record<string, unknown>, line: string): string {
  if (!("message" in fields)) {
    return line;
  }
  const value = fields.message;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Runs the ladder's first three rungs, falling back to raw on no match. */
function parseRoot(line: string, pattern: string | undefined): Record<string, unknown> {
  if (pattern) {
    const viaPattern = parseWithPattern(line, pattern);
    if (viaPattern) {
      return viaPattern;
    }
  }

  const viaJson = parseJson(line);
  if (viaJson) {
    return viaJson;
  }

  const viaLogfmt = parseLogfmt(line);
  if (viaLogfmt) {
    return viaLogfmt;
  }

  return { message: line };
}

/**
 * Parses a line as JSON, requiring the top-level value to be a plain object
 * (an array or scalar isn't a useful record root and falls through instead).
 */
function parseJson(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes `msg` -> `message` on the record root, per ADR-0004. Promotes
 * `msg` whenever `message` is absent or empty, so a root like
 * `{ msg: "...", message: "" }` doesn't strand the real content under `msg`.
 */
function normalizeMessage(fields: Record<string, unknown>): Record<string, unknown> {
  const hasUsableMessage = typeof fields.message === "string" && fields.message.length > 0;
  if ("msg" in fields && !hasUsableMessage) {
    const { msg, ...rest } = fields;
    return { ...rest, message: msg };
  }
  return fields;
}
