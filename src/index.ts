import { CliExit, parseArgs } from "./cli";
import { loadConfig } from "./config/load";

async function main() {
  const { configPath } = parseArgs(Bun.argv.slice(2));
  const config = await loadConfig({ cwd: process.cwd(), configPath });

  console.log(`server: port=${config.server.port} retention_hours=${config.server.retention_hours} max_files=${config.server.max_files}`);
  console.log(`sources (${config.resolvedSources.length}):`);
  for (const source of config.resolvedSources) {
    const tags = Object.entries(source.tags)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    console.log(`  ${source.path}${tags ? ` [${tags}]` : ""}`);
    for (const file of source.files) {
      console.log(`    ${file}`);
    }
  }
}

main().catch((err) => {
  if (err instanceof CliExit) {
    return;
  }
  console.error(`local-logs: ${(err as Error).message}`);
  process.exit(1);
});
