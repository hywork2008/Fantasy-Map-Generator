import * as THREE from "three";
import type { BuildingAppearance } from "../../../buildings/appearance/types";
import type { ModelQuality } from "../../../buildings/modelQuality";
import { placeableObject } from "../../../buildings/placeableObjects";
import { placementDefinition, placementFootprint } from "../../../buildings/placementModels";
import { LAND_Y, WATER_Y } from "../../../city3d/core/waterGeometry";
import { createTownBridgesAt } from "../../../city3d/three/bridgeMeshes";
import { createTownBuildingDetails } from "../../../city3d/three/buildingDetails";
import { createBvPrototypeCache } from "../../../city3d/three/bvInstances";
import { createTownCranes, createTownHarborCargo } from "../../../city3d/three/craneMeshes";
import { createFacilityLayer } from "../../../city3d/three/facilityMeshes";
import { createTownForest, type Forest3dQuality } from "../../../city3d/three/forestMeshes";
import { createTownMonasteries } from "../../../city3d/three/friaryMeshes";
import { createTownObjects } from "../../../city3d/three/objectMeshes";
import { createTownOpenSpaces } from "../../../city3d/three/openSpaceMeshes";
import { createTownPiers } from "../../../city3d/three/pierMeshes";
import { createTownRegionalHouseLod } from "../../../city3d/three/regionalHouseLod";
import { createTownRoads } from "../../../city3d/three/roadMeshes";
import { createTownShips } from "../../../city3d/three/shipMeshes";
import { createStructureMassing } from "../../../city3d/three/structureMeshes";
import { createTownWallParts } from "../../../city3d/three/townWallMeshes";
import { createTownWaterParts } from "../../../city3d/three/waterMeshes";
import { createTownWells } from "../../../city3d/three/wellMeshes";
import { treeSeason } from "../../../city3d/treeSeason";
import type { BuildingLot } from "../../generators/buildingLots.types";
import { polygonArea } from "../../generators/geom";
import type { TownWaterPart } from "../../generators/townWater";
import { regionArea, regionBoolean } from "../../generators/vector/geometry/regions";
import type { BuildingMassing } from "../../types/contracts/buildingMassing";
import type { SimplificationPreferences } from "../../types/contracts/simplification";
import type { CityDocument, CityElement } from "../../types/document";
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
type CameraUpdate = (
  camera: THREE.PerspectiveCamera,
  height: number
) => { changed: boolean; pending: boolean; detailedHouses?: number };
interface VectorSceneLayer {
  stamp: string;
  object: THREE.Object3D;
  dispose(): void;
  cameraUpdate?: CameraUpdate;
  resolve?: (hit: THREE.Intersection) => string | undefined;
  /** Ids and kinds whose plan surfaces the layer's models replace, and structure owners it draws. */
  bvOwners?: readonly string[];
  bvKinds?: readonly string[];
  massed?: readonly string[];
  /** The forest layer's quality switch, kept with the layer so a reused forest still takes it. */
  setQuality?: (quality: Forest3dQuality) => boolean;
}

