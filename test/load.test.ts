import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/load";

describe("loadConfig", () => {
  let dir: string;
  let xdgConfigHome: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "local-logs-test-"));
    xdgConfigHome = await mkdtemp(join(tmpdir(), "local-logs-xdg-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(xdgConfigHome, { recursive: true, force: true });
  });

  test("loads config.toml from $XDG_CONFIG_HOME/local-logs by default", async () => {
    await mkdir(join(xdgConfigHome, "local-logs"));
    await writeFile(join(xdgConfigHome, "local-logs", "config.toml"), `[server]\nport = 4001\n`);

    const config = await loadConfig({ cwd: dir, env: { XDG_CONFIG_HOME: xdgConfigHome } });

    expect(config.server.port).toBe(4001);
  });

  test("--config path overrides the XDG default", async () => {
    const customPath = join(dir, "custom.toml");
    await writeFile(customPath, `[server]\nport = 4002\n`);

    const config = await loadConfig({ cwd: dir, configPath: customPath });

    expect(config.server.port).toBe(4002);
  });

  test("relative --config path resolves against cwd, not process.cwd()", async () => {
    await writeFile(join(dir, "custom.toml"), `[server]\nport = 4003\n`);

    const config = await loadConfig({ cwd: dir, configPath: "custom.toml" });

    expect(config.server.port).toBe(4003);
  });

  test("fails loudly when the default config file is unreadable", async () => {
    await expect(
      loadConfig({ cwd: dir, env: { XDG_CONFIG_HOME: xdgConfigHome } }),
    ).rejects.toThrow(/config\.toml/);
  });

  test("fails loudly when --config path doesn't exist", async () => {
    await expect(
      loadConfig({ cwd: dir, configPath: join(dir, "missing.toml") }),
    ).rejects.toThrow(/missing\.toml/);
  });

  test("expands glob sources relative to cwd", async () => {
    await mkdir(join(dir, "logs"));
    await writeFile(join(dir, "logs", "a.log"), "");
    await writeFile(join(dir, "logs", "b.log"), "");
    await writeFile(
      join(dir, "local-logs.toml"),
      `[[source]]\npath = "logs/*.log"\n`,
    );

    const config = await loadConfig({ cwd: dir, configPath: join(dir, "local-logs.toml") });

    expect(config.resolvedSources).toHaveLength(1);
    expect(config.resolvedSources[0]!.files.sort()).toEqual(
      [join(dir, "logs", "a.log"), join(dir, "logs", "b.log")].sort(),
    );
  });

  test("throws when resolved files exceed max_files", async () => {
    await mkdir(join(dir, "logs"));
    await writeFile(join(dir, "logs", "a.log"), "");
    await writeFile(join(dir, "logs", "b.log"), "");
    await writeFile(join(dir, "logs", "c.log"), "");
    await writeFile(
      join(dir, "local-logs.toml"),
      `[server]\nmax_files = 2\n\n[[source]]\npath = "logs/*.log"\n`,
    );

    await expect(
      loadConfig({ cwd: dir, configPath: join(dir, "local-logs.toml") }),
    ).rejects.toThrow(/max_files/i);
  });
});
