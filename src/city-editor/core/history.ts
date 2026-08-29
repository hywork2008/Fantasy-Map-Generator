import { clone } from "./mesh";
import type { CityDocument } from "./types";

export class DocumentHistory {
  private past: CityDocument[] = [];
  private future: CityDocument[] = [];

  constructor(initial: CityDocument) {
    this.past = [clone(initial)];
  }

  commit(document: CityDocument): CityDocument {
    this.past.push(clone(document));
    this.future = [];
    return document;
  }

  reset(document: CityDocument): void {
    this.past = [clone(document)];
    this.future = [];
  }

  undo(_current: CityDocument): CityDocument | null {
    if (this.past.length < 2) return null;
    const removed = this.past.pop();
    if (removed) this.future.push(clone(removed));
    return clone(this.past[this.past.length - 1]);
  }

  redo(_current: CityDocument): CityDocument | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(clone(next));
    return clone(next);
  }

  get canUndo(): boolean {
    return this.past.length > 1;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
