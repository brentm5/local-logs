import { join } from "node:path";

/** The XDG base directory variables this project resolves paths under. */
export enum XdgVar {
  ConfigHome = "XDG_CONFIG_HOME",
  DataHome = "XDG_DATA_HOME",
}

export interface XdgEnv {
  HOME?: string;
  [XdgVar.ConfigHome]?: string;
  [XdgVar.DataHome]?: string;
}

/**
 * Resolves a path under an XDG base directory: `$<xdgVar>` if set, else
 * `$HOME/<homeFallback>`, joined with `local-logs/<file>`. Throws if neither
 * the XDG variable nor `HOME` is set.
 */
function resolveXdgPath(env: XdgEnv, xdgVar: XdgVar, homeFallback: string, file: string): string {
  const xdgValue = env[xdgVar];
  if (xdgValue) {
    return join(xdgValue, "local-logs", file);
  }
  if (!env.HOME) {
    throw new Error(`Could not determine data directory: neither ${xdgVar} nor HOME is set`);
  }
  return join(env.HOME, homeFallback, "local-logs", file);
}

export function defaultConfigPath(env: XdgEnv): string {
  return resolveXdgPath(env, XdgVar.ConfigHome, ".config", "config.toml");
}

export function defaultDbPath(env: XdgEnv): string {
  return resolveXdgPath(env, XdgVar.DataHome, ".local/share", "local-logs.db");
}
