import { join, resolve } from "node:path";
import { defaultConfigPath, type XdgEnv } from "../xdg";
import { parseConfig } from "./parse";
import type { LoadedConfig, ResolvedSource } from "./types";

export interface LoadConfigOptions {
  cwd: string;
  configPath?: string;
  env?: XdgEnv;
}

const GLOB_METACHARACTERS = /[*?{}[\]]/;

export async function resolveSourceFiles(pathOrGlob: string, cwd: string): Promise<string[]> {
  if (GLOB_METACHARACTERS.test(pathOrGlob)) {
    const glob = new Bun.Glob(pathOrGlob);
    const matches: string[] = [];
    for await (const match of glob.scan({ cwd, absolute: false })) {
      matches.push(join(cwd, match));
    }
    if (matches.length > 0) {
      return matches.sort();
    }
  }

  // Not a glob pattern (or matched nothing): treat as a literal path if it exists.
  const literal = resolve(cwd, pathOrGlob);
  if (await Bun.file(literal).exists()) {
    return [literal];
  }
  return [];
}

export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const { cwd, env = process.env as XdgEnv } = options;
  const configPath = options.configPath
    ? resolve(cwd, options.configPath)
    : defaultConfigPath(env);

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

  const resolvedSources: ResolvedSource[] = await Promise.all(
    config.sources.map(async (source) => ({
      ...source,
      files: await resolveSourceFiles(source.path, cwd),
    })),
  );

  const totalFiles = resolvedSources.reduce((sum, s) => sum + s.files.length, 0);
  if (totalFiles > config.server.max_files) {
    throw new Error(
      `Resolved ${totalFiles} source files, which exceeds max_files (${config.server.max_files})`,
    );
  }

  return { ...config, resolvedSources };
}
