/** Field names checked, in order, for a parsed-out log level. */
const LEVEL_FIELDS = ["level", "lvl", "severity"];

/** The canonical level values a record's `level` is normalized into. */
const CANONICAL_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;

/** The level assigned when no level field is present or its value is unrecognized. */
const DEFAULT_LEVEL = "info";

/** Non-canonical spellings folded into a canonical level. */
const LEVEL_ALIASES: Record<string, (typeof CANONICAL_LEVELS)[number]> = {
  trace: "debug",
  warning: "warn",
  err: "error",
  critical: "fatal",
  panic: "fatal",
};

/**
 * Best-effort extraction of a log level from a parsed record's fields,
 * normalized to lowercase and folded onto one of `debug`/`info`/`warn`/
 * `error`/`fatal` (`ERROR` -> `error`, `warning` -> `warn`, `err` -> `error`,
 * `critical`/`panic` -> `fatal`) per ADR-0004. Falls back to the default
 * level (`info`) when no level field is present or its value doesn't
 * recognize as a level, rather than leaving the record's level unset.
 */
export function extractLevel(fields: Record<string, unknown>): string {
  for (const field of LEVEL_FIELDS) {
    const value = fields[field];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    const normalized = value.toLowerCase();
    if ((CANONICAL_LEVELS as readonly string[]).includes(normalized)) {
      return normalized;
    }
    const alias = LEVEL_ALIASES[normalized];
    if (alias) {
      return alias;
    }
  }

  return DEFAULT_LEVEL;
}
