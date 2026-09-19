# ADR-0002: SQLite + FTS5 as the store

Date: 2026-09-18
Status: Accepted

## Context

The store must support: append-heavy writes, full-text search over messages,
attribute (tag) filtering, time-ordered reads, and time-range deletion for
retention. It must be embedded in a Bun binary, and the README states a
preference for using something already built rather than hand-rolling storage
and indexing.

The Bun constraint prunes the field hard: options are effectively `bun:sqlite`
or a native module compiled and shipped per platform, which fights the
single-binary goal.

## Decision

SQLite via `bun:sqlite`, single database file, with:

- `records` table with promoted columns `(id, ts, source_id, level, message,
  raw, fields_json)`.
- `tags` table `(record_id, key, value)` for open key/value attributes.
- FTS5 virtual table over `message`, **contentless** (`content=''`).
- Indexes on `(ts)` and `(source_id, ts)`.
- `journal_mode = WAL`.
- `auto_vacuum = INCREMENTAL`, set at database creation.

`ts`, `source_id`, and `level` are promoted to real columns because they appear
in essentially every query — time ordering, source selector, level filter — and
resolving them through the tags table would mean a join on the hot path.

FTS5 is contentless so the index does not duplicate message text. This roughly
halves on-disk footprint, at the cost of needing the `records` row to display a
hit — which queries do anyway.

## Consequences

- Text search, attribute filtering, ordering, and time-range delete all come
  from one engine with no index code to write.
- Retention deletes leave free pages behind; `PRAGMA incremental_vacuum` after
  each prune reclaims them. See ADR-0003.
- `auto_vacuum` cannot be changed after tables exist without dumping and
  rebuilding, so it must be set on first creation.
- FTS5 write amplification remains the main storage cost, reduced but not
  eliminated by the contentless index.

## Alternatives rejected

**Append-only JSONL + in-memory index.** The best possible write path — logs
*are* an append-only stream — and files stay greppable by hand. Rejected
because search, filtering, and restart recovery all become hand-rolled, which
the README explicitly rules out.

**Time-partitioned JSONL segments (Quickwit/Loki-shaped).** The log-native
answer, and the reason the README name-checks Quickwit. Retention becomes
`unlink()`, with no vacuum problem at all. Rejected because getting search
requires writing an inverted index — the exact work being avoided. It is the
better design at a scale this tool does not target.

**DuckDB.** Strong at analytical scans, but columnar storage is the wrong shape
for high-frequency single-row inserts, and aggregations are out of scope — its
costs would be paid for benefits unused.

**LMDB / key-value.** Fast ordered writes, but no text search or attribute
query; an index layer would sit on top, with less transparency than JSONL.

**In-memory ring buffer.** Briefly recommended during design on the assumption
that only the current session mattered. Withdrawn once search over all ingested
logs and survival across restarts were confirmed as requirements.
