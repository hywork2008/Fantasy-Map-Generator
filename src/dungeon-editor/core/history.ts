import type { DungeonDocument } from "./types";

/** Bounded immutable snapshots: these small documents don't need mesh deltas. */
export class DungeonHistory {
  private snapshots: Array<{ document: DungeonDocument; label: string }>;
  private cursor = 0;
  constructor(document: DungeonDocument) {
    this.snapshots = [{ document, label: "初期生成" }];
  }
  get document(): DungeonDocument {
    return this.snapshots[this.cursor].document;
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.snapshots.length - 1;
  }
  get label(): string {
    return this.snapshots[this.cursor].label;
  }
  commit(document: DungeonDocument, label: string): void {
    this.snapshots.splice(this.cursor + 1);
    this.snapshots.push({ document, label });
    if (this.snapshots.length > 50) this.snapshots.shift();
    this.cursor = this.snapshots.length - 1;
  }
  undo(): DungeonDocument {
    if (this.canUndo) this.cursor--;
    return this.document;
  }
  redo(): DungeonDocument {
    if (this.canRedo) this.cursor++;
    return this.document;
  }
}
