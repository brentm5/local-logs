import { Command, CommanderError } from "commander";

export interface CliArgs {
  configPath: string | undefined;
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
    .option("--config <path>", "path to local-logs.toml (defaults to ./local-logs.toml)")
    .exitOverride()
    .configureOutput({ writeErr: () => {} });

  try {
    program.parse(argv, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError && (err.code === "commander.helpDisplayed" || err.code === "commander.version")) {
      throw new CliExit();
    }
    throw err;
  }

  const { config } = program.opts<{ config?: string }>();
  return { configPath: config };
}
