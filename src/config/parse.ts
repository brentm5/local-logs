import { SERVER_DEFAULTS, type Config, type ServerConfig, type SourceConfig } from "./types";

const TOP_LEVEL_KEYS = new Set(["server", "source"]);
const SERVER_KEYS = new Set(["port", "retention_hours", "max_files"]);
const SOURCE_KEYS = new Set(["path", "tags", "pattern"]);

function assertNoUnknownKeys(obj: Record<string, unknown>, allowed: Set<string>, context: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`local-logs.toml: unknown key "${key}" in ${context}`);
    }
  }
}

function parseServer(raw: unknown): ServerConfig {
  if (raw === undefined) {
    return { ...SERVER_DEFAULTS };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("local-logs.toml: [server] must be a table");
  }
  const obj = raw as Record<string, unknown>;
  assertNoUnknownKeys(obj, SERVER_KEYS, "[server]");

  for (const key of ["port", "retention_hours", "max_files"] as const) {
    if (obj[key] !== undefined && (typeof obj[key] !== "number" || (obj[key] as number) <= 0)) {
      throw new Error(`local-logs.toml: [server].${key} must be a positive number`);
    }
  }

  return {
    port: typeof obj.port === "number" ? obj.port : SERVER_DEFAULTS.port,
    retention_hours:
      typeof obj.retention_hours === "number" ? obj.retention_hours : SERVER_DEFAULTS.retention_hours,
    max_files: typeof obj.max_files === "number" ? obj.max_files : SERVER_DEFAULTS.max_files,
  };
}

function parseSource(raw: unknown, index: number): SourceConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`local-logs.toml: [[source]] entry ${index} must be a table`);
  }
  const obj = raw as Record<string, unknown>;
  assertNoUnknownKeys(obj, SOURCE_KEYS, `[[source]] entry ${index}`);

  if (typeof obj.path !== "string" || obj.path.length === 0) {
    throw new Error(`local-logs.toml: [[source]] entry ${index} is missing required key "path"`);
  }

  const tags =
    obj.tags === undefined ? {} : (obj.tags as Record<string, string>);
  if (typeof tags !== "object" || tags === null || Array.isArray(tags)) {
    throw new Error(`local-logs.toml: [[source]] entry ${index} has an invalid "tags" table`);
  }

  const pattern = obj.pattern === undefined ? undefined : String(obj.pattern);

  return { path: obj.path, tags, pattern };
}

export function parseConfig(raw: string): Config {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(raw);
  } catch (err) {
    throw new Error(`local-logs.toml: failed to parse: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("local-logs.toml: root must be a table");
  }
  const obj = parsed as Record<string, unknown>;
  assertNoUnknownKeys(obj, TOP_LEVEL_KEYS, "config root");

  const server = parseServer(obj.server);

  const rawSources = obj.source === undefined ? [] : obj.source;
  if (!Array.isArray(rawSources)) {
    throw new Error("local-logs.toml: [[source]] must be an array of tables");
  }
  const sources = rawSources.map((s, i) => parseSource(s, i));

  return { server, sources };
}
