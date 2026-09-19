# ADR-0003: Decoupled ingest path, offset tracking, and retention

Date: 2026-09-18
Status: Accepted

## Context

Three coupled runtime concerns: live tail must feel instant while SQLite writes
must be batched to survive bursts; the watcher must resume correctly after a
restart without dropping or duplicating lines; and a 24h retention window needs
a trigger and a way to reclaim disk space.

## Decision

### Ingest fan-out

The parser fans out per record:

1. **Immediately** to any WebSocket client whose active filters match.
2. **Separately** onto a write queue, flushed to SQLite every ~100ms or 500
   records, whichever comes first, as one WAL-mode transaction.

Live tail never blocks on disk I/O. Bursts cost one transaction rather than
thousands of individual inserts.

The tradeoff is a sub-second window where a record is on screen but not yet
queryable. Accepted as acceptable and effectively invisible.

### Offset tracking

Per source, persist `(inode, size, offset)`. On startup:

- inode matches and `size >= offset` → resume at `offset`
- inode changed → new file, start at `0`
- `size < offset` → truncated, start at `0`

Identity is the inode, never the path. Path-based identity breaks under
rotation: `app.log` after a rotate is a different file at the same path, and
resuming at a stale offset yields garbage. These three checks also deliver most
of the rotation and truncation handling the README wanted, as a side effect.

Default behavior on a first-seen file is to start at the end (`tail -f`
semantics). A `--replay` flag opts into reading an existing file from the
start.

### Retention

- `auto_vacuum = INCREMENTAL` at database creation (see ADR-0002).
- Prune on startup, then hourly, deleting records older than the `ts` cutoff.
- `PRAGMA incremental_vacuum` after each prune to return free pages.
- Default 24h, configurable via `retention_hours`.

Retention is scheduled and internal in v1. There is no user-facing
delete-before-time API; the README's "explicit deletion" idea is served by the
config knob instead.

## Consequences

- A crash between fan-out and flush loses at most ~100ms of records. Acceptable
  for a local dev tool.
- Offset state is persisted in the same SQLite file, so the DB is the single
  source of truth for watcher position.
- Single DB file (not per-day files) means retention is `DELETE` + incremental
  vacuum rather than `unlink()`. Chosen for simplicity; revisit if the
  retention window grows to weeks.
