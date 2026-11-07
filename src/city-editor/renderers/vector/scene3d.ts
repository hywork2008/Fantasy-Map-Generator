import * as THREE from "three";
import { placeableObject } from "../../../buildings/placeableObjects";
import { placementDefinition, placementFootprint } from "../../../buildings/placementModels";
import { polygonArea } from "../../generators/geom";
import { regionArea, regionBoolean } from "../../generators/vector/geometry/regions";
import type { VectorRenderData, VectorRenderSurface } from "./renderData";
import { projectTerrainGeometry } from "./terrainGeometry";

function shape(p: VectorRenderSurface["polygons"][number], origin: readonly [number, number]) {
  const local = (p: readonly number[]) => new THREE.Vector2(p[0] - origin[0], p[1] - origin[1]);
  const path = new THREE.Shape(p.outer.map(local));
  for (const h of p.holes) path.holes.push(new THREE.Path(h.map(local)));
  return path;
}
function elevatedGeometry(
  polygon: VectorRenderSurface["polygons"][number],
  levels: NonNullable<VectorRenderSurface["elevations"]>[number],
  origin: readonly [number, number],
  datum: number
) {
  const rings = [polygon.outer, ...polygon.holes];
  const vertices = rings.flat();
  const triangles = THREE.ShapeUtils.triangulateShape(
    rings[0].map(p => new THREE.Vector2(...p)),
    rings.slice(1).map(r => r.map(p => new THREE.Vector2(...p)))
  );
  const count = vertices.length,
    indices: number[] = [];
  const volume = levels.top.some((h, i) => Math.abs(h - levels.bottom[i]) > 1e-9);
  for (const [a, b, c] of triangles) {
    indices.push(a, b, c);
    if (volume) indices.push(c + count, b + count, a + count);
  }
  let offset = 0;
  for (const ring of volume ? rings : []) {
    for (let i = 0; i < ring.length; i++) {
      const a = offset + i,
        b = offset + ((i + 1) % ring.length);
      indices.push(a, b, a + count, b, b + count, a + count);
    }
    offset += ring.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      (volume ? [levels.top, levels.bottom] : [levels.top]).flatMap(values =>
        vertices.flatMap((p, i) => [p[0] - origin[0], values[i] - datum, -p[1] + origin[1]])
      ),
      3
    )
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
/** Uses the adopted footprints as the authority, with authored BV models only when their envelope still matches. */
export function createVectorScene(data: VectorRenderData) {
  const group = new THREE.Group(),
    warnings = [...data.warnings],
    disposers: (() => void)[] = [],
    materials = new Map<string, THREE.MeshStandardMaterial>(),
    prototypes = new Map<string, ReturnType<NonNullable<ReturnType<typeof placementDefinition>>["create"]>>();
  const datum = data.terrain?.points[0]?.[1] ?? 0;
  group.position.set(data.center[0], datum, -data.center[1]);
  group.userData = {
    format: "fmg-vector-city-render",
    revision: data.revision,
    stage: data.stage,
    units: "meters",
    north: "-Z",
    originEastNorth: data.center,
    datumMeters: datum
  };
  const material = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
      materials.set(color, m);
    }
    return m;
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.clear();
    for (const release of disposers) release();
    for (const m of materials.values()) m.dispose();
    for (const model of prototypes.values()) model.dispose();
    prototypes.clear();
    materials.clear();
  };
  try {
    const groundGeometry = data.terrain
      ? new THREE.BufferGeometry()
      : data.groundCutouts?.length
        ? (() => {
            const half = data.extentMeters / 2,
              [x, y] = data.center;
            const polygons = regionBoolean(
              [
                {
                  outer: [
                    [x - half, y - half],
                    [x + half, y - half],
                    [x + half, y + half],
                    [x - half, y + half]
                  ],
                  holes: []
                }
              ],
              data.groundCutouts,
              "difference"
            );
            const geometry = new THREE.ShapeGeometry(polygons.map(p => shape(p, data.center)));
            geometry.rotateX(-Math.PI / 2);
            return geometry;
          })()
        : new THREE.PlaneGeometry(data.extentMeters, data.extentMeters);
    if (data.terrain) {
      groundGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          data.terrain.points.flatMap(p => [p[0] - data.center[0], p[1] - datum, -p[2] + data.center[1]]),
          3
        )
      );
      groundGeometry.setIndex(data.terrain.indices);
      groundGeometry.computeVertexNormals();
    }
    const ground = new THREE.Mesh(groundGeometry, material("#ece6d9"));
    if (!data.terrain) {
      if (!data.groundCutouts?.length) ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.01, 0);
    }
    group.add(ground);
    disposers.push(() => ground.geometry.dispose());
    for (const surface of data.surfaces) {
      const p = surface.placement;
      let placed = false;
      if (p && surface.kind === "building" && !surface.provisional) {
        const definition =
            placementDefinition(p.modelId, p.appearance?.quality ?? "low", p.appearance?.palette, {
              activity: p.appearance?.activity
            }) ?? placeableObject(p.modelId),
          footprint = placementFootprint(p.modelId, p.appearance?.quality ?? "low");
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
            let model = prototypes.get(definition.id);
            if (!model) {
              model = definition.create();
              prototypes.set(definition.id, model);
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
              wrapper.position.set(
                p.position[0] - data.center[0],
                surface.elevationMeters - datum,
                -p.position[1] + data.center[1]
              );
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
      for (const [polygonIndex, polygon] of surface.polygons.entries()) {
        if (Math.abs(polygonArea(polygon.outer)) < 1e-8) continue;
        let geometry: THREE.BufferGeometry = surface.elevations
          ? elevatedGeometry(polygon, surface.elevations[polygonIndex], data.center, datum)
          : surface.heightMeters > 0
            ? new THREE.ExtrudeGeometry(shape(polygon, data.center), {
                depth: surface.heightMeters,
                bevelEnabled: false,
                curveSegments: 1
              })
            : new THREE.ShapeGeometry(shape(polygon, data.center));
        if (!surface.elevations) geometry.rotateX(-Math.PI / 2);
        if (surface.heightAt) {
          const original = geometry;
          try {
            geometry = projectTerrainGeometry(
              original,
              p => surface.heightAt!([p[0] + data.center[0], p[1] + data.center[1]]) - datum,
              Math.max(1, data.extentMeters / 128)
            );
          } finally {
            original.dispose();
          }
        }
        const mesh = new THREE.Mesh(geometry, material(surface.color));
        mesh.position.y = surface.elevations ? 0 : surface.elevationMeters - (surface.heightAt ? 0 : datum);
        mesh.userData = {
          id: surface.id,
          kind: surface.kind,
          representation: "footprint",
          featureKind: surface.featureKind,
          pieceRole: surface.pieceRole
        };
        group.add(mesh);
        disposers.push(() => geometry.dispose());
      }
    }
    return { group, warnings, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
