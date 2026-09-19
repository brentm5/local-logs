import { join } from "node:path";

export interface XdgEnv {
  XDG_CONFIG_HOME?: string;
  HOME?: string;
}

export function defaultConfigPath(env: XdgEnv): string {
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, "local-logs", "config.toml");
  }
  if (!env.HOME) {
    throw new Error(
      "Could not determine config directory: neither XDG_CONFIG_HOME nor HOME is set",
    );
  }
  return join(env.HOME, ".config", "local-logs", "config.toml");
}
