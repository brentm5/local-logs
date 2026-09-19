/**
 * Derives a stable `source_id` for one resolved file. Identity is
 * `<index of the [[source]] block in config>:<absolute file path>`.
 *
 * Stable across restarts (deterministic from config alone, no DB round-trip
 * or randomness), which is required for offset resume: `offsets.source_id`
 * is the primary key ADR-0003's inode/size/offset lookup keys off, so a
 * source_id that changed between runs would make every file look
 * "never seen" and defeat resume.
 *
 * The index prefix (rather than the bare path) only matters if two
 * `[[source]]` blocks ever resolve to the same literal path; harmless
 * otherwise.
 */
export function deriveSourceId(sourceIndex: number, absoluteFilePath: string): string {
  return `${sourceIndex}:${absoluteFilePath}`;
}
