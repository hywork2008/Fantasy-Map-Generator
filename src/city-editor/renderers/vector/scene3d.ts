import * as THREE from "three";
import { placementDefinition, placementFootprint } from "../../../buildings/placementModels";
import { polygonArea } from "../../generators/geom";
import { regionArea } from "../../generators/vector/geometry/regions";
import type { VectorRenderData, VectorRenderSurface } from "./renderData";

function shape(p: VectorRenderSurface["polygons"][number]) {
  const path = new THREE.Shape(p.outer.map(p => new THREE.Vector2(...p)));
  for (const h of p.holes) path.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(...p))));
  return path;
}
/** Uses the adopted footprints as the authority, with authored BV models only when their envelope still matches. */
export function createVectorScene(data: VectorRenderData) {
  const group = new THREE.Group(),
    warnings = [...data.warnings],
    disposers: (() => void)[] = [],
    materials = new Map<string, THREE.MeshStandardMaterial>(),
    prototypes = new Map<string, ReturnType<NonNullable<ReturnType<typeof placementDefinition>>["create"]>>();
  group.userData = {
    format: "fmg-vector-city-render",
    revision: data.revision,
    stage: data.stage,
    units: "meters",
    north: "-Z"
  };
  const material = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
      materials.set(color, m);
    }
    return m;
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(data.extentMeters, data.extentMeters), material("#ece6d9"));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(data.center[0], -0.01, -data.center[1]);
  group.add(ground);
  disposers.push(() => ground.geometry.dispose());
  for (const surface of data.surfaces) {
    const p = surface.placement;
    let placed = false;
    if (p && surface.kind === "building" && !surface.provisional) {
      const definition = placementDefinition(p.modelId, "low"),
        footprint = placementFootprint(p.modelId, "low");
      if (definition && footprint) {
        const expected = footprint.halfX * 2 * (footprint.halfZ * 2),
          area = surface.polygons.reduce((n, r) => n + regionArea(r), 0),
          angle = (p.facingDegrees * Math.PI) / 180,
          c = Math.cos(angle),
          s = Math.sin(angle),
          local = surface.polygons
            .flatMap(r => r.outer)
            .map(v => {
              const x = v[0] - p.position[0],
                y = v[1] - p.position[1];
              return [x * c + y * s, -x * s + y * c];
            }),
          width = Math.max(...local.map(p => p[0])) - Math.min(...local.map(p => p[0])),
          depth = Math.max(...local.map(p => p[1])) - Math.min(...local.map(p => p[1]));
        if (
          Math.abs(area - expected) < 0.01 &&
          Math.abs(width - footprint.halfX * 2) < 0.01 &&
          Math.abs(depth - footprint.halfZ * 2) < 0.01
        ) {
          let model = prototypes.get(p.modelId);
          if (!model) {
            model = definition.create();
            prototypes.set(p.modelId, model);
          }
          const measuredBounds = new THREE.Box3().setFromObject(model.group, true);
          const savedHeight = p.building?.heightMeters ?? p.display?.heightMeters;
          if (savedHeight !== undefined && Math.abs(measuredBounds.max.y - measuredBounds.min.y - savedHeight) > 0.01)
            warnings.push(`model-height-mismatch:${p.id}`);
          else {
            const instance = model.group.clone(true),
              bounds = new THREE.Box3().setFromObject(model.group, true),
              wrapper = new THREE.Group();
            instance.position.add(new THREE.Vector3(-footprint.centerX, -bounds.min.y, -footprint.centerZ));
            wrapper.add(instance);
            wrapper.position.set(p.position[0], surface.elevationMeters, -p.position[1]);
            wrapper.rotation.y = angle;
            wrapper.userData = { id: p.id, kind: "building", representation: "bv", modelId: p.modelId };
            group.add(wrapper);
            placed = true;
            if (savedHeight === undefined) warnings.push(`height-unverified:${p.id}`);
          }
        }
      }
      if (!placed) warnings.push(`massing:${p.id}`);
    }
    if (p && surface.provisional) warnings.push(`massing:${p.id}`);
    if (placed) continue;
    for (const polygon of surface.polygons) {
      if (Math.abs(polygonArea(polygon.outer)) < 1e-8) continue;
      const geometry =
        surface.heightMeters > 0
          ? new THREE.ExtrudeGeometry(shape(polygon), {
              depth: surface.heightMeters,
              bevelEnabled: false,
              curveSegments: 1
            })
          : new THREE.ShapeGeometry(shape(polygon));
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, material(surface.color));
      mesh.position.y = surface.elevationMeters;
      mesh.userData = { id: surface.id, kind: surface.kind, representation: "footprint" };
      group.add(mesh);
      disposers.push(() => geometry.dispose());
    }
  }
  let disposed = false;
  return {
    group,
    warnings,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      for (const release of disposers) release();
      for (const m of materials.values()) m.dispose();
      for (const model of prototypes.values()) model.dispose();
      prototypes.clear();
      materials.clear();
    }
  };
}
