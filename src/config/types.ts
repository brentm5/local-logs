export interface ServerConfig {
  port: number;
  retention_hours: number;
  max_files: number;
}

export interface SourceConfig {
  path: string;
  tags: Record<string, string>;
  pattern: string | undefined;
}

export interface Config {
  server: ServerConfig;
  sources: SourceConfig[];
}

export interface ResolvedSource {
  path: string;
  tags: Record<string, string>;
  pattern: string | undefined;
  files: string[];
}

export interface LoadedConfig extends Config {
  resolvedSources: ResolvedSource[];
}

export const SERVER_DEFAULTS: ServerConfig = {
  port: 4000,
  retention_hours: 24,
  max_files: 25,
};
