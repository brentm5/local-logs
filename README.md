# local-logs

A local log viewer for development workflows. Point it at log files on
disk, watch them get ingested and parsed in the background, and browse
or search them from a web UI — like `tail -f` with structured search
bolted on, scoped to "what am I seeing while I develop/test locally."

Distributed as a single binary. A Docker image may be offered later as
an alternate packaging of the same binary, not a separate deployment
model.

## Problem

Local dev often means several processes logging at once (frontend,
backend, worker, etc.), each dumping unstructured or semi-structured
text to a file or terminal. Following what's happening across them —
especially filtering to just errors, or just one request — is clunky
with `tail`/`grep` alone. This tool exists to make that loop faster
without standing up a real log stack (ELK, Quickwit, etc.) for
something as small as "watch my test run."

Prior art / inspiration:
- [Quickwit](https://github.com/quickwit-oss/quickwit) — search engine
  architecture (inverted index + columnar storage) worth studying for
  ingestion/indexing design, even though it's built for much larger
  scale than this tool targets.
- [rootprint](https://github.com/rootprint/rootprint) — worth a look
  for UI/UX approach to local log viewing.

## Scope (v1)

- **Ingest:** tail multiple files/globs on disk. No stdin or socket
  ingest in v1 — keeping ingestion to "files on disk" only, to keep
  the watcher simple.
- **Parsing:** on-the-fly, best-effort. Every ingested line becomes a
  JSON object (the "record"):
  - If the raw line is valid JSON, the parsed object *is* the record
    root.
  - If the raw line matches logfmt, the extracted key/values become
    the record root (same treatment as JSON).
  - Otherwise, the raw line is unstructured: the record root is
    `{"message": "<raw line>"}`.

  After the root is established, tags/attributes (watcher-assigned,
  user-defined, parser-derived) are merged onto it. A recognized
  message-like key (`message`/`msg`) is normalized to `message` if
  present; best-effort timestamp detection applies to the
  unstructured case.
- **Tags:** every log line carries a set of open key/value tags used
  for filtering and distinguishing sources. Tags come from three
  places:
  - **Watcher-assigned** — automatic tags set once when a watcher
    starts tailing a file, e.g. `file` (path/filename) and `source_id`
    (a generated unique id for that watcher instance).
  - **User-defined** — custom tags attached at config time when
    declaring a watched file, e.g. `service=api`, `env=local`.
  - **Parser-extracted** — fields the Parser pulls from structured
    lines (e.g. `level` from JSON) are also promoted to tags.

  Tags are an open key/value system (any key is allowed), with a
  standard set of well-known keys (`file`, `source_id`, `service`,
  `status`/`level`) that the UI treats specially (e.g. default
  columns, source selector).
- **UI:** browser only for v1 (no TUI). Default view is a live tail —
  new lines stream in as they're written, like `tail -f` in the
  browser. Filter bar for narrowing by tag or free text; pause/
  scrollback for reading without losing your place.
- **Multi-source:** first-class from day one. Each watched file is a
  "source," identified by its watcher-assigned tags; the UI can show
  one, several, or all sources combined, distinguishing which line
  came from where via tags.
- **Query language:** simple filters only — free-text search, tag/field
  equality/comparison (e.g. `level=error`, `service=api`), and time
  range. No boolean-logic DSL or full query language in v1.
- **Retention:** no automatic eviction. Instead, a way to explicitly
  delete logs before a given point in time (manual or
  config/schedule-driven later). Keeps storage behavior predictable
  and user-controlled rather than silently dropping data.

Out of scope for v1: stdin/socket ingest, TUI, aggregations/analytics,
alerting, multi-machine/remote log shipping.

## Architecture

A single long-running background process (the "server") does three
jobs:

1. **Watch** — tail multiple files/globs on disk, handling rotation
   and truncation, emitting raw lines annotated with watcher-assigned
   and user-defined tags (e.g. `file`, `source_id`, `service`).
2. **Parse** — per line, attempt JSON then logfmt parsing; the parsed
   object (or `{"message": "<raw line>"}` if neither matches) becomes
   the record root, then tags are merged on top, promoting well-known
   fields (e.g. `level`) to tags.
3. **Store** — persist parsed records and their tags to an embedded
   datastore that supports filtering by tag/field/time range and
   deletion by time range.

A browser-based UI, served by the same binary, talks to the server
over HTTP (for queries) and WebSocket/SSE (for live tail streaming).

```text
files on disk --> [Watcher] --> [Parser] --> [Store] <--> [Query API] <--> [Web UI]
                                                 |
                                       (live tail pushes new
                                        matching rows over WS)
```

### Components

- **Watcher** — tails configured files/globs, detects rotation and
  truncation, emits `(tags, raw_line)` tuples for new appended data.
  Assigns automatic tags (`file`, `source_id`) per watched file, plus
  any user-defined tags from config (e.g. `service`, `env`).
- **Parser** — tries JSON, then logfmt, per line, using the parsed
  object as the record root (or `{"message": "<raw line>"}` if
  neither matches); extracts timestamp and other well-known fields,
  promoting them to tags.
- **Store** — embedded datastore holding parsed records and their
  tags; supports tag/field/time-range filtering and time-range
  deletion. Concrete choice is an open research question (see below).
- **Query API** — HTTP endpoints for filtered historical queries (by
  tag, free text, time range); WebSocket/SSE endpoint that streams new
  matching rows as they're ingested, for live tail.
- **Web UI** — live tail view by default, filter bar (free text + tag/
  field + time range), source selector (backed by tags) for toggling
  which watched files are shown, pause/scrollback.

### Data flow

1. A watched file gets new bytes appended.
2. Watcher reads the new lines, attaches watcher-assigned and
   user-defined tags (e.g. `file`, `source_id`, `service`).
3. Parser builds the record root — the parsed object if the line is
   JSON or logfmt, otherwise `{"message": "<raw line>"}` — then merges
   in tags, promoting well-known fields (e.g. `level`) as it goes.
4. Store persists the record along with its full tag set.
5. Any live-tail WebSocket clients whose active filters match the new
   record receive it immediately.
6. Historical/search queries go straight to the store via the Query
   API, independent of live tail.

## Open questions / research areas

These are intentionally undecided — the point of this README is to
start iterating, not lock in a design.

- **Tech stack:** Rust, or Bun + TypeScript compiled to a single
  binary. Decision deferred until after more research into datastore
  and packaging options — the two choices constrain each other (e.g.
  which embeddable datastores are realistically available from each
  runtime).
- **Datastore:** want to use something already built rather than
  hand-roll storage/indexing. Candidates to evaluate: SQLite, DuckDB,
  or something inspired by Quickwit's segment/index design. Priorities:
  easy to manage (ideally baked directly into the single binary), good
  enough full-text + structured filtering performance for local-dev
  volumes. A separate container-based store is acceptable if a given
  choice makes the binary story meaningfully better, but embedded is
  preferred.
- **Retention UX:** exact mechanism for "delete logs before a certain
  point" — manual command/API call vs. config-driven scheduled prune,
  or both.
- **File rotation/truncation handling:** how the watcher detects and
  recovers from log rotation (rename+recreate, copytruncate, etc.)
  without dropping or duplicating lines.
- **Source configuration:** how watched files/globs and their source
  labels are declared — config file, CLI flags, or both.
- **Packaging:** single binary is the primary target; whether a Docker
  image is offered as a secondary distribution of the same binary, and
  what that would add (e.g. easier deployment into an existing
  docker-compose dev stack).

## Non-goals

- Not a production/centralized log aggregation system (no multi-host
  shipping, no long-term archival, no alerting).
- Not trying to replace real observability stacks (Quickwit, ELK,
  Loki) for production use — this is a local-dev-scoped tool.
