import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hasTreeQualityLevels, TREE_SPECIES, type TreeSpecies } from "../../buildings/landscape/trees";
import { models as houses } from "../../buildings/medieval/07-dwellingsModels";
import { models as fuel } from "../../buildings/medieval/13-fuel-storageModels";
import { models as churches } from "../../buildings/medieval/14-parish-churchesModels";
import { models as graves } from "../../buildings/medieval/19-grave-markersModels";
import { MEDIEVAL_VARIANTS, medievalFamily } from "../../buildings/medieval/medievalVariants";
import { ModelKit } from "../../buildings/medieval/modelKit";
import { CEMETERY_VARIANTS, WELL_VARIANTS } from "../../buildings/siteVariants";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import type { OpenSpaceModel, OpenSpacePlan, OpenSpaceSite } from "../../city-editor/renderers/openSpaceSites";
import type { Point } from "../../city-editor/types/document";
import { adopt, adoptedTree, markVariant } from "../adoption";
import { planVertex } from "../core/planFrame";
import { groundSurfaceGeometry } from "./groundSurfaceGeometry";
import { createOpenSpaceTreeLod } from "./openSpaceTreeLod";
import type { CityStructureMeshes } from "./structureMeshes";

function isTreeModel(kind: OpenSpaceModel): kind is TreeSpecies {
  return (TREE_SPECIES as readonly string[]).includes(kind);
}

/** The adopted BV variant for a site kind; the grave ledger is a plain slab without one. */
function variantOf(kind: OpenSpaceModel) {
  if (isTreeModel(kind)) return adoptedTree(kind);
  switch (kind) {
    case "headstone":
      return adopt(MEDIEVAL_VARIANTS, medievalFamily(graves[0]), "default");
    case "ledger":
      return undefined;
    case "chapel":
      return adopt(MEDIEVAL_VARIANTS, medievalFamily(churches[1]), "default");
    case "cottage":
      return adopt(MEDIEVAL_VARIANTS, medievalFamily(houses[1]), "default");
    case "woodyard":
      return adopt(MEDIEVAL_VARIANTS, medievalFamily(fuel[0]), "default");
    case "basin":
      return adopt(WELL_VARIANTS, "well.publicBasin", "default");
    default:
      return adopt(CEMETERY_VARIANTS, `cemetery.${kind}`, "default");
  }
}

function createModel(kind: OpenSpaceModel): CityStructureMeshes {
  const variant = variantOf(kind);
  if (variant) return variant.create();
  const k = new ModelKit("ledger");
  k.box("ledger-slab", [0, 0.05, 0], [0.56, 0.1, 1.05], "stone");
  return k.finish();
}

function shapeOf(ring: Point[], holes: Point[][] = []): THREE.Shape {
  const shape = new THREE.Shape(ring.map(p => new THREE.Vector2(...p)));
  shape.holes = holes.map(hole => new THREE.Path(hole.map(p => new THREE.Vector2(...p))));
  return shape;
}

/** Instanced BV models, batched ground and explicit non-rectangular grave footprints. Owns all resources. */
export function createTownOpenSpaces(
  plan: OpenSpacePlan,
  terrain?: Pick<CityTerrain, "heightAt" | "foundationAt">,
  cameraTreeLod = false
) {
  const group = new THREE.Group();
  group.name = "ce-open-spaces";
  const pickables: THREE.Mesh[] = [];
  const models: CityStructureMeshes[] = [];
  const treeLayers: ReturnType<typeof createOpenSpaceTreeLod>[] = [];
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
    list.push(groundSurfaceGeometry(surface, heightAt));
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
    if (cameraTreeLod && isTreeModel(kind) && hasTreeQualityLevels(kind)) {
      const layer = createOpenSpaceTreeLod(kind, sites, heightAt);
      treeLayers.push(layer);
      group.add(layer.group);
      continue;
    }
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
      // BV roofs and primitives have different UV layouts; these solid-color batches retain vertex colors for shared botanical foliage.
      for (const attribute of Object.keys(geometry.attributes))
        if (attribute !== "position" && attribute !== "normal" && attribute !== "color")
          geometry.deleteAttribute(attribute);
      geometry.translate(-center.x, isTreeModel(kind) ? 0 : -bounds.min.y, -center.z);
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
      const variant = variantOf(kind);
      if (variant) markVariant(mesh, variant.id);
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
  const treeBounds = new THREE.Box3();
  for (const layer of treeLayers) treeBounds.union(layer.bounds);
  return {
    treeBounds,
    group,
    pickables,
    update(camera: THREE.PerspectiveCamera, viewportHeight: number) {
      let changed = false;
      for (const layer of treeLayers) changed = layer.update(camera, viewportHeight) || changed;
      return changed;
    },
    dispose() {
      for (const mesh of pickables) if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const model of models) model.dispose();
      for (const layer of treeLayers) layer.dispose();
    }
  };
}
