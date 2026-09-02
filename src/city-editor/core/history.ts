import { clone } from "./mesh";
import type { CityDocument } from "./types";

export interface HistoryEntry {
  /** Human-readable name of the edit that produced this state. */
  label: string;
  /** Wall-clock time the state was recorded, for the History panel. */
  time: number;
}

/**
 * A linear snapshot timeline. `cursor` points at the state currently shown;
 * everything after it is redoable. `commit` past the cursor drops the
 * redo tail, matching a classic undo stack, while `jumpTo` lets the History
 * panel move to any recorded state without walking one step at a time.
 */
export class DocumentHistory {
  private timeline: CityDocument[];
  private entryList: HistoryEntry[];
  private cursor: number;

  constructor(initial: CityDocument, label = "Initial state") {
    this.timeline = [clone(initial)];
    this.entryList = [{ label, time: Date.now() }];
    this.cursor = 0;
  }

  commit(document: CityDocument, label = "Edit"): CityDocument {
    this.timeline.length = this.cursor + 1;
    this.entryList.length = this.cursor + 1;
    this.timeline.push(clone(document));
    this.entryList.push({ label, time: Date.now() });
    this.cursor = this.timeline.length - 1;
    return document;
  }

  /**
   * Replace the current entry in place instead of pushing a new one. A brush or
   * drag that mutates the document many times per gesture calls `commit` once
   * and then `amendTop` for each further step, so the whole stroke collapses to
   * a single undo entry while the live document never drifts from the timeline.
   */
  amendTop(document: CityDocument, label?: string): CityDocument {
    this.timeline[this.cursor] = clone(document);
    if (label !== undefined) this.entryList[this.cursor] = { ...this.entryList[this.cursor], label };
    return document;
  }

  reset(document: CityDocument, label = "Initial state"): void {
    this.timeline = [clone(document)];
    this.entryList = [{ label, time: Date.now() }];
    this.cursor = 0;
  }

  undo(_current: CityDocument): CityDocument | null {
    return this.jumpTo(this.cursor - 1);
  }

  redo(_current: CityDocument): CityDocument | null {
    return this.jumpTo(this.cursor + 1);
  }

  /** Move to any recorded state. Returns null when the index is out of range
   * or already current, so callers can skip a needless redraw. */
  jumpTo(index: number): CityDocument | null {
    if (index < 0 || index >= this.timeline.length || index === this.cursor) return null;
    this.cursor = index;
    return clone(this.timeline[index]);
  }

  /** Oldest state first; the entry at `index` is the one currently shown. */
  get entries(): HistoryEntry[] {
    return this.entryList.map(entry => ({ ...entry }));
  }

  get index(): number {
    return this.cursor;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.timeline.length - 1;
  }
}
