/**
 * Bidirectional undo/redo stack for discrete state snapshots.
 * cursor is 1-indexed: current entry is history[cursor - 1].
 * cursor === 0 means the stack is empty.
 */
export class UndoStack<T> {
  private readonly history: T[] = [];
  private cursor = 0;

  constructor(readonly maxSize = 200) {}

  push(state: T): void {
    this.history.splice(this.cursor); // discard any redo future
    this.history.push(state);
    if (this.history.length > this.maxSize) {
      this.history.shift(); // evict oldest; cursor stays (net: +1 -1 = 0 shift)
    } else {
      this.cursor++;
    }
  }

  undo(): T | undefined {
    if (!this.canUndo) return undefined;
    this.cursor--;
    return this.history[this.cursor - 1];
  }

  redo(): T | undefined {
    if (!this.canRedo) return undefined;
    this.cursor++;
    return this.history[this.cursor - 1];
  }

  reset(): void {
    this.history.length = 0;
    this.cursor = 0;
  }

  get canUndo(): boolean {
    return this.cursor > 1;
  }

  get canRedo(): boolean {
    return this.cursor < this.history.length;
  }

  get current(): T | undefined {
    return this.history[this.cursor - 1];
  }
}
