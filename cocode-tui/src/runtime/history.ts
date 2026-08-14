/**
 * Local composer history. Not the session log.
 */

export class InputHistory {
  private readonly entries: string[] = [];
  private cursor = -1;
  private draft = "";

  push(text: string): void {
    const trimmed = text.trim();
    if (trimmed === "") return;
    if (this.entries[this.entries.length - 1] === trimmed) {
      this.cursor = -1;
      this.draft = "";
      return;
    }
    this.entries.push(trimmed);
    this.cursor = -1;
    this.draft = "";
  }

  begin(current: string): void {
    if (this.cursor < 0) this.draft = current;
  }

  prev(current: string): string | undefined {
    if (this.entries.length === 0) return undefined;
    this.begin(current);
    const next = this.cursor < 0 ? this.entries.length - 1 : this.cursor - 1;
    if (next < 0) return this.entries[0];
    this.cursor = next;
    return this.entries[this.cursor];
  }

  next(current: string): string | undefined {
    if (this.cursor < 0) return undefined;
    this.begin(current);
    this.cursor += 1;
    if (this.cursor >= this.entries.length) {
      this.cursor = -1;
      return this.draft;
    }
    return this.entries[this.cursor];
  }
}
