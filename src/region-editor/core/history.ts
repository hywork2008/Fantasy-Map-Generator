import { cloneRegionDocument } from "./document";
import type { RegionDocument } from "./types";

export class RegionHistory {
  private past: RegionDocument[] = [];
  private present: RegionDocument;
  private future: RegionDocument[] = [];
  private readonly maxHistory: number;

  constructor(initial: RegionDocument, maxHistory = 40) {
    this.present = cloneRegionDocument(initial);
    this.maxHistory = maxHistory;
  }

  get current(): RegionDocument {
    return this.present;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  push(newDoc: RegionDocument): void {
    this.past.push(this.present);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.present = cloneRegionDocument(newDoc);
    this.future = [];
  }

  undo(): RegionDocument | null {
    if (!this.canUndo()) return null;
    const previous = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = previous;
    return this.present;
  }

  redo(): RegionDocument | null {
    if (!this.canRedo()) return null;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
    return this.present;
  }
}
