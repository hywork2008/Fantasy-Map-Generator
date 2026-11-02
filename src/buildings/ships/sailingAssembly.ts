import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import { ModelKit, type Position } from "../medieval/modelKit";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";

export interface ShipHullFrame {
  minX: number;
  maxX: number;
  beam: number;
  waterline: number;
  draft: number;
}

export interface SailingShipState {
  sails?: "set" | "furled";
}

/** Lines remain owned by their construction part, including after mesh compaction. */
export class SailingKit extends ModelKit {
  private readonly lineResources: { geometry: THREE.BufferGeometry; material: THREE.LineBasicMaterial }[] = [];

  lines(name: string, segments: readonly (readonly [Position, Position])[], color = 0x655442) {
    if (!segments.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        segments.flatMap(pair => pair.flat()),
        3
      )
    );
    const material = new THREE.LineBasicMaterial({ color });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = name;
    this.group.add(lines);
    this.lineResources.push({ geometry, material });
  }

  override finish(): CityStructureMeshes {
    const source = super.finish();
    return {
      ...source,
      dispose: () => {
        source.dispose();
        for (const { geometry, material } of this.lineResources) {
          geometry.dispose();
          material.dispose();
        }
      }
    };
  }
}

/** Shared folded canvas with a closed, creased cross section and physical gaskets. */
export function addSailBundle(kit: ModelKit, name: string, a: Position, b: Position, radius: number, high = true) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const axis = end.clone().sub(start).normalize();
  const across = new THREE.Vector3(0, 0, 1).cross(axis).normalize();
  const normal = axis.clone().cross(across).normalize();
  const rows = high ? Math.max(8, Math.min(24, Math.ceil(start.distanceTo(end) / 0.3))) : 12,
    sides = high ? 12 : 8;
  const points: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const taper = 0.4 + 0.6 * Math.sin(Math.PI * t) ** 0.3;
    for (let j = 0; j < sides; j++) {
      const angle = (j * Math.PI * 2) / sides;
      const r = radius * taper * (1 + 0.12 * Math.cos(angle * 5 + t * 5));
      points.push(
        ...start
          .clone()
          .lerp(end, t)
          .addScaledVector(across, Math.cos(angle) * r)
          .addScaledVector(normal, Math.sin(angle) * r)
          .toArray()
      );
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j,
        b = i * sides + ((j + 1) % sides);
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  points.push(...start.toArray(), ...end.toArray());
  for (let j = 0; j < sides; j++) {
    indices.push((rows + 1) * sides, (j + 1) % sides, j);
    indices.push((rows + 1) * sides + 1, rows * sides + j, rows * sides + ((j + 1) % sides));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  kit.add(name, geometry, "white");
  for (let t = 0.12; t < 0.95; t += 0.18) {
    const centre = start.clone().lerp(end, t);
    const r = radius * (0.4 + 0.6 * Math.sin(Math.PI * t) ** 0.3) * 1.13;
    const tie = kit.add(
      `${name}-gasket`,
      new THREE.TorusGeometry(r, high ? 0.012 : 0.018, 4, high ? 12 : 8),
      "leather"
    );
    tie.position.copy(centre);
    tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  }
}

/** Material batching preserves semantic mesh ranges and independently owned line parts. */
export function assembleSailingParts(name: string, parts: readonly ModelPartFactory[]): CityStructureMeshes {
  const source = createModelAssembly(
    name,
    parts.map(part => ({
      ...part,
      create() {
        const model = part.create();
        model.group.userData.modelPartId = part.id;
        return model;
      }
    }))
  );
  const lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  source.group.updateMatrixWorld(true);
  source.group.traverse(object => {
    if (!(object as THREE.LineSegments).isLineSegments) return;
    const original = object as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    const copy = new THREE.LineSegments(
      original.geometry.clone().applyMatrix4(original.matrixWorld),
      original.material.clone()
    );
    copy.name = original.name;
    let owner: THREE.Object3D | null = original;
    while (owner && !owner.userData.modelPartId) owner = owner.parent;
    copy.userData.modelPartId = owner?.userData.modelPartId;
    lines.push(copy);
  });
  let compact: CityStructureMeshes;
  try {
    compact = compactModel(source, { mergeEquivalentMaterials: true });
  } catch (error) {
    for (const line of lines) {
      line.geometry.dispose();
      line.material.dispose();
    }
    throw error;
  }
  if (lines.length) compact.group.add(...lines);
  return {
    ...compact,
    dispose() {
      compact.dispose();
      for (const line of lines) {
        line.geometry.dispose();
        line.material.dispose();
      }
    }
  };
}
