import { Command, CommanderError } from "commander";

export interface CliArgs {
  configPath: string | undefined;
  replay: boolean;
}

/** Thrown when Commander has already printed help/version and the process should exit 0. */
export class CliExit extends Error {
  constructor() {
    super("local-logs: exit requested");
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const program = new Command()
    .name("local-logs")
    .description("Local log viewer for development workflows")
    .option("--config <path>", "path to config.toml (defaults to $XDG_CONFIG_HOME/local-logs/config.toml)")
    .option("--replay", "start first-seen files at 0 instead of at end (tail semantics)", false)
    .exitOverride()
    .configureOutput({ writeErr: () => {} });

  try {
    program.parse(argv, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError && err.exitCode === 0) {
      throw new CliExit();
    }
    throw err;
  }

  const { config, replay } = program.opts<{ config?: string; replay: boolean }>();
  return { configPath: config, replay };
}
