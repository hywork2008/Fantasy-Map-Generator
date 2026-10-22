import type { WorldDocument } from "../runtime/worldArchive";
export interface MasterReferenceRequest {
  document: WorldDocument;
  extensions: string[];
  settings: Record<string, string>;
  options: Record<string, unknown>;
  preferences: Record<string, unknown>;
}
export type MasterReferenceMessage =
  | { kind: "progress"; done: number; total: number; task: string }
  | { kind: "complete"; document: WorldDocument }
  | { kind: "error"; message: string };
