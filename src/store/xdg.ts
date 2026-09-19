import { join } from "node:path";

export interface XdgEnv {
  XDG_DATA_HOME?: string;
  HOME?: string;
}

export function defaultDbPath(env: XdgEnv): string {
  if (env.XDG_DATA_HOME) {
    return join(env.XDG_DATA_HOME, "local-logs", "local-logs.db");
  }
  if (!env.HOME) {
    throw new Error(
      "Could not determine data directory: neither XDG_DATA_HOME nor HOME is set",
    );
  }
  return join(env.HOME, ".local", "share", "local-logs", "local-logs.db");
}
