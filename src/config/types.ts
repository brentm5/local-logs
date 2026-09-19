import { z } from "zod";

export const SERVER_DEFAULTS = {
  port: 4000,
  retention_hours: 24,
  max_files: 25,
} as const;

const positiveNumber = (field: string) =>
  z.number().positive({ error: `local-logs.toml: [server].${field} must be a positive number` });

export const serverSchema = z
  .object({
    port: positiveNumber("port").default(SERVER_DEFAULTS.port),
    retention_hours: positiveNumber("retention_hours").default(SERVER_DEFAULTS.retention_hours),
    max_files: positiveNumber("max_files").default(SERVER_DEFAULTS.max_files),
  })
  .strict();

export const sourceSchema = z
  .object({
    path: z
      .string({ error: "local-logs.toml: source is missing required key \"path\"" })
      .min(1, { error: "local-logs.toml: source is missing required key \"path\"" }),
    tags: z.record(z.string(), z.string()).default({}),
    pattern: z.string().optional(),
  })
  .strict();

export const configSchema = z
  .object({
    server: serverSchema.default(SERVER_DEFAULTS),
    source: z.array(sourceSchema).default([]),
  })
  .strict();

export type ServerConfig = z.infer<typeof serverSchema>;
export type SourceConfig = z.infer<typeof sourceSchema>;

export interface Config {
  server: ServerConfig;
  sources: SourceConfig[];
}

export interface ResolvedSource extends SourceConfig {
  files: string[];
}

export interface LoadedConfig extends Config {
  resolvedSources: ResolvedSource[];
}
