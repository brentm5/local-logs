export interface CliArgs {
  configPath: string | undefined;
}

export function parseArgs(argv: string[]): CliArgs {
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--config") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error("--config requires a path argument");
      }
      configPath = value;
      i++;
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
    }
  }

  return { configPath };
}
