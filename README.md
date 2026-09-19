# local-logs

A local log viewer for development workflows. Point it at log files on
disk, watch them get ingested and parsed in the background, and browse
or search them from a web UI — like `tail -f` with structured search
bolted on, scoped to "what am I seeing while I develop/test locally."
Ships as a single compiled binary.

See [`CONTEXT.md`](./CONTEXT.md) for the full product shape and v1
scope.

## Quickstart

Prerequisites: [`mise`](https://mise.jdx.dev/) manages the Bun
toolchain version (see `.mise.toml`).

```bash
mise trust          # trust this repo's .mise.toml
mise install        # installs the pinned Bun version
bun install
```

Run from source:

```bash
bun run dev -- --config path/to/config.toml
```

Or build the single binary:

```bash
bun run build
./local-logs --help
```

### CLI usage

`src/cli.ts` currently exposes one option:

```bash
local-logs --config <path>   # defaults to $XDG_CONFIG_HOME/local-logs/config.toml
```

See `src/config/` for the config schema (`[server]` block plus
`[[source]]` entries) and validation.

## Dev workflow

```bash
bun run typecheck   # tsc --noEmit
bun run test         # bun test
bun run build         # bun build --compile
```

CI (`.github/workflows/`) runs typecheck, test, build, and a smoke
check that the compiled binary starts, in that order — mirror that
sequence locally before pushing.

### Project layout

- `src/` — CLI, config loading/validation (`src/config/`), and server
  entry point. Watcher, parser, store, and query API land here as
  they're built.
- `ui/` — web UI (not yet implemented).
- `test/` — `bun test` suites, one file per `src/` module roughly.

## Where to look next

This README stays intentionally thin. For everything else:

- [`CONTEXT.md`](./CONTEXT.md) — domain glossary, product shape, v1
  scope, and constraints. Start here to understand what the tool is
  and isn't.
- [`docs/adr/`](./docs/adr/) — accepted decisions and their
  alternatives-considered (stack choice, storage engine, ingest
  pipeline/retention, parse ladder).
- [`AGENTS.md`](./AGENTS.md) — conventions for agents working in this
  repo (issue tracker, triage labels, domain doc layout).

Open design questions that aren't yet resolved by an ADR are tracked
as GitHub issues rather than left in this file — see the
[issue tracker](https://github.com/brentm5/local-logs/issues).
