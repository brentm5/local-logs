// Best-effort timestamp detection (ADR-0004): look for an ISO 8601 timestamp
// anywhere in the line (parsed record fields commonly carry one under `ts`,
// `time`, or `timestamp`, but plain-text lines have it inline), and fall back
// to ingest time if nothing parses. This is deliberately narrow — expanding
// the set of recognized formats is a future improvement, not a v1 goal.
const ISO_8601_PATTERN =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;

/** Field names checked, in order, for a parsed-out timestamp value. */
const TIMESTAMP_FIELDS = ["ts", "time", "timestamp"];

/**
 * Best-effort timestamp detection over a parsed record's fields and, failing
 * that, the raw line. Returns epoch milliseconds, or `undefined` if nothing
 * parses as a valid date.
 */
export function detectTimestamp(fields: Record<string, unknown>, line: string): number | undefined {
  for (const field of TIMESTAMP_FIELDS) {
    const value = fields[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      // Heuristic: values below this are almost certainly seconds, not ms
      // (seconds-since-epoch stays below this threshold until the year 2286).
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === "string") {
      const parsed = parseDate(value);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  const match = ISO_8601_PATTERN.exec(line);
  if (match) {
    return parseDate(match[0]);
  }

  return undefined;
}

function parseDate(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}
