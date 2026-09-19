/** Field names checked, in order, for a parsed-out log level. */
const LEVEL_FIELDS = ["level", "lvl", "severity"];

/**
 * Best-effort extraction of a log level from a parsed record's fields,
 * normalized to lowercase (`ERROR` -> `error`) per ADR-0004. Returns `null`
 * if no level field is present or its value isn't a string.
 */
export function extractLevel(fields: Record<string, unknown>): string | null {
  for (const field of LEVEL_FIELDS) {
    const value = fields[field];
    if (typeof value === "string" && value.length > 0) {
      return value.toLowerCase();
    }
  }
  return null;
}
