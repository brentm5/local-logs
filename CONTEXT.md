# Context: local-logs

A local log viewer for development workflows. Single Bun-compiled binary that
watches log files on disk, parses them into structured records, persists them
to SQLite, and serves a web UI for reading and searching.

## Purpose

The product is **a reader**. Its value over `tail -f` is:

1. **Readability** — JSON/logfmt blobs render as structured, columnar rows
   rather than walls of text.
2. **Multi-source** — several processes' logs interleaved in one view, with
   each source visually distinguishable.
3. **Search** — free text and attribute filters over everything ingested, not
   just what's in terminal scrollback.

Persistence exists to serve search and to survive restarts. It is not the
headline feature.

## Glossary

- **Record** — one ingested log line after parsing. A JSON object. Its root is
  the parsed object if the line was JSON or logfmt, or the output of a
  source's custom regex, otherwise `{"message": "<raw line>"}`. Tags are
  merged onto the root.
- **Raw line** — the original bytes of a line as read from disk, preserved on
  the record for display and fallback search.
- **Source** — one watched file or glob, declared in config. Identified by its
  `source_id`. The unit the UI's source selector toggles.
- **Tag** — an open key/value pair attached to a record, used for filtering
  and grouping. Three origins:
  - **Watcher-assigned** — set automatically when a watcher starts: `file`,
    `source_id`.
  - **User-defined** — declared in config against a source, e.g.
    `service=api`, `env=local`.
  - **Parser-extracted** — pulled from the parsed line and promoted, e.g.
    `level`.
- **Well-known tag** — a tag the UI treats specially: `file`, `source_id`,
  `service`, `level`. Others are generic.
- **Parse ladder** — the ordered attempts the parser makes per line: source's
  custom regex (if declared) → JSON → logfmt → raw. First match wins.
- **Offset record** — the `(inode, size, offset)` triple persisted per source,
  used to resume reading after a restart and to detect rotation/truncation.
- **Prune** — deleting records older than the retention cutoff. Scheduled, not
  user-initiated in v1.

Vocabulary to avoid: "log entry" and "event" (use **record**); "stream" (use
**source**); "field" as a synonym for tag — a *field* is any key on the record
root, a *tag* is specifically a filterable key/value.

## Shape

```text
files on disk --> [Watcher] --> [Parser] --> [Store] <--> [Query API] <--> [Web UI]
                                    |                                         ^
                                    +-------- live tail (WS) -----------------+
```

The parser fans out: records go to WebSocket clients immediately and onto a
batched write queue separately. Live tail never waits on disk I/O.

## v1 scope

**In:** config-declared sources (path/glob, tags, optional regex); watcher with
offset resume and rotation/truncation detection; parse ladder; SQLite with
FTS5; scheduled prune; web UI with live tail, columns, per-source color, JSON
expand-on-click, text + attribute filter bar.

**Out:** multi-line/stack-trace assembly, pause/scrollback, volume histogram,
stdin/socket ingest, TUI, aggregations, alerting, Docker.

## Constraints

- Single binary via `bun build --compile`. Expect ~60–100MB; the Bun runtime
  is embedded. Accepted.
- Watcher cap of 25 files, configurable.
- Retention 24h, configurable.
- Local single-user tool. No auth, no multi-host. Nothing may hardcode a
  user-specific path, so the door to sharing stays open.

## Known gaps

- **Multi-line records** are out of v1, which means a 30-line stack trace
  becomes 30 rows — precisely when readability matters most. `message` must
  tolerate newlines from day one so this can be added without a schema change.
- **Custom regex parsing** is per-source and unvalidated in v1. A bad pattern
  degrades to raw rather than failing loudly.
