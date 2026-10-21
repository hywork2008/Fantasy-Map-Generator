import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createCemeteryProp } from "../../buildings/landscape/cemeteryProps";
import { createLandscapeTree, TREE_SPECIES, type TreeSpecies } from "../../buildings/landscape/trees";
import { models as houses } from "../../buildings/medieval/07-dwellingsModels";
import { models as fuel } from "../../buildings/medieval/13-fuel-storageModels";
import { models as churches } from "../../buildings/medieval/14-parish-churchesModels";
import { models as graves } from "../../buildings/medieval/19-grave-markersModels";
import { ModelKit } from "../../buildings/medieval/modelKit";
import { createPublicWaterBasinModel } from "../../buildings/wells/publicWaterBasin";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import type {
  OpenSpaceModel,
  OpenSpacePlan,
  OpenSpaceSite,
  OpenSpaceSurface
} from "../../city-editor/renderers/openSpaceSites";
import type { Point } from "../../city-editor/types/document";
import { planVertex } from "../core/planFrame";
import type { CityStructureMeshes } from "./structureMeshes";

function isTreeModel(kind: OpenSpaceModel): kind is TreeSpecies {
  return (TREE_SPECIES as readonly string[]).includes(kind);
}

function createModel(kind: OpenSpaceModel): CityStructureMeshes {
  if (isTreeModel(kind)) return createLandscapeTree(kind);
  switch (kind) {
    case "headstone":
      return graves[0].create();
    case "ledger": {
      const k = new ModelKit("ledger");
      k.box("ledger-slab", [0, 0.05, 0], [0.56, 0.1, 1.05], "stone");
      return k.finish();
    }
    case "chapel":
      return churches[1].create();
    case "cottage":
      return houses[1].create();
    case "woodyard":
      return fuel[0].create();
    case "basin":
      return createPublicWaterBasinModel();
    default:
      return createCemeteryProp(kind);
  }
}

function shapeOf(ring: Point[], holes: Point[][] = []): THREE.Shape {
  const shape = new THREE.Shape(ring.map(p => new THREE.Vector2(...p)));
  shape.holes = holes.map(hole => new THREE.Path(hole.map(p => new THREE.Vector2(...p))));
  return shape;
}

