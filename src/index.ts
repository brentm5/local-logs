import { CliExit, parseArgs } from "./cli";
import { loadConfig } from "./config/load";
import { Store } from "./store/store";
import { startWatcher } from "./watcher/pipeline";
import { defaultDbPath, type XdgEnv } from "./xdg";

async function main() {
  const { configPath, replay } = parseArgs(Bun.argv.slice(2));
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

  const dbPath = defaultDbPath(process.env as XdgEnv);
  const store = new Store(dbPath);
  const watcher = await startWatcher(config, store, replay);
  console.log(`watching ${config.resolvedSources.reduce((n, s) => n + s.files.length, 0)} file(s), db=${dbPath}${replay ? " (--replay)" : ""}`);

  const shutdown = () => {
    watcher.stop();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  if (err instanceof CliExit) {
    return;
  }
  console.error(`local-logs: ${(err as Error).message}`);
  process.exit(1);
});
