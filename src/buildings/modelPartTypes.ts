import type { CityStructureMeshes } from "../city3d/three/structureMeshes";
import type { Author } from "./authors";

export interface ModelPartDefinition {
  id: string;
  role: string;
  quality: "low" | "medium" | "high" | "ultra" | "default";
  author: Author;
  basedOn?: readonly string[];
}

export interface ModelPartFactory extends ModelPartDefinition {
  /** Return an assembly-origin group; fitted position and scale belong to its children. */
  create(): CityStructureMeshes;
}

/** JSON-safe source ledger; counts describe the unmerged part, not the CE draw batch. */
export interface ModelPart extends ModelPartDefinition {
  meshes: number;
  triangles: number;
}

export interface ModelPartRange {
  partId: string;
  /** Vertex interval in the non-indexed CE assembly, suitable for face picking. */
  start: number;
  count: number;
}
