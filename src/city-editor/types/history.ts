import type { CityDocument } from "./document";
export interface HistoryEntry {
  label: string;
  time: number;
}
export interface DocumentHistoryState<TDocument = CityDocument> {
  commit(document: TDocument, label?: string): TDocument;
  amendTop(document: TDocument, label?: string): TDocument;
  reset(document: TDocument, label?: string): void;
  undo(current: TDocument): TDocument | null;
  redo(current: TDocument): TDocument | null;
  jumpTo(index: number): TDocument | null;
  readonly entries: HistoryEntry[];
  readonly currentEntryKey: object;
  readonly index: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
