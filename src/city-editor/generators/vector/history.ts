import type { DocumentHistoryState, HistoryEntry } from "../../types/history";
import type { VectorCityDocument } from "../../types/vector/document";
import { assertVectorDocument } from "./validation/document";

interface Snapshot {
  document: VectorCityDocument;
  entry: HistoryEntry;
  key: object;
}

/** Snapshot history for small authored vector ledgers; never invokes mesh clone/diff. */
export class VectorDocumentHistory implements DocumentHistoryState<VectorCityDocument> {
  private snapshots: Snapshot[] = [];
  private cursor = 0;

  constructor(initial: VectorCityDocument, label = "Initial state") {
    this.reset(initial, label);
  }
  private snapshot(document: VectorCityDocument, label: string): Snapshot {
    assertVectorDocument(document);
    return { document: structuredClone(document), entry: { label, time: Date.now() }, key: {} };
  }
  get document(): VectorCityDocument {
    return structuredClone(this.snapshots[this.cursor].document);
  }
  get entries(): HistoryEntry[] {
    return this.snapshots.map(item => ({ ...item.entry }));
  }
  get index(): number {
    return this.cursor;
  }
  get currentEntryKey(): object {
    return this.snapshots[this.cursor].key;
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor + 1 < this.snapshots.length;
  }

  commit(document: VectorCityDocument, label = "Edit"): VectorCityDocument {
    const snapshot = this.snapshot(document, label);
    this.snapshots.splice(this.cursor + 1, this.snapshots.length, snapshot);
    this.cursor++;
    return this.document;
  }
  amendTop(document: VectorCityDocument, label = this.snapshots[this.cursor].entry.label): VectorCityDocument {
    const snapshot = this.snapshot(document, label);
    this.snapshots.splice(this.cursor, this.snapshots.length, snapshot);
    return this.document;
  }
  reset(document: VectorCityDocument, label = "Initial state"): void {
    const snapshot = this.snapshot(document, label);
    this.snapshots = [snapshot];
    this.cursor = 0;
  }
  undo(_current?: VectorCityDocument): VectorCityDocument | null {
    return this.canUndo ? this.jumpTo(this.cursor - 1) : null;
  }
  redo(_current?: VectorCityDocument): VectorCityDocument | null {
    return this.canRedo ? this.jumpTo(this.cursor + 1) : null;
  }
  jumpTo(index: number): VectorCityDocument | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshots.length || index === this.cursor) return null;
    this.cursor = index;
    return this.document;
  }
}
