// A source's pattern is constant across its entire line stream, so compiled
// RegExps are cached by pattern string rather than rebuilt per line. `null`
// caches an invalid pattern too, so a bad regex only fails to compile once.
const compiledPatterns = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
  const cached = compiledPatterns.get(pattern);
  if (cached !== undefined) {
    return cached;
  }

  let regex: RegExp | null;
  try {
    regex = new RegExp(pattern);
  } catch {
    regex = null;
  }
  compiledPatterns.set(pattern, regex);
  return regex;
}

/**
 * Runs a source's custom regex (ADR-0004, first rung of the ladder) against a
 * line. Named capture groups become record fields; unnamed groups are
 * ignored. Returns `null` on no match, an invalid pattern, or a pattern with
 * no named groups (which could never produce a useful record) — in every
 * case the line falls through to the next rung, never throwing.
 */
export function parseWithPattern(line: string, pattern: string): Record<string, string> | null {
  const regex = compile(pattern);
  if (!regex) {
    return null;
  }

  // A cached regex is stateful when global/sticky; neither flag is ever
  // passed in `pattern`, but reset defensively so a future caller can't be
  // bitten by cross-call lastIndex drift.
  regex.lastIndex = 0;
  const match = regex.exec(line);
  if (!match || !match.groups) {
    return null;
  }

  const fields: Record<string, string> = {};
  let matchedAny = false;
  for (const [key, value] of Object.entries(match.groups)) {
    if (value !== undefined) {
      fields[key] = value;
      matchedAny = true;
    }
  }

  return matchedAny ? fields : null;
}
