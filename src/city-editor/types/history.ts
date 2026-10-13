import type { CityDocument } from "./document";
export interface HistoryEntry {
  label: string;
  time: number;
}
export interface DocumentHistoryState {
  commit(document: CityDocument, label?: string): CityDocument;
  amendTop(document: CityDocument, label?: string): CityDocument;
  reset(document: CityDocument, label?: string): void;
  undo(current: CityDocument): CityDocument | null;
  redo(current: CityDocument): CityDocument | null;
  jumpTo(index: number): CityDocument | null;
  readonly entries: HistoryEntry[];
  readonly currentEntryKey: object;
  readonly index: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
