// key=value pairs, in order: a double-quoted value (with backslash escapes),
// a single-quoted value, or a bare token running up to the next space. Values
// are optional (`key=`) and bare keys (`key` alone, logfmt's boolean shorthand)
// are matched by the trailing alternative.
const PAIR_PATTERN =
  /([a-zA-Z_][a-zA-Z0-9_.]*)=(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S*))|([a-zA-Z_][a-zA-Z0-9_.]*)/g;

/**
 * Parses a logfmt line (`key=value key2="quoted value" key3`) into an object.
 * Returns `null` if the line contains no recognizable `key=value` or bare-key
 * pair, so the caller can fall through to the next rung of the ladder.
 */
export function parseLogfmt(line: string): Record<string, string> | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const result: Record<string, string> = {};
  let matchedPair = false;

  PAIR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PAIR_PATTERN.exec(trimmed)) !== null) {
    const [, dqKey, dqValue, sqValue, bareValue, boolKey] = match;

    if (dqKey !== undefined) {
      matchedPair = true;
      const value = dqValue !== undefined ? unescapeDoubleQuoted(dqValue) : (sqValue ?? bareValue ?? "");
      result[dqKey] = value;
    } else if (boolKey !== undefined) {
      result[boolKey] = "true";
    }
  }

  // Require at least one real `key=value` pair; a line of only bare words
  // (which also satisfies PAIR_PATTERN) isn't logfmt, it's plain text.
  if (!matchedPair) {
    return null;
  }

  return result;
}

function unescapeDoubleQuoted(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}
