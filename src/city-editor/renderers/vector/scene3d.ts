import * as THREE from "three";
import type { BuildingAppearance } from "../../../buildings/appearance/types";
import { placeableObject } from "../../../buildings/placeableObjects";
import { placementDefinition, placementFootprint } from "../../../buildings/placementModels";
import { LAND_Y } from "../../../city3d/core/waterGeometry";
import { createBvPrototypeCache } from "../../../city3d/three/bvInstances";
import { createCityMassing } from "../../../city3d/three/cityMeshes";
import { createTownCranes, createTownHarborCargo } from "../../../city3d/three/craneMeshes";
import { createTownRoads } from "../../../city3d/three/roadMeshes";
import { createTownShips } from "../../../city3d/three/shipMeshes";
import { createStructureMassing } from "../../../city3d/three/structureMeshes";
import { createTownWallParts } from "../../../city3d/three/townWallMeshes";
import { createTownWaterParts } from "../../../city3d/three/waterMeshes";
import { createTownWells } from "../../../city3d/three/wellMeshes";
import { polygonArea } from "../../generators/geom";
import type { TownWaterPart } from "../../generators/townWater";
import { regionArea, regionBoolean } from "../../generators/vector/geometry/regions";
import type { BuildingMassing } from "../../types/contracts/buildingMassing";
import type { Point } from "../../types/primitives";
import { createVectorLandscapeTrees } from "./landscapeTrees";
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
const HOUSE_TILE_METERS = 128;
interface HouseBatch {
  positions: number[];
  ids: string[];
  firstTriangles: number[];
  triangles: number;
  color: string;
}
/** Appends one house prism as plain triangles, so a hit's `faceIndex` maps back to the house. */
function appendHousePrism(
  batch: HouseBatch,
  id: string,
  polygon: VectorRenderSurface["polygons"][number],
  bottom: number,
  top: number,
  origin: readonly [number, number]
) {
  const rings = [polygon.outer, ...polygon.holes],
    vertices = rings.flat(),
    out = batch.positions,
    before = batch.triangles;
  const push = (p: readonly number[], y: number) => out.push(p[0] - origin[0], y, -p[1] + origin[1]);
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
    rings[0].map(p => new THREE.Vector2(...p)),
    rings.slice(1).map(r => r.map(p => new THREE.Vector2(...p)))
  )) {
    push(vertices[a], top);
    push(vertices[b], top);
    push(vertices[c], top);
    batch.triangles++;
  }
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      push(a, bottom);
      push(b, bottom);
      push(b, top);
      push(a, bottom);
      push(b, top);
      push(a, top);
      batch.triangles += 2;
    }
  if (batch.triangles > before) {
    batch.ids.push(id);
    batch.firstTriangles.push(before);
  }
}
/** Uses the adopted footprints as the authority, with authored BV models only when their envelope still matches. */
export function createVectorScene(data: VectorRenderData) {
  const group = new THREE.Group(),
    warnings = [...data.warnings],
    disposers: (() => void)[] = [],
    materials = new Map<string, THREE.MeshStandardMaterial>(),
    prototypes = new Map<string, ReturnType<NonNullable<ReturnType<typeof placementDefinition>>["create"]>>();
  const harborCache = createBvPrototypeCache();
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
    // Flat water uses the mesh editor's water tops and bank skirts, sunk below a ground cut open for it.
    const waterParts: TownWaterPart[] = data.terrain
      ? []
      : (data.water ?? []).flatMap(w =>
          w.polygons.flatMap(p => {
            if (!p.holes.length) return [{ kind: w.kind, polygon: p.outer.map(q => [q[0], q[1]] as Point) }];
            // Parts are plain rings; an island splits the water into its triangles, which share unskirted edges.
            const vertices = [p.outer, ...p.holes].flat();
            return THREE.ShapeUtils.triangulateShape(
              p.outer.map(q => new THREE.Vector2(...q)),
              p.holes.map(h => h.map(q => new THREE.Vector2(...q)))
            ).map(t => ({ kind: w.kind, polygon: t.map(i => [vertices[i][0], vertices[i][1]] as Point) }));
          })
        );
    const cutouts = [
      ...(data.groundCutouts ?? []),
      ...(waterParts.length ? (data.water ?? []).flatMap(w => w.polygons) : [])
    ];
    const groundGeometry = data.terrain
      ? new THREE.BufferGeometry()
      : cutouts.length
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
              cutouts,
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
      if (!cutouts.length) ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.01, 0);
    }
    group.add(ground);
    disposers.push(() => ground.geometry.dispose());
    if (waterParts.length) {
      const water = createTownWaterParts(waterParts),
        holder = new THREE.Group();
      // The mesh editor's land lies at LAND_Y; here the land is at the datum.
      holder.position.set(-data.center[0], -datum - LAND_Y, data.center[1]);
      holder.add(water.parent);
      group.add(holder);
      disposers.push(() => water.dispose());
    }
    if (data.landscapeTrees?.length) {
      const trees = createVectorLandscapeTrees(data.landscapeTrees, data.center, datum);
      group.add(trees.group);
      disposers.push(() => trees.dispose());
    }
    if (data.wells?.length) {
      const local = data.wells.map(w => ({
          id: w.id,
          point: [w.point[0] - data.center[0], w.point[1] - data.center[1]] as Point,
          kind: w.kind,
          y: w.elevationMeters - datum
        })),
        wells = createTownWells(
          local,
          p => local.find(w => w.point[0] === p[0] && w.point[1] === p[1])?.y ?? 0,
          harborCache
        );
      wells.group.userData = { kind: "feature", featureKind: "well", representation: "bv-well" };
      group.add(wells.group);
      disposers.push(() => wells.dispose());
    }
    // Generated houses share one mesh per colour, height and tile: draw calls grow with area, not houses.
    const houseBatches = new Map<string, HouseBatch>();
    const massingLots: { polygon: Point[]; massing: BuildingMassing; appearance?: BuildingAppearance }[] = [],
      massingIds: string[] = [],
      massingElevations: number[] = [];
    // Walls, towers, gates and bridges use the mesh editor's structure massing, one group per owner for picking.
    const massed = new Set<string>();
    for (const owner of data.structures ?? []) {
      if (!owner.parts.length) continue;
      // Stone town walls take the mesh editor's BV curtain, towers and gatehouses (P2d-2); the massing keeps the
      // rest (timber walls, footings, bridges).
      const stonework =
        owner.kind === "wall" && owner.material === "stone"
          ? createTownWallParts(owner.parts, harborCache, "high", {
              profile: data.wallProfile ?? "legacy",
              wallIds: [owner.owner],
              gates: owner.gates ?? []
            })
          : undefined;
      const meshes = createStructureMassing(owner.parts.filter(p => !stonework?.replaced.has(p.id))),
        holder = new THREE.Group();
      if (stonework) {
        holder.add(stonework.group);
        disposers.push(() => stonework.dispose());
      }
      // Massing is in plan metres at absolute heights; the scene group sits at the centre and the datum.
      holder.position.set(-data.center[0], -datum, data.center[1]);
      holder.userData = { id: owner.owner, kind: owner.kind, representation: "structure-massing" };
      holder.add(meshes.group);
      group.add(holder);
      disposers.push(() => meshes.dispose());
      massed.add(owner.owner);
    }
    // Roads use the mesh editor's wearing-course meshes. Their outlines stay as hidden pick targets, so a road
    // or fabric line is still selected by its own id.
    let roadsDrawn = false;
    if (data.roads?.ribbons.length) {
      const heightAt = data.surfaces.find(s => s.kind === "road" && s.heightAt)?.heightAt,
        roads = createTownRoads(data.roads.ribbons, data.roads.water, heightAt),
        holder = new THREE.Group();
      // The mesh editor's land lies at LAND_Y and its roads just above; here the land is at the datum.
      holder.position.set(-data.center[0], -datum - LAND_Y, data.center[1]);
      holder.add(roads.parent);
      group.add(holder);
      disposers.push(() => roads.dispose());
      roadsDrawn = true;
    }
    for (const surface of data.surfaces) {
      if (surface.pieceRole === "landscape-tree" || (surface.pieceRole === "bv-well" && data.wells?.length)) continue;
      if ((surface.kind === "wall" || surface.kind === "bridge") && massed.has(surface.id)) continue;
      if (surface.houses?.massing && surface.houses.massing.length === surface.houses.ids.length) {
        const { ids, elevationsMeters, massing, appearance } = surface.houses;
        surface.polygons.forEach((polygon, i) => {
          if (Math.abs(polygonArea(polygon.outer)) < 1e-8) return;
          massingLots.push({
            polygon: polygon.outer.map(p => [p[0], p[1]] as Point),
            massing: massing[i],
            appearance: appearance?.[i]
          });
          massingIds.push(ids[i]);
          massingElevations.push(elevationsMeters[i] - datum);
        });
        continue;
      }
      if (surface.houses) {
        const { ids, heightsMeters, elevationsMeters } = surface.houses;
        surface.polygons.forEach((polygon, i) => {
          if (Math.abs(polygonArea(polygon.outer)) < 1e-8) return;
          // Tiles keep each mesh small, so a pick ray rejects most houses by bounding sphere.
          const [x, y] = polygon.outer[0],
            key = `${surface.color}:${heightsMeters[i]}:${Math.floor(x / HOUSE_TILE_METERS)},${Math.floor(y / HOUSE_TILE_METERS)}`;
          let batch = houseBatches.get(key);
          if (!batch) {
            batch = { positions: [], ids: [], firstTriangles: [], triangles: 0, color: surface.color };
            houseBatches.set(key, batch);
          }
          const bottom = elevationsMeters[i] - datum;
          appendHousePrism(batch, ids[i], polygon, bottom, bottom + heightsMeters[i], data.center);
        });
        continue;
      }
      if (surface.harborShip || surface.harborCrane || surface.harborPile) {
        const ship = surface.harborShip,
          crane = surface.harborCrane,
          pile = surface.harborPile;
        const point = ship?.point ?? crane?.point ?? pile!.point;
        const model = ship
          ? createTownShips([{ ...ship, point: [0, 0] }], () => 0)
          : crane
            ? createTownCranes([{ ...crane, point: [0, 0] }], () => -LAND_Y, harborCache, "low")
            : createTownHarborCargo([{ ...pile!, point: [0, 0] }], () => -LAND_Y, harborCache);
        const wrapper = new THREE.Group();
        wrapper.position.set(point[0] - data.center[0], surface.elevationMeters - datum, -point[1] + data.center[1]);
        wrapper.userData = {
          id: surface.id,
          kind: "feature",
          featureKind: "harbor",
          pieceRole: surface.pieceRole,
          representation: "bv-harbor",
          ...(ship ? { shipState: { ...ship.state }, lengthMeters: ship.length } : {})
        };
        wrapper.add(model.group);
        group.add(wrapper);
        disposers.push(() => model.dispose());
        continue;
      }
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
        // Hidden meshes are not drawn or exported, but the pick ray still finds them.
        if ((roadsDrawn && surface.kind === "road") || (waterParts.length && surface.kind === "river"))
          mesh.visible = false;
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
    if (massingLots.length) {
      // Houses use the mesh editor's walls and roofs. Each lot's triangles are contiguous, so the same house table
      // as the prism batches maps a hit back to its house id.
      const elevation = new Map(massingLots.map((lot, i) => [lot.polygon, massingElevations[i]])),
        meshes = createCityMassing(massingLots, ring => elevation.get(ring) ?? 0),
        holder = new THREE.Group();
      holder.position.set(-data.center[0], 0, data.center[1]);
      for (const mesh of meshes.pickables) {
        const index = mesh.geometry.getAttribute("buildingIndex"),
          ids: string[] = [],
          firstTriangles: number[] = [];
        for (let v = 0, last = -1; v < index.count; v += 3) {
          const lot = index.getX(v);
          if (lot === last) continue;
          last = lot;
          ids.push(massingIds[lot]);
          firstTriangles.push(v / 3);
        }
        mesh.userData = {
          ...mesh.userData,
          kind: "building",
          buildingKind: "housing",
          representation: "fabric-massing",
          fabricHouses: { ids, firstTriangles, triangles: index.count / 3 }
        };
        mesh.geometry.computeBoundingSphere();
      }
      holder.add(meshes.group);
      group.add(holder);
      disposers.push(() => meshes.dispose());
    }
    for (const [key, batch] of houseBatches) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material(batch.color));
      mesh.userData = {
        kind: "building",
        buildingKind: "housing",
        representation: "fabric-houses",
        batch: key,
        fabricHouses: { ids: batch.ids, firstTriangles: batch.firstTriangles, triangles: batch.triangles }
      };
      group.add(mesh);
      disposers.push(() => geometry.dispose());
    }
    return { group, warnings, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