/** Ground surfaces follow relief with a bounded triangle spacing instead of bridging entire lawns. */
function surfaceGeometry(surface: OpenSpaceSurface, heightAt: (p: Point) => number): THREE.BufferGeometry {
  const shape = shapeOf(surface.ring, surface.holes);
  const { shape: ring, holes } = shape.extractPoints(12);
  const points = [...ring, ...holes.flat()];
  const positions: number[] = [];
  const addTriangle = (a: Point, b: Point, c: Point, depth = 0) => {
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]),
      bc = Math.hypot(b[0] - c[0], b[1] - c[1]),
      ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (Math.max(ab, bc, ca) > 8 && depth < 12) {
      const mid = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (ab >= bc && ab >= ca) {
        const m = mid(a, b);
        addTriangle(a, m, c, depth + 1);
        addTriangle(m, b, c, depth + 1);
      } else if (bc >= ca) {
        const m = mid(b, c);
        addTriangle(a, b, m, depth + 1);
        addTriangle(a, m, c, depth + 1);
      } else {
        const m = mid(c, a);
        addTriangle(a, b, m, depth + 1);
        addTriangle(m, b, c, depth + 1);
      }
      return;
    }
    for (const p of [a, b, c]) positions.push(...planVertex(p, heightAt(p) + surface.offset));
  };
  for (const tri of THREE.ShapeUtils.triangulateShape(ring, holes)) {
    const [a, b, c] = tri.map(i => points[i].toArray() as Point);
    addTriangle(a, b, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Instanced BV models, batched ground and explicit non-rectangular grave footprints. Owns all resources. */
export function createTownOpenSpaces(
  plan: OpenSpacePlan,
  terrain?: Pick<CityTerrain, "heightAt" | "foundationAt">
): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "ce-open-spaces";
  const pickables: THREE.Mesh[] = [];
  const models: CityStructureMeshes[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const heightAt = terrain?.heightAt ?? (() => 0);
  const addMesh = (mesh: THREE.Mesh) => {
    group.add(mesh);
    pickables.push(mesh);
  };
  const surfaces = new Map<string, THREE.BufferGeometry[]>();
  for (const surface of plan.surfaces) {
    if (surface.ring.length < 3) continue;
    const list = surfaces.get(surface.color) ?? [];
    list.push(surfaceGeometry(surface, heightAt));
    surfaces.set(surface.color, list);
  }
  for (const [color, parts] of surfaces) {
    const geometry = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    const material = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    geometries.push(geometry);
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "open-space-ground";
    addMesh(mesh);
  }
  const batches = new Map<OpenSpaceModel, OpenSpaceSite[]>();
  for (const site of plan.sites) {
    // Preserve edited roofless towers and their saved courtyard / central well openings.
    if (site.model === "tower_of_silence" && site.footprint && site.holes?.[0]) {
      const wall = new THREE.ExtrudeGeometry(shapeOf(site.footprint, [site.holes[0]]), {
        depth: 3,
        bevelEnabled: false
      });
      const floor = new THREE.ExtrudeGeometry(shapeOf(site.holes[0], site.holes.slice(1)), {
        depth: 0.1,
        bevelEnabled: false
      });
      const geometry = mergeGeometries([wall, floor])!;
      wall.dispose();
      floor.dispose();
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, terrain?.foundationAt(site.footprint) ?? heightAt(site.point), 0);
      const material = new THREE.MeshLambertMaterial({ color: 0xaaa18e });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = site.model;
      addMesh(mesh);
      continue;
    }
    // Preserve the saved concave terrace exactly; its first chord is not a rectangular building axis.
    if (site.model === "terrace_horseshoe" && site.footprint) {
      const geometry = new THREE.ExtrudeGeometry(shapeOf(site.footprint), { depth: 0.9, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, terrain?.foundationAt(site.footprint) ?? heightAt(site.point), 0);
      const material = new THREE.MeshLambertMaterial({ color: 0xaaa18e });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = site.model;
      addMesh(mesh);
      continue;
    }
    const list = batches.get(site.model) ?? [];
    list.push(site);
    batches.set(site.model, list);
  }
  for (const [kind, sites] of batches) {
    const model = createModel(kind);
    models.push(model);
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    const size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const mesh of model.pickables) {
      const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
      if (geometry !== transformed) transformed.dispose();
      // BV roofs and primitives have different UV layouts; these solid-color batches only need positions and normals.
      for (const attribute of Object.keys(geometry.attributes))
        if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
      geometry.translate(-center.x, -bounds.min.y, -center.z);
      const material = mesh.material as THREE.Material;
      const list = parts.get(material) ?? [];
      list.push(geometry);
      parts.set(material, list);
    }
    for (const [material, list] of parts) {
      const geometry = mergeGeometries(list)!;
      for (const part of list) part.dispose();
      geometries.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, material, sites.length);
      mesh.name = `${kind}-instances`;
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const radiusScale = site.radius ? site.radius / (Math.max(size.x, size.z) / 2) : 1;
        const scale = new THREE.Vector3(
          site.width ? site.width / size.x : radiusScale,
          site.height ? site.height / size.y : 1,
          site.depth ? site.depth / size.z : radiusScale
        );
        const y = site.footprint
          ? (terrain?.foundationAt(site.footprint) ?? heightAt(site.point))
          : heightAt(site.point);
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...planVertex(site.point, y + 0.05)),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.angle),
          scale
        );
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      addMesh(mesh);
    }
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const model of models) model.dispose();
    }
  };
}
