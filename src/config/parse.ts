import { z } from "zod";
import { configSchema, type Config } from "./types";

function formatIssue(issue: z.core.$ZodIssue, context: string): string {
  if (issue.code === "unrecognized_keys") {
    return `local-logs.toml: unknown key "${issue.keys[0]}" in ${context}`;
  }
  return issue.message;
}

export function parseConfig(raw: string): Config {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(raw);
  } catch (err) {
    throw new Error(`local-logs.toml: failed to parse: ${(err as Error).message}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const context = issue.path.length === 0 ? "config root" : issue.path.join(".");
    throw new Error(formatIssue(issue, context));
  }

  return { server: result.data.server, sources: result.data.source };
}
