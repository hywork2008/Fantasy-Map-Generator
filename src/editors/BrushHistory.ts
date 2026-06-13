/** Simple undo-only history for brush editors (cultures, states).
 *  Stores SVG innerHTML snapshots taken before each brush stroke.
 *  No redo: once a snapshot is popped (undone) it is discarded.
 */
export class BrushHistoryClass {
  private readonly stack: string[] = [];

  constructor(private readonly maxSize = 100) {}

  push(innerHTML: string): void {
    this.stack.push(innerHTML);
    if (this.stack.length > this.maxSize) this.stack.shift();
  }

  pop(): string | undefined {
    return this.stack.pop();
  }

  reset(): void {
    this.stack.length = 0;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }
}
