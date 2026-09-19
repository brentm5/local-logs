/**
 * Buffers appended bytes per source and splits them into complete lines,
 * holding back a trailing partial line (no `\n` yet) until more data
 * arrives, per issue #4: "do not emit a half line."
 *
 * One instance covers all watched files; state is keyed by source_id so
 * resetting one file (rotation/truncation) never disturbs another's
 * buffered partial line.
 */
export class LineBuffer {
  private readonly pending = new Map<string, string>();

  /**
   * Appends `chunk` for `sourceId` and returns any newly complete lines
   * (newline-terminated, with the newline stripped). Any remainder after
   * the last `\n` is buffered for the next call.
   */
  append(sourceId: string, chunk: string): string[] {
    const combined = (this.pending.get(sourceId) ?? "") + chunk;
    const lines = combined.split("\n");
    // The last element is either "" (chunk ended exactly on a newline) or a
    // partial line yet to be terminated. Either way it's not a complete
    // line, so it's held back rather than emitted.
    const remainder = lines.pop() ?? "";
    this.pending.set(sourceId, remainder);
    return lines;
  }

  /** Discards any buffered partial line for `sourceId`, e.g. on rotation/truncation. */
  reset(sourceId: string): void {
    this.pending.delete(sourceId);
  }
}