/** Compact content key of a layer's inputs (FNV-1a over the JSON, two lanes). */
function stampOf(...parts: unknown[]): string {
  const value = JSON.stringify(parts);
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}${value.length}`;
}

/**
 * The 3D layers a view keeps between redraws, as the mesh editor's view keeps its layers by stamp: a redraw of the
 * same view rebuilds only the layers whose inputs changed (houses, forest, open spaces, facilities, religious houses,
 * water, piers, wells, roads and each wall or bridge owner). The BV prototype cache lives here too, so a kept layer's
 * shared models outlive the scene that built it.
 */
export class VectorSceneLayers {
  readonly cache = createBvPrototypeCache();
  private layers = new Map<string, VectorSceneLayer>();
  private used = new Set<string>();
  /** Layers built (not reused) by the last scene, for tests and diagnostics. */
  built: string[] = [];
  begin() {
    this.used.clear();
    this.built = [];
  }
  take(key: string, stamp: string, build: () => Omit<VectorSceneLayer, "stamp">): VectorSceneLayer {
    this.used.add(key);
    const kept = this.layers.get(key);
    if (kept?.stamp === stamp) return kept;
    kept?.dispose();
    const layer = { ...build(), stamp };
    this.layers.set(key, layer);
    this.built.push(key);
    return layer;
  }
  /** Releases the layers the last scene did not use. */
  end() {
    for (const [key, layer] of this.layers)
      if (!this.used.has(key)) {
        layer.object.removeFromParent();
        layer.dispose();
        this.layers.delete(key);
      }
  }
  dispose() {
    for (const layer of this.layers.values()) layer.dispose();
    this.layers.clear();
  }
}

/**
 * Uses the adopted footprints as the authority, with authored BV models only when their envelope still matches.
 * `quality` is the viewer's model quality (the City Editor's shared preference, High by default, as the mesh
 * editor's 3D view): BV models drawn for the generated city use it. A placement someone set by hand keeps its own.
 */
export function createVectorScene(
  data: VectorRenderData,
  options: {
    quality?: ModelQuality;
    layers?: VectorSceneLayers;
    /** The mesh editor's simplification: "off" draws every house and tree at full detail (no camera LOD budget). */
    simplification?: SimplificationPreferences;
    /** The forest's starting quality; the view's automatic quality changes it in place (`setForestQuality`). */
    forestQuality?: Forest3dQuality;
  } = {}
) {
  const simplification = options.simplification ?? { urban: "auto", outskirts: "auto" },
    urbanLod = simplification.urban !== "off",
    outskirtsLod = simplification.outskirts !== "off";
  let setForestQuality: ((quality: Forest3dQuality) => boolean) | undefined;
  const quality = options.quality ?? "high",
    placementQuality = quality === "low" ? ("low" as const) : ("high" as const);
  const group = new THREE.Group(),
    warnings = [...data.warnings],
    disposers: (() => void)[] = [],
    materials = new Map<string, THREE.MeshStandardMaterial>(),
    prototypes = new Map<string, ReturnType<NonNullable<ReturnType<typeof placementDefinition>>["create"]>>();
  const layers = options.layers ?? new VectorSceneLayers(),
    ownLayers = !options.layers,
    harborCache = layers.cache;
  layers.begin();
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
  const cameraUpdates: CameraUpdate[] = [],
    houseResolvers: ((hit: THREE.Intersection) => string | undefined)[] = [],
    bvOwners = new Set<string>(),
    bvKinds = new Set<string>(),
    massed = new Set<string>();
  /** A kept or rebuilt layer, placed in this scene. */
  const layer = (key: string, inputs: unknown[], build: () => Omit<VectorSceneLayer, "stamp">) => {
    const l = layers.take(key, stampOf(quality, data.center, datum, ...inputs), build);
    group.add(l.object);
    if (l.cameraUpdate) cameraUpdates.push(l.cameraUpdate);
    if (l.resolve) houseResolvers.push(l.resolve);
    for (const id of l.bvOwners ?? []) bvOwners.add(id);
    for (const kind of l.bvKinds ?? []) bvKinds.add(kind);
    for (const id of l.massed ?? []) massed.add(id);
    return l;
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.clear();
    for (const release of disposers) release();
    if (ownLayers) layers.dispose();
    for (const m of materials.values()) m.dispose();
    for (const model of prototypes.values()) model.dispose();
    prototypes.clear();
    materials.clear();
  };
  // The trees' look in the descriptor's month, or for a standalone town the mesh editor's default display month
  // and latitude (July at 45°): leaf-out, autumn colours and bare branches (P2d-8).
  const season = treeSeason(data.seasonDescriptor, "descriptor", { latitude: 45, month: 7 });
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
    if (waterParts.length)
      layer("water", [waterParts], () => {
        const water = createTownWaterParts(waterParts),
          holder = new THREE.Group();
        // The mesh editor's land lies at LAND_Y; here the land is at the datum.
        holder.position.set(-data.center[0], -datum - LAND_Y, data.center[1]);
        holder.add(water.parent);
        return { object: holder, dispose: () => water.dispose() };
      });
    if (data.landscapeTrees?.length)
      layer("landscape-trees", [data.landscapeTrees, season], () => {
        const trees = createVectorLandscapeTrees(data.landscapeTrees!, data.center, datum, season);
        return { object: trees.group, dispose: () => trees.dispose() };
      });
    if (data.piers?.length && !data.terrain)
      layer("piers", [data.piers], () => {
        const piers = createTownPiers(
            data.piers!,
            () => WATER_Y,
            () => LAND_Y
          ),
          holder = new THREE.Group();
        holder.position.set(-data.center[0], -datum - LAND_Y, data.center[1]);
        holder.userData = { kind: "feature", featureKind: "harbor", representation: "bv-pier" };
        holder.add(piers.group);
        return { object: holder, dispose: () => piers.dispose() };
      });
    // Inns, guild halls and yards, windmills and gallows as the mesh editor's BV facilities, religious houses as its
    // fitted friary assemblies (P2d-4). Their raised massing gives way; ground pieces stay under the models.
    if (data.facilities && Object.values(data.facilities.aerial ?? {}).some(list => list?.length) && !data.terrain)
      layer("facilities", [data.facilities], () => {
        const facilities = createFacilityLayer(data.facilities!, harborCache, quality),
          holder = new THREE.Group();
        holder.position.set(-data.center[0], -datum, data.center[1]);
        holder.userData = { kind: "feature", representation: "bv-facility" };
        holder.add(facilities.group);
        return {
          object: holder,
          dispose: () => facilities.dispose(),
          bvOwners: facilities.accepted.map(site => site.id)
        };
      });
    if (data.monasteries?.length && !data.terrain)
      layer("monasteries", [data.monasteries], () => {
        const houses = createTownMonasteries(data.monasteries!, undefined, quality),
          holder = new THREE.Group();
        holder.position.set(-data.center[0], -datum, data.center[1]);
        holder.userData = { kind: "feature", featureKind: "monastery", representation: "bv-monastery" };
        holder.add(houses.group);
        return { object: holder, dispose: () => houses.dispose(), bvKinds: ["monastery"] };
      });
    if (data.openSpaces && !data.terrain)
      layer("open-spaces", [data.openSpaces, season, outskirtsLod], () => {
        const spaces = createTownOpenSpaces(data.openSpaces!, undefined, outskirtsLod, season),
          holder = new THREE.Group();
        holder.position.set(-data.center[0], -datum, data.center[1]);
        holder.userData = { kind: "feature", featureKind: "cemetery", representation: "bv-open-space" };
        holder.add(spaces.group);
        return {
          object: holder,
          dispose: () => spaces.dispose(),
          cameraUpdate: (camera, height) => ({ changed: spaces.update(camera, height), pending: false }),
          bvKinds: ["cemetery"]
        };
      });
    // Woodland as the mesh editor's forest (P2d-6): floor, far crowns and near trees by the camera, in the
    // town's climate and the settings' density. Its flat surface stays in the 2D plan only.
    if (data.forest && !data.terrain) {
      const forestLayer = layer("forest", [data.forest, season, outskirtsLod], () => {
        const f = data.forest!,
          forestDocument = {
            format: "vector-forest",
            generationSeed: f.seed,
            forestSettings: { density: f.density },
            ...(f.climate.biome ? { biome: f.climate.biome } : {}),
            buildingAppearanceContext: { temperatureC: f.climate.temperatureC },
            fabric: { generation: { settings: { descriptor: { climate: { biomeKey: f.climate.climateBiomeKey } } } } }
          } as unknown as CityDocument,
          regions = f.regions.map((r, i) => {
            const xs = r.outer.map(p => p[0]),
              ys = r.outer.map(p => p[1]);
            return {
              id: `environment:forest:${i}`,
              outer: r.outer as Point[],
              holes: r.holes as Point[][],
              sourceFaceIds: [],
              areaM2: regionArea(r),
              bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [
                number,
                number,
                number,
                number
              ]
            };
          }),
          forest = createTownForest(
            forestDocument,
            {
              regions,
              forestFaceIds: [],
              areaM2: regions.reduce((n, r) => n + r.areaM2, 0),
              protectedFarmCount: 0,
              protectedFarmAreaM2: 0
            },
            undefined,
            // The forest has its own quality in the mesh editor, automatic by default.
            options.forestQuality ?? "standard",
            outskirtsLod,
            season
          ),
          holder = new THREE.Group();
        holder.position.set(-data.center[0], -datum, data.center[1]);
        holder.userData = {
          id: "environment:forest",
          kind: "feature",
          featureKind: "forest",
          representation: "bv-forest"
        };
        holder.add(forest.group);
        return {
          object: holder,
          dispose: () => forest.dispose(),
          cameraUpdate: (camera, height) => ({ changed: !!forest.update(camera, height), pending: false }),
          setQuality: (next: Forest3dQuality) => forest.setQuality(next),
          bvKinds: ["forest"]
        };
      });
      setForestQuality = forestLayer.setQuality;
      if (options.forestQuality) setForestQuality?.(options.forestQuality);
    }
    const replacedByBv = (surface: VectorRenderSurface) => {
      if (surface.kind !== "feature") return false;
      // Cemetery parts are the open-space models; the ground and paths stay.
      if (surface.featureKind === "landscape" && /^cemetery-/.test(surface.pieceRole ?? ""))
        return bvKinds.has("cemetery") && !["cemetery-ground", "cemetery-access"].includes(surface.pieceRole!);
      if (surface.id === "environment:forest") return bvKinds.has("forest");
      if (surface.featureKind === "monastery") return bvKinds.has("monastery") && surface.heightMeters > 0;
      if (!bvOwners.has(surface.id) && ![...bvOwners].some(id => surface.id.startsWith(`${id}:`))) return false;
      // Sails, hubs and pillars belong to the model; mounds, yards and courts stay as its ground.
      return surface.heightMeters > 0 || /sail|^windmill-(post|tower)$/.test(surface.pieceRole ?? "");
    };
    if (data.wells?.length)
      layer("wells", [data.wells], () => {
        const local = data.wells!.map(w => ({
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
        return { object: wells.group, dispose: () => wells.dispose() };
      });
    // Catalogue placements (church, stalls, civic furniture) for the object layer.
    const objectItems: CityElement[] = [],
      objectHeights = new Map<string, number>(),
      objectMarkers: {
        id: string;
        modelId: string;
        position: readonly [number, number];
        angle: number;
        elevation: number;
        width: number;
        depth: number;
        height: number;
      }[] = [];
    // Generated houses share one mesh per colour, height and tile: draw calls grow with area, not houses.
    const houseBatches = new Map<string, HouseBatch>();
    const massingLots: { polygon: Point[]; massing: BuildingMassing; appearance?: BuildingAppearance }[] = [],
      massingIds: string[] = [],
      massingElevations: number[] = [];
    // Walls, towers, gates and bridges use the mesh editor's structure massing, one group per owner for picking.
    // The mesh editor's land lies at LAND_Y and its water at WATER_Y; here the land is at the datum.
    const level = { heightAt: () => LAND_Y, surfaceAt: () => LAND_Y };
    for (const owner of data.structures ?? []) {
      if (!owner.parts.length) continue;
      layer(`structure:${owner.owner}`, [owner, data.wallProfile, !!data.terrain], () => {
        if (owner.bridgeSite && !data.terrain) {
          const bridges = createTownBridgesAt([owner.bridgeSite], level, () => WATER_Y),
            holder = new THREE.Group();
          if (bridges.replaced.size) {
            holder.position.set(-data.center[0], -datum - LAND_Y, data.center[1]);
            holder.userData = { id: owner.owner, kind: owner.kind, representation: "bv-bridge" };
            holder.add(bridges.group);
            return { object: holder, dispose: () => bridges.dispose(), massed: [owner.owner] };
          }
          bridges.dispose();
        }
        // Stone town walls take the mesh editor's BV curtain, towers and gatehouses (P2d-2); the massing keeps the
        // rest (timber walls, footings, bridges).
        const stonework =
          owner.kind === "wall" && owner.material === "stone"
            ? createTownWallParts(owner.parts, harborCache, quality, {
                profile: data.wallProfile ?? "legacy",
                wallIds: [owner.owner],
                gates: owner.gates ?? []
              })
            : undefined;
        const meshes = createStructureMassing(owner.parts.filter(p => !stonework?.replaced.has(p.id))),
          holder = new THREE.Group();
        if (stonework) holder.add(stonework.group);
        // Massing is in plan metres at absolute heights; the scene group sits at the centre and the datum.
        holder.position.set(-data.center[0], -datum, data.center[1]);
        holder.userData = { id: owner.owner, kind: owner.kind, representation: "structure-massing" };
        holder.add(meshes.group);
        return {
          object: holder,
          dispose: () => {
            stonework?.dispose();
            meshes.dispose();
          },
          massed: [owner.owner]
        };
      });
    }
    // Roads use the mesh editor's wearing-course meshes. Their outlines stay as hidden pick targets, so a road
    // or fabric line is still selected by its own id.
    let roadsDrawn = false;
    if (data.roads?.ribbons.length) {
      const heightAt = data.surfaces.find(s => s.kind === "road" && s.heightAt)?.heightAt;
      // A relief's height function is not data: such roads are rebuilt every time (key by the document revision).
      layer("roads", [data.roads, heightAt ? data.revision : 0], () => {
        const roads = createTownRoads(data.roads!.ribbons, data.roads!.water, heightAt),
          holder = new THREE.Group();
        // The mesh editor's land lies at LAND_Y and its roads just above; here the land is at the datum.
        holder.position.set(-data.center[0], -datum - LAND_Y, data.center[1]);
        holder.add(roads.parent);
        return { object: holder, dispose: () => roads.dispose() };
      });
      roadsDrawn = true;
    }
    for (const surface of data.surfaces) {
      if (replacedByBv(surface)) continue;
      if (surface.pieceRole === "pier" && data.piers?.some(p => p.id === surface.id) && !data.terrain) continue;
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
            ? createTownCranes([{ ...crane, point: [0, 0] }], () => -LAND_Y, harborCache, quality)
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
        // Pieces laid by the generator draw at the viewer's quality; a hand-set placement keeps its own.
        const saved = p.appearance?.quality ?? "low",
          // A facility the generator placed (facility mode) was sized on its Low model; it draws at the viewer's
          // quality wherever that model keeps the same envelope, as the BV town-trade models do.
          generated =
            p.origin === "automatic" &&
            p.building?.kind === "facility" &&
            !p.appearance?.quality &&
            sameFootprint(placementFootprint(p.modelId, placementQuality), placementFootprint(p.modelId, saved)),
          level = p.display?.provenance === "copied" || generated ? placementQuality : saved,
          definition =
            placementDefinition(p.modelId, level, p.appearance?.palette, {
              activity: p.appearance?.activity
            }) ?? placeableObject(p.modelId),
          footprint = placementFootprint(p.modelId, level);
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
          // Pieces laid by the mesh editor's own rules (market stalls, the civic church) are its models: they stand
          // at their position and facing even where the saved plot is the layout's, not the catalogue envelope (P2d-4).
          const laid = p.display?.provenance === "copied" && !p.building;
          if (
            laid ||
            (Math.abs(area - expected) < 0.01 &&
              Math.abs(width - footprint.halfX * 2) < 0.01 &&
              Math.abs(depth - footprint.halfZ * 2) < 0.01)
          ) {
            let model = prototypes.get(definition.id);
            if (!model) {
              model = definition.create();
              prototypes.set(definition.id, model);
            }
            const measuredBounds = new THREE.Box3().setFromObject(model.group, true);
            // A laid piece's display height is the plan's estimate; the model is the authority.
            const savedHeight = laid ? undefined : (p.building?.heightMeters ?? p.display?.heightMeters);
            if (savedHeight !== undefined && Math.abs(measuredBounds.max.y - measuredBounds.min.y - savedHeight) > 0.01)
              warnings.push(`model-height-mismatch:${p.id}`);
            else {
              // Drawn with the mesh editor's object layer below: instanced by model, market stalls by the camera.
              objectItems.push({
                id: p.id,
                kind: "object",
                point: [p.position[0], p.position[1]],
                objectType: p.modelId,
                objectQuality: level,
                ...(p.appearance?.palette ? { objectPalette: p.appearance.palette } : {}),
                ...(p.appearance?.activity ? { objectMarketActivity: p.appearance.activity } : {}),
                ...(p.mirrored ? { objectMirrored: true } : {}),
                rotation: angle,
                locked: false
              } as CityElement);
              objectHeights.set(p.id, surface.elevationMeters);
              objectMarkers.push({
                id: p.id,
                modelId: p.modelId,
                position: p.position,
                angle,
                elevation: surface.elevationMeters - datum,
                width: footprint.halfX * 2,
                depth: footprint.halfZ * 2,
                height: measuredBounds.max.y - measuredBounds.min.y
              });
              placed = true;
              if (savedHeight === undefined && !laid) warnings.push(`height-unverified:${p.id}`);
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
    if (objectItems.length)
      layer("objects", [objectItems, [...objectHeights]], () => {
        const heights = new Map(objectItems.map(item => [item.point!.join(","), objectHeights.get(item.id)! - datum])),
          objects = createTownObjects(objectItems, point => heights.get(point.join(",")) ?? 0, harborCache, {
            lod: true
          }),
          holder = new THREE.Group(),
          modelOf = new Map(objectItems.map(item => [item.id, item.objectType!]));
        holder.position.set(-data.center[0], 0, data.center[1]);
        holder.add(objects.group);
        // Each instanced batch is one model: keep the catalogue id on it for the scene's readers.
        for (const mesh of objects.pickables) {
          const site = objects.resolve({ object: mesh, instanceId: 0 });
          mesh.userData = {
            ...mesh.userData,
            representation: "bv-instances",
            modelId: site && modelOf.get(site.id)
          };
        }
        return {
          object: holder,
          dispose: () => objects.dispose(),
          cameraUpdate: (camera, height) => ({ changed: objects.update(camera, height), pending: false }),
          resolve: hit => objects.resolve(hit)?.id
        };
      });
    // Each placement keeps an owner node with its id: an invisible envelope that the pick ray and the selection
    // outline find, while the instanced models above draw it.
    if (objectMarkers.length) {
      const box = new THREE.BoxGeometry(1, 1, 1),
        hidden = new THREE.MeshBasicMaterial();
      disposers.push(() => {
        box.dispose();
        hidden.dispose();
      });
      for (const m of objectMarkers) {
        const owner = new THREE.Group(),
          envelope = new THREE.Mesh(box, hidden);
        envelope.scale.set(m.width, m.height, m.depth);
        envelope.position.y = m.height / 2;
        envelope.visible = false;
        owner.add(envelope);
        owner.position.set(m.position[0] - data.center[0], m.elevation, -m.position[1] + data.center[1]);
        owner.rotation.y = m.angle;
        owner.userData = { id: m.id, kind: "building", representation: "bv", modelId: m.modelId };
        group.add(owner);
      }
    }
    if (massingLots.length) {
      // Houses use the mesh editor's walls and roofs. Each lot's triangles are contiguous, so the same house table
      // as the prism batches maps a hit back to its house id.
      // The mesh editor's housing LOD (P2d-7): every lot keeps its massing, and large visible houses take the
      // detailed regional BV house; façade details (doors, windows, timbering) follow the camera too.
      layer("houses", [massingLots, massingIds, massingElevations, urbanLod], () => {
        const elevation = new Map(massingLots.map((lot, i) => [lot.polygon, massingElevations[i]])),
          foundation = (ring: Point[]) => elevation.get(ring) ?? 0,
          lots = massingLots as unknown as BuildingLot[],
          regional = createTownRegionalHouseLod(lots, harborCache, foundation, quality, undefined, urbanLod),
          details = createTownBuildingDetails(lots, foundation, urbanLod),
          meshes = regional.massing,
          holder = new THREE.Group(),
          ids = [...massingIds];
        holder.add(regional.group, details.group);
        holder.position.set(-data.center[0], 0, data.center[1]);
        for (const mesh of meshes.pickables) {
          const index = mesh.geometry.getAttribute("buildingIndex"),
            houseIds: string[] = [],
            firstTriangles: number[] = [];
          for (let v = 0, last = -1; v < index.count; v += 3) {
            const lot = index.getX(v);
            if (lot === last) continue;
            last = lot;
            houseIds.push(ids[lot]);
            firstTriangles.push(v / 3);
          }
          mesh.userData = {
            ...mesh.userData,
            kind: "building",
            buildingKind: "housing",
            representation: "fabric-massing",
            fabricHouses: { ids: houseIds, firstTriangles, triangles: index.count / 3 }
          };
          mesh.geometry.computeBoundingSphere();
        }
        return {
          object: holder,
          dispose: () => {
            details.dispose();
            regional.dispose();
          },
          cameraUpdate: (camera, height) => {
            const changed = regional.update(camera, height);
            details.update(camera, height, regional.replaced);
            return { changed, pending: regional.stats.pending, detailedHouses: regional.stats.buildings };
          },
          resolve: hit => {
            const site = regional.resolve(hit);
            return site ? ids[site.lotIndex] : undefined;
          }
        };
      });
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
    // Layers of the previous drawing this one no longer has are released.
    layers.end();
    return {
      group,
      warnings,
      dispose,
      /** Camera-driven detail (house LOD, façade details); true when the view should redraw, `pending` asks for
       * another frame while detailed houses are still being built. */
      updateCamera(camera: THREE.PerspectiveCamera, viewportHeight: number) {
        let changed = false,
          pending = false,
          detailedHouses = 0;
        for (const update of cameraUpdates) {
          const r = update(camera, viewportHeight);
          changed ||= r.changed;
          pending ||= r.pending;
          detailedHouses += r.detailedHouses ?? 0;
        }
        return { changed, pending, detailedHouses };
      },
      /** Switch the forest's detail in place; true when it changed (the view then redraws). */
      setForestQuality(next: Forest3dQuality) {
        return setForestQuality?.(next) ?? false;
      },
      /** The house id of a hit on a detailed BV house. */
      pickHouse(hit: THREE.Intersection) {
        for (const resolve of houseResolvers) {
          const id = resolve(hit);
          if (id) return id;
        }
      }
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function sameFootprint(a: { halfX: number; halfZ: number } | null, b: { halfX: number; halfZ: number } | null) {
  return !!a && !!b && Math.abs(a.halfX - b.halfX) < 0.005 && Math.abs(a.halfZ - b.halfZ) < 0.005;
}
