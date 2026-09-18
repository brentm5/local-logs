import { isAbsolute, join } from "node:path";
import { parseConfig } from "./parse";
import type { LoadedConfig, ResolvedSource } from "./types";

export interface LoadConfigOptions {
  cwd: string;
  configPath?: string;
}

async function resolveSourceFiles(pathOrGlob: string, cwd: string): Promise<string[]> {
  const glob = new Bun.Glob(pathOrGlob);
  const matches: string[] = [];
  for await (const match of glob.scan({ cwd, absolute: false })) {
    matches.push(join(cwd, match));
  }
  if (matches.length > 0) {
    return matches.sort();
  }

  // Not a glob pattern (or matched nothing): treat as a literal path if it exists.
  const literal = isAbsolute(pathOrGlob) ? pathOrGlob : join(cwd, pathOrGlob);
  if (await Bun.file(literal).exists()) {
    return [literal];
  }
  return [];
}

export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const { cwd } = options;
  const configPath = options.configPath
    ? isAbsolute(options.configPath)
      ? options.configPath
      : join(cwd, options.configPath)
    : join(cwd, "local-logs.toml");

  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  let raw: string;
  try {
    raw = await file.text();
  } catch (err) {
    throw new Error(`Failed to read config file ${configPath}: ${(err as Error).message}`);
  }

  const config = parseConfig(raw);

  const resolvedSources: ResolvedSource[] = [];
  for (const source of config.sources) {
    const files = await resolveSourceFiles(source.path, cwd);
    resolvedSources.push({ ...source, files });
  }

  const totalFiles = resolvedSources.reduce((sum, s) => sum + s.files.length, 0);
  if (totalFiles > config.server.max_files) {
    throw new Error(
      `Resolved ${totalFiles} source files, which exceeds max_files (${config.server.max_files})`,
    );
  }

  return { ...config, resolvedSources };
}
