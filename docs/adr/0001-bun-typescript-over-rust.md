# ADR-0001: Bun + TypeScript over Rust

Date: 2026-09-18
Status: Accepted

## Context

The README deferred the stack choice between Rust and Bun + TypeScript,
noting it was entangled with the datastore choice. Both can produce a single
binary; both have viable file-watching and embedded-storage stories.

The deciding factor turned out to be scope rather than runtime
characteristics. Grilling the use cases established that the product is
primarily a *reader* — structured rendering, multi-source display, search UI.
The web UI is not a side dish; it is most of the work.

## Decision

Bun + TypeScript. The UI is bundled by Bun and embedded into the compiled
binary via `bun build --compile`.

## Consequences

**Gained:**
- One language and toolchain across server and UI, where the UI is the bulk of
  the work.
- `bun:sqlite` is built in — native SQLite with no compiled dependency and no
  per-platform native module to ship.
- Faster iteration on the half of the product that matters most.

**Paid:**
- The binary is ~60–100MB because the Bun runtime is embedded, versus a
  plausible ~5–10MB for Rust. Explicitly accepted.
- Higher idle memory footprint for an always-running background process.
- Per-line parsing throughput is lower than Rust's. Mitigated by batching, and
  at the target volumes the parser is not expected to be the bottleneck — but
  it is the most likely component to become one.

## Alternatives rejected

**Rust.** Genuinely leaner binary and lower footprint, with mature crates
(`notify`, `rusqlite`, `tantivy`). Rejected because it splits the toolchain
precisely where the work is concentrated. Worth revisiting only if binary size
or ingest throughput becomes a real, measured problem.
