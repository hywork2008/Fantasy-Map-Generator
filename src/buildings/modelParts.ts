import type * as THREE from "three";
import type { CityStructureMeshes } from "../city3d/three/structureMeshes";
import type { Author } from "./authors";
import { ModelKit } from "./medieval/modelKit";

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

/** Build only the chosen components; the returned assembly owns their resources. */
export function createModelAssembly(name: string, factories: readonly ModelPartFactory[]): CityStructureMeshes {
  const kit = new ModelKit(name);
  const tracker = new ModelPartTracker(kit);
  try {
    for (const { create, ...definition } of factories) {
      tracker.begin(definition);
      kit.attach(create(), [0, 0, 0]);
    }
    tracker.finish();
    return kit.finish();
  } catch (error) {
    kit.finish().dispose();
    throw error;
  }
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

export function modelParts(root: THREE.Object3D): readonly ModelPart[] {
  return root.userData.modelParts ?? [];
}

/** Mark boundaries during construction; do not infer semantic roles from mesh names. */
export class ModelPartTracker {
  private current?: ModelPartDefinition;
  private start = 0;
  private readonly parts: ModelPart[] = [];

  constructor(private readonly model: Pick<CityStructureMeshes, "group" | "pickables">) {}

  begin(definition: ModelPartDefinition) {
    this.flush();
    this.current = definition;
  }

  finish() {
    this.flush();
    this.model.group.userData.modelParts = this.parts;
  }

  private flush() {
    const meshes = this.model.pickables.slice(this.start);
    this.start = this.model.pickables.length;
    if (!this.current || !meshes.length) return;
    let triangles = 0;
    for (const mesh of meshes) {
      mesh.userData.modelPartId = this.current.id;
      const geometry = mesh.geometry;
      const count = geometry.index?.count ?? geometry.getAttribute("position").count;
      triangles += Math.floor(Math.max(0, Math.min(count - geometry.drawRange.start, geometry.drawRange.count)) / 3);
    }
    this.parts.push({ ...this.current, meshes: meshes.length, triangles });
    this.current = undefined;
  }
}
