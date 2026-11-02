import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SHIP_VARIANTS } from "../../buildings/ships/shipVariants";
import { SHIP_DIMENSIONS } from "../../city-editor/data/ships";
import { BRUSH_SHIP_STATE } from "../../city-editor/generators/shipDisplayState";
import type { ShipSite } from "../../city-editor/renderers/shipSites";
import type { Point } from "../../city-editor/types/primitives";
import { adopt, markVariant } from "../adoption";
import { planVertex } from "../core/planFrame";
import type { CityStructureMeshes } from "./structureMeshes";

const ship = (family: string) => adopt(SHIP_VARIANTS, family, "default");
const MODELS = {
  small: ship("ship.sloop"),
  medium: ship("ship.caravel"),
  large: ship("ship.galleon"),
  barge: ship("ship.barge")
} as const;

/** Share a BV prototype per ship type and display state, with material batches per prototype. */
export function createTownShips(
  sites: readonly ShipSite[],
  waterHeightAt: (point: Point) => number
): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "ce-ships";
  const pickables: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const models: CityStructureMeshes[] = [];
  const batchesByState = new Map<string, ShipSite[]>();
  for (const site of sites) {
    const state = site.type === "barge" ? BRUSH_SHIP_STATE : (site.state ?? BRUSH_SHIP_STATE);
    const key = `${site.type}:${state.sails}:${state.gunports}`;
    const batch = batchesByState.get(key) ?? [];
    batch.push(site);
    batchesByState.set(key, batch);
  }
  for (const ships of batchesByState.values()) {
    const type = ships[0].type,
      state = type === "barge" ? BRUSH_SHIP_STATE : (ships[0].state ?? BRUSH_SHIP_STATE);
    if (!ships.length) continue;
    const model = MODELS[type].create(state);
    markVariant(group, MODELS[type].id);
    models.push(model);
    model.group.updateMatrixWorld(true);
    // CE sizes describe the hull, excluding projecting spars, sails and the rudder.
    const hull = model.pickables.find(mesh => mesh.name === "hull-topsides" || mesh.name === "hull-sides")!;
    const bounds = new THREE.Box3().setFromObject(hull);
    const hullLength = bounds.max.x - bounds.min.x;
    const hullBeam = bounds.max.z - bounds.min.z;
    const center = (bounds.min.x + bounds.max.x) / 2;
    const transforms = ships.map(site => {
      const scale = site.length / hullLength;
      const beam = (SHIP_DIMENSIONS[type].baseBeamMeters * site.length) / SHIP_DIMENSIONS[type].baseLengthMeters;
      // BV bows face +X; CE bows face +Y at zero, with plan +Y mapped to three.js -Z.
      return new THREE.Matrix4()
        .compose(
          new THREE.Vector3(...planVertex(site.point, waterHeightAt(site.point))),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + site.rotation),
          new THREE.Vector3(scale, scale, beam / hullBeam)
        )
        .multiply(new THREE.Matrix4().makeTranslation(-center, 0, 0));
    });
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const mesh of model.pickables) {
      const material = mesh.material as THREE.Material;
      const parts = batches.get(material) ?? [];
      const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      transformed.deleteAttribute("uv");
      const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
      if (geometry !== transformed) transformed.dispose();
      parts.push(geometry);
      batches.set(material, parts);
    }
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
      geometries.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, material, ships.length);
      mesh.name = `ship-${type}`;
      mesh.userData.shipIds = ships.map(ship => ship.id);
      mesh.userData.shipState = { ...state };
      transforms.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      pickables.push(mesh);
    }
    model.group.traverse(object => {
      if (!(object as THREE.LineSegments).isLineSegments) return;
      const original = object as THREE.LineSegments;
      const parts = transforms.map(matrix =>
        original.geometry.clone().applyMatrix4(matrix.clone().multiply(original.matrixWorld))
      );
      const geometry = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
      geometries.push(geometry);
      const lines = new THREE.LineSegments(geometry, original.material);
      lines.name = `ship-rigging-${type}`;
      group.add(lines);
    });
  }
  return {
    group,
    pickables,
    dispose() {
      group.removeFromParent();
      for (const mesh of pickables) (mesh as THREE.InstancedMesh).dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const model of models) model.dispose();
    }
  };
}
