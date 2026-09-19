# ADR-0004: Parse ladder with per-source regex; no multi-line in v1

Date: 2026-09-18
Status: Accepted

## Context

The README's parser was a fixed ladder: JSON → logfmt → raw. Grilling surfaced
a requirement it did not cover — parsing custom formats to extract specific
fields, since much local dev output (Rails, Vite, nginx) is neither JSON nor
logfmt.

Separately, multi-line records (stack traces, pretty-printed JSON) are the
largest single threat to the readability claim: under a one-line-one-record
model a stack trace becomes 30 rows exactly when readability matters most.

## Decision

### Parse ladder

Per line, first match wins:

1. **Source's custom regex**, if declared — named capture groups become record
   fields.
2. **JSON** — the parsed object is the record root.
3. **logfmt** — extracted key/values become the record root.
4. **Raw** — `{"message": "<raw line>"}`.

Custom regex goes *first*: a source that declares one knows its own format
better than the generic parsers do.

After the root is established, tags are merged on, `msg` is normalized to
`message`, and well-known fields (`level`) are promoted to tags. `level` is
normalized onto one of five canonical values — `debug`, `info`, `warn`,
`error`, `fatal` — folding common aliases (`trace`→`debug`, `warning`→`warn`,
`err`→`error`, `critical`/`panic`→`fatal`); a record with no recognizable
level defaults to `info` rather than leaving the field unset, since "no level
detected" and "this is an info-level line" are indistinguishable in practice
for the local-dev output this parses.

Regex patterns are unvalidated in v1. A bad pattern simply fails to match and
the line falls through to the next rung — degrading to raw rather than failing
loudly.

### Multi-line records

Out of scope for v1. **But** `message` must tolerate embedded newlines from day
one, so multi-line assembly can be added later without a schema migration.

## Consequences

- Named-regex parsing is roughly 50 lines of code and introduces no new
  concepts — it is one more rung on an existing ladder.
- A 30-line stack trace renders as 30 rows. This is a known, accepted gap and
  the most likely first thing to want after v1 ships.
- Silent degradation on a bad regex is friendly at runtime but hard to debug. A
  future `--validate-config` or a UI warning when a source's pattern never
  matches would address it.

## Alternatives rejected

**Grok-style pattern library** (`%{TIMESTAMP}`, `%{LOGLEVEL}`, composable, with
a bundled library for common tools). Far more expressive, and the path most log
tools take. Rejected as substantially more machinery plus an ongoing pattern
maintenance burden, for capability that named capture groups already cover at
local-dev scale.

**No custom parsing at all.** Simplest, and custom formats would still be
searchable as raw `message` text — just not columnized. Rejected because
columnizing is the core value proposition, and non-JSON output is common.

**Continuation-heuristic multi-line in v1** (a non-parsing line starting with
whitespace attaches to the previous record, flushed on an idle timer).
Deferred, not rejected on merit — it is the likely v1.1 design.
