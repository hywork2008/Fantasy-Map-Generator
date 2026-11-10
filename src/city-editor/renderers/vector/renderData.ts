import { buildingAppearanceProfile, normalizeBuildingAppearanceContext } from "../../../buildings/appearance/resolver";
import type { BuildingAppearance, BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import { TREE_SPECIES, type TreeSpecies, treeLodProfile } from "../../../buildings/landscape/trees";
import { packedMarketPitch } from "../../../buildings/medieval/marketPresentation";
import type { FacilityPlans } from "../../../city3d/three/facilityMeshes";
import { lotMassing, massingContext } from "../../generators/buildingMassing";
import { treeSpeciesForClimate } from "../../generators/landscapeTreeSpecies";
import { type ContourLine, fieldContours } from "../../generators/terrainField/contours";
import type { TownWaterKind } from "../../generators/townWater";
import { curveSource } from "../../generators/vector/editing/paths";
import { cellHouseCount, cellHouseRing, fabricHouseId, unpackLine } from "../../generators/vector/fabric/pack";
import { vectorLandscapeClimate } from "../../generators/vector/generation/forest";
import { vectorHousingCulture } from "../../generators/vector/generation/housingCulture";
import { vectorHouseHeightKey, vectorHousingHeights } from "../../generators/vector/generation/housingHeights";
import { bridgeGeometry, gateOpening, junctionSurface } from "../../generators/vector/geometry/network";
import { regionBoolean } from "../../generators/vector/geometry/regions";
import { pathSurface } from "../../generators/vector/geometry/surfaces";
import { vectorWaterSurfaces } from "../../generators/vector/geometry/water";
import { vectorTerrain } from "../../generators/vector/terrain";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import type { BuildingMassing } from "../../types/contracts/buildingMassing";
import type { HarborCargoPile, HarborCrane } from "../../types/contracts/harborFabric";
import type { CemeteryPlan } from "../../types/document";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument, VectorPath, VectorPlacement } from "../../types/vector/document";
import type { VectorFabricLines } from "../../types/vector/fabric";
import type { VectorPolygon } from "../../types/vector/generation";
import type { VectorHarborShip } from "../../types/vector/harbor";
import type { VectorLandscapeTree } from "../../types/vector/landscape";
import type { Monastery } from "../../types/vector/monastery";
import type { VectorStage } from "../../types/vector/urban";
import { collectOpenSpacePlan, type OpenSpacePlan } from "../openSpaceSites";
import { automaticHousingProfile } from "../standaloneHousingAppearance";
import { vectorDefenseSurfaces } from "./defense";
import { vectorFerrySurfaces } from "./ferry";
import { vectorGuildSurfaces } from "./guild";
import { vectorHarborSurfaces } from "./harbor";
import { vectorHouseAppearance } from "./houseAppearance";
import { vectorInnSurfaces } from "./inn";
import { vectorOpenLandmarkSurfaces } from "./landmark";
import { vectorLandscapeSurfaces } from "./landscape";
import { vectorMonasterySurfaces } from "./monastery";
import { vectorRoadRibbons } from "./roadRibbons";
import { vectorStructures } from "./structureMassing";
export type VectorSurfaceKind =
  | "region"
  | "block"
  | "junction"
  | "road"
  | "river"
  | "wall"
  | "bridge"
  | "access"
  | "building"
  | "feature";
export interface VectorRenderSurface {
  id: string;
  kind: VectorSurfaceKind;
  polygons: VectorPolygon[];
  color: string;
  heightMeters: number;
  elevationMeters: number;
  placement?: VectorPlacement;
  harborShip?: VectorHarborShip;
  harborCrane?: HarborCrane;
  harborPile?: HarborCargoPile;
  provisional?: boolean;
  buildingKind?: string;
  heightAt?: (point: Point) => number;
  featureKind?: string;
  pieceRole?: string;
  elevations?: { bottom: number[]; top: number[] }[];
  /** Generated houses of one street block, aligned with `polygons` (a clipped house may repeat its id). */
  houses?: {
    ids: string[];
    heightsMeters: number[];
    elevationsMeters: number[];
    /** The mesh editor's walls, roof and colour per house (P3a), parallel to `ids`. */
    massing?: BuildingMassing[];
    /** Regional roof and wall colours per house (P3b), parallel to `massing`. */
    appearance?: (BuildingAppearance | undefined)[];
  };
}
/** Storey height of generated houses. */
export const FABRIC_STOREY_METERS = 3.2;
export interface VectorRenderData {
  revision: number;
  stage: VectorStage;
  center: Point;
  extentMeters: number;
  surfaces: VectorRenderSurface[];
  paths: VectorPath[];
  nodes: { id: string; position: Point }[];
  warnings: string[];
  contours?: ContourLine[];
  groundCutouts?: VectorPolygon[];
  landscapeTrees?: (VectorLandscapeTree & { elevationMeters: number })[];
  /** Wells and public basins drawn as the mesh editor's BV waterworks in 3D. */
  wells?: { id: string; point: Point; kind: "well" | "publicBasin"; elevationMeters: number }[];
  terrain?: { points: [number, number, number][]; indices: number[] };
  /** Walls (with towers and gates) and bridges as the mesh editor's structure massing, for 3D. Only owners
   * drawn in this stage; the 2D view keeps the surfaces. */
  structures?: ReturnType<typeof vectorStructures>;
  /** The culture profile of the mesh editor's BV town towers and gates (P2d-2). */
  wallProfile?: BuildingAppearanceProfile;
  /** Facility plans and religious houses drawn as the mesh editor's BV facilities in 3D (P2d-4). */
  facilities?: FacilityPlans;
  monasteries?: Monastery[];
  /** Cemeteries' graves, markers, chapels, walls and trees as the mesh editor's open-space models in 3D (P2d-5). */
  openSpaces?: OpenSpacePlan;
  /** Woodland drawn as the mesh editor's forest in 3D (P2d-6): its regions, density, seed and climate. */
  forest?: {
    regions: VectorPolygon[];
    density: "sparse" | "standard" | "dense";
    seed: string;
    climate: ReturnType<typeof vectorLandscapeClimate>;
  };
  /** The FMG burg's site descriptor, for the trees' seasonal look (P2d-8); absent for a standalone town. */
  seasonDescriptor?: import("../../types/contracts/burgSiteDescriptor").BurgSiteDescriptor;
  /** Harbour piers as the mesh editor's timber piers in 3D (P2d-3). */
  piers?: { id: string; deck: Point[]; depth: number }[];
  /** Roads of this stage as the mesh editor's wearing-course ribbons, for 3D. */
  roads?: ReturnType<typeof vectorRoadRibbons>;
  /** Flat sites only: the drawn water by the mesh editor's water kind, for its water and bank meshes in 3D.
   * The `river` surfaces stay as pick targets. Relief and harbours keep their own surfaces. */
  water?: { id: string; kind: TownWaterKind; polygons: VectorPolygon[] }[];
}
/** Adopted geometry only. The same clipped surfaces feed screen SVG, exports and 3D. */
export function vectorRenderData(
  doc: VectorCityDocument,
  stage: VectorStage = doc.urban ? "housing" : "regions"
): VectorRenderData {
  assertVectorDocument(doc);
  const urban = doc.urban?.inputRevision === doc.revision ? doc.urban : undefined,
    checkpoint = urban?.checkpoints.find(c => c.id === stage),
    hidden = new Set(
      checkpoint
        ? Object.keys(doc.paths).filter(id => !checkpoint.pathIds.includes(id))
        : stage === "inputs"
          ? Object.keys(doc.generation?.pathRevisions ?? {})
          : []
    );
  let paths = Object.values(doc.paths).filter(p => !hidden.has(p.id));
  let extent = doc.frame.extentMeters,
    center: Point = doc.site?.center ?? [0, 0];
  if (
    !doc.site &&
    !doc.environment?.terrain &&
    (Object.keys(doc.paths).length ||
      Object.keys(doc.regions).length ||
      Object.keys(doc.environment?.features ?? {}).length)
  ) {
    let minX = -extent / 2,
      maxX = extent / 2,
      minY = -extent / 2,
      maxY = extent / 2;
    for (const path of Object.values(doc.paths))
      for (const p of pathSurface(path).outer) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
    for (const ring of [
      ...Object.values(doc.regions).map(r => r.outer),
      ...Object.values(doc.environment?.features ?? {}).flatMap(f => [
        f.boundary.outer,
        ...f.pieces.map(p => p.polygon.outer)
      ])
    ])
      for (const p of ring) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
    center = [(minX + maxX) / 2, (minY + maxY) / 2];
    extent = Math.max(maxX - minX, maxY - minY) * 1.05;
  }
  const frame: VectorPolygon = {
      outer: [
        [center[0] - extent / 2, center[1] - extent / 2],
        [center[0] + extent / 2, center[1] - extent / 2],
        [center[0] + extent / 2, center[1] + extent / 2],
        [center[0] - extent / 2, center[1] + extent / 2]
      ],
      holes: []
    },
    surfaces: VectorRenderSurface[] = [],
    warnings: string[] = [];
  const terrain = vectorTerrain(doc);
  const hiddenFeatures = new Set(doc.environment?.hidden ?? []);
  const hiddenPaths = new Set(
    Object.values(doc.environment?.features ?? {})
      .filter(f => hiddenFeatures.has(f.id))
      .flatMap(f => f.pathIds)
  );
  for (const id of hiddenPaths) hidden.add(id);
  paths = paths.filter(p => !hiddenPaths.has(p.id));
  const add = (item: VectorRenderSurface) => {
    if (hiddenPaths.has(item.id)) return;
    if (terrain.hasRelief) {
      if (item.kind === "building") item.elevationMeters += terrain.foundationAt(item.id, item.polygons[0].outer);
      else if (item.kind !== "bridge")
        item.heightAt =
          item.kind === "river"
            ? p => terrain.waterAt(p) ?? terrain.heightAt(p)
            : ["road", "junction", "access"].includes(item.kind)
              ? terrain.surfaceAt
              : terrain.heightAt;
    }
    const clipped = regionBoolean(item.polygons, [frame], "intersection");
    if (clipped.length) surfaces.push({ ...item, polygons: clipped });
  };
  const withinFrame = (ring: Point[]) =>
    ring.every(
      p =>
        p[0] > center[0] - extent / 2 &&
        p[0] < center[0] + extent / 2 &&
        p[1] > center[1] - extent / 2 &&
        p[1] < center[1] + extent / 2
    );
  for (const r of Object.values(doc.regions))
    add({
      id: r.id,
      kind: "region",
      polygons: doc.environment?.harbor
        ? regionBoolean([r], doc.environment.harbor.navigation.water, "difference")
        : [r],
      color: {
        forest: "#72976a",
        farm: "#b7ae71",
        park: "#a1bb87",
        cemetery: "#c1beb1",
        district: "#bfc8ab",
        reservation: "#bfc8ab"
      }[r.kind],
      heightMeters: 0,
      elevationMeters: 0.005
    });
  const early = urban && ["inputs", "skeleton", "regions"].includes(stage),
    nodes = (
      stage === "inputs" && doc.generation?.inputRevision === doc.revision
        ? (urban?.baseGeneration ?? doc.generation).inputNodes
        : Object.values(early ? urban.baseConnections.nodes : doc.connections.nodes)
    )
      .map(n => ({ ...n, anchors: n.anchors.filter(a => !hidden.has(a.pathId)) }))
      .filter(n => n.anchors.length),
    sceneDoc = { ...doc, connections: { ...doc.connections, nodes: Object.fromEntries(nodes.map(n => [n.id, n])) } };
  for (const n of nodes) {
    const j = junctionSurface(sceneDoc, n.id);
    if (j)
      add({ id: n.id, kind: "junction", polygons: [j], color: "#c7ae84", heightMeters: 0.03, elevationMeters: 0.02 });
  }
  if (
    ["regions", "blocksAndLanes", "facilities", "housing"].includes(stage) &&
    doc.generation?.inputRevision === doc.revision
  )
    for (const b of urban && stage === "regions" ? urban.baseGeneration.blocks : doc.generation.blocks)
      add({
        id: b.id,
        kind: "block",
        polygons: [b],
        color:
          urban && stage !== "regions"
            ? { commerce: "#ddd0a6", craft: "#d5c2ab", hazard: "#c9b6b0", river: "#b9cec7", residential: "#d5d1a9" }[
                urban.districts.find(d => d.id === b.id)?.use ?? "residential"
              ]
            : b.reachable
              ? "#d5d1a9"
              : "#d9c9b9",
        heightMeters: 0,
        elevationMeters: 0.01
      });
  for (const p of paths.filter(p => p.role === "road"))
    add({
      id: p.id,
      kind: "road",
      polygons: [pathSurface(p)],
      color: "#c7ae84",
      heightMeters: 0.04,
      elevationMeters: 0.02
    });
  for (const w of doc.environment?.harbor ? [] : (doc.site?.water ?? []))
    add({ id: w.id, kind: "river", polygons: w.polygons, color: "#71abc4", heightMeters: 0, elevationMeters: 0.08 });
  const defenseWalls = new Set(Object.values(doc.environment?.defenses ?? {}).flatMap(p => p.circuit.wallPathIds));
  for (const p of paths.filter(p => p.role !== "road" && !defenseWalls.has(p.id))) {
    if (p.role === "river" && doc.site?.water.some(w => w.riverPathId === p.id)) continue;
    const polygons =
      p.role === "wall"
        ? regionBoolean(
            [pathSurface(p)],
            Object.values(doc.connections.gates)
              .filter(g => g.wallPathId === p.id)
              .map(g => ({ outer: gateOpening(doc, g), holes: [] })),
            "difference"
          )
        : [pathSurface(p)];
    add({
      id: p.id,
      kind: p.role,
      polygons,
      color: p.role === "wall" ? "#655b53" : "#71abc4",
      heightMeters:
        p.role === "wall"
          ? (Object.values(doc.environment?.features ?? {}).find(f => f.pathIds.includes(p.id))?.settings
              .heightMeters ?? 10) * 0.6
          : 0,
      elevationMeters: p.role === "wall" ? 0.1 : 0.08
    });
  }
  const waters = vectorWaterSurfaces(doc);
  for (const b of Object.values(doc.connections.bridges)) {
    if (hidden.has(b.roadPathId)) continue;
    add({
      id: b.id,
      kind: "bridge",
      polygons: [{ outer: bridgeGeometry(doc, b, waters).deck, holes: [] }],
      color: b.structure === "stone" ? "#a69d8c" : "#a98050",
      heightMeters: 0.3,
      elevationMeters: terrain.hasRelief ? terrain.bridgeElevation(b.id) : 0.16
    });
  }
  const hiddenPlacements = new Set(
    Object.values(doc.environment?.features ?? {})
      .filter(f => hiddenFeatures.has(f.id))
      .flatMap(f => f.placementIds)
  );
  for (const p of Object.values(doc.placements)) {
    if (hiddenPlacements.has(p.id) || packedMarketPitch(p.modelId, p.appearance?.activity)) continue;
    if (checkpoint && !checkpoint.placementIds.includes(p.id)) continue;
    for (const e of p.building?.entrances ?? []) {
      const path: VectorPath = {
        id: p.id,
        revision: 0,
        role: "road",
        origin: "automatic",
        editPolicy: "editable",
        source: curveSource(e.connector, "polyline", false),
        width: { leftMeters: e.widthMeters / 2, rightMeters: e.widthMeters / 2, stations: [] }
      };
      add({
        id: p.id,
        kind: "access",
        polygons: [pathSurface(path)],
        color: "#c7ae84",
        heightMeters: 0.02,
        elevationMeters: 0.025
      });
    }
    const b = p.building,
      display = p.display;
    add({
      id: p.id,
      kind: "building",
      polygons: b?.footprint ?? display?.footprint ?? [p.site],
      color: b?.kind === "facility" || display?.kind === "facility" ? "#ac7858" : "#99816b",
      heightMeters: b?.heightMeters ?? display?.heightMeters ?? (b?.storeys ? b.storeys * 3.2 : 6),
      elevationMeters: 0.1,
      placement: p,
      provisional: b?.provenance === "provisional" || display?.provenance === "massing",
      buildingKind: b?.kind ?? display?.kind ?? "manual"
    });
  }
  // Generated districts: streets and lanes from the lane stage, houses with the housing stage.
  if (doc.fabric && (!urban || ["blocksAndLanes", "facilities", "housing"].includes(stage))) {
    // Streets of a district and lanes of a street block are drawn as one surface: their union, because lines
    // overlap at every junction. A union over the clipping budget falls back to one surface per line.
    const surface = (id: string, points: Point[], widthMeters: number): VectorPolygon | undefined => {
      try {
        const path: VectorPath = {
          id,
          revision: 0,
          role: "road",
          origin: "automatic",
          editPolicy: "editable",
          source: curveSource(points, "polyline", false),
          width: { leftMeters: widthMeters / 2, rightMeters: widthMeters / 2, stations: [] }
        };
        return pathSurface(path);
      } catch {
        warnings.push(`fabric-line:${id}`);
        return undefined;
      }
    };
    const road = (id: string, polygons: VectorPolygon[]) =>
      add({ id, kind: "road", polygons, color: "#c7ae84", heightMeters: 0.04, elevationMeters: 0.02 });
    const lines = (
      owner: string,
      kind: "s" | "l",
      packed: VectorFabricLines,
      origin: Point,
      detached: { index: number }[] = []
    ) => {
      const parts: [string, VectorPolygon][] = [];
      for (let i = 0; i < packed.widths.length; i++) {
        // A line moved to a `VectorPath` is drawn as that path.
        if (detached.some(l => l.index === i)) continue;
        const id = `${owner}~${kind}${i}`,
          polygon = surface(id, unpackLine(packed, i, origin), packed.widths[i]);
        if (polygon) parts.push([id, polygon]);
      }
      if (!parts.length) return;
      try {
        road(
          `${owner}~${kind}`,
          regionBoolean(
            parts.map(p => p[1]),
            [],
            "union",
            false
          )
        );
      } catch {
        for (const [id, polygon] of parts) road(id, [polygon]);
      }
    };
    // The mesh editor's massing rules read the period, climate and culture of the FMG burg.
    const descriptor = doc.site?.descriptor,
      massing = massingContext({
        period: doc.context.historicalPeriod,
        biome: descriptor?.biome,
        civilization: descriptor?.civilization,
        seed: doc.recipe.seed
      }),
      heights = vectorHousingHeights(doc),
      appearance = vectorHouseAppearance(doc);
    for (const district of Object.values(doc.fabric.districts))
      lines(district.id, "s", district.streets, district.origin, district.detachedLines);
    for (const cell of Object.values(doc.fabric.cells)) {
      lines(cell.id, "l", cell.lanes, cell.origin, cell.detachedLines);
      if (urban && stage !== "housing") continue;
      // One surface per street block: 2D draws it as one path, 3D batches it by storeys.
      const detached = new Set(cell.detached),
        polygons: VectorPolygon[] = [],
        houses: NonNullable<VectorRenderSurface["houses"]> = {
          ids: [],
          heightsMeters: [],
          elevationsMeters: [],
          massing: [],
          appearance: []
        },
        plain: { id: string; massing: BuildingMassing }[] = [];
      for (let i = 0; i < cellHouseCount(cell); i++) {
        if (detached.has(i)) continue;
        const id = fabricHouseId(cell.id, i),
          ring = cellHouseRing(cell, i),
          parts = withinFrame(ring)
            ? [{ outer: ring, holes: [] }]
            : regionBoolean([{ outer: ring, holes: [] }], [frame], "intersection"),
          elevation = 0.1 + (terrain.hasRelief ? terrain.foundationAt(id, ring) : 0);
        for (const part of parts) {
          polygons.push(part);
          houses.ids.push(id);
          houses.heightsMeters.push(cell.houses.storeys[i] * FABRIC_STOREY_METERS);
          houses.elevationsMeters.push(elevation);
          const storeys = cell.houses.storeys[i];
          plain.push({
            id,
            massing: lotMassing(
              massing,
              { polygon: part.outer, role: "main" },
              storeys,
              heights.floors(vectorHouseHeightKey(cell.id, cell.houses.draws[i]), storeys),
              undefined,
              id
            )
          });
        }
      }
      for (const styled of appearance(cell.id, !cell.inside, plain)) {
        houses.massing!.push(styled.massing);
        houses.appearance!.push(styled.appearance);
      }
      if (polygons.length)
        surfaces.push({
          id: cell.id,
          kind: "building",
          polygons,
          color: "#99816b",
          heightMeters: Math.max(...houses.heightsMeters),
          elevationMeters: Math.min(...houses.elevationsMeters),
          buildingKind: "housing",
          houses
        });
    }
  }
  for (const feature of Object.values(doc.environment?.features ?? {})) {
    if (hiddenFeatures.has(feature.id)) continue;
    const color = {
      castle: "#bbb4a1",
      bastion: "#b3b398",
      harbor: "#b9ad90",
      market: "#d7c69b",
      temple: "#d4cbb8",
      cemetery: "#c1beb1",
      park: "#a1bb87",
      farm: "#b7ae71",
      forest: "#72976a"
    }[feature.kind];
    add({
      id: feature.id,
      kind: "feature",
      polygons: [feature.boundary],
      color,
      heightMeters: 0,
      elevationMeters: 0.015,
      featureKind: feature.kind,
      pieceRole: "ground"
    });
    for (const piece of feature.pieces) {
      if (feature.kind === "market" && feature.settings.activity === "closed" && piece.role === "stall") continue;
      const item: VectorRenderSurface = {
        id: piece.id,
        kind: "feature",
        polygons: [piece.polygon],
        color: piece.color,
        heightMeters: piece.heightMeters,
        elevationMeters: 0.06,
        featureKind: feature.kind,
        pieceRole: piece.role
      };
      if (terrain.hasRelief && piece.role !== "ground") {
        item.elevationMeters +=
          piece.role === "ship"
            ? (terrain.waterAt(piece.polygon.outer[0]) ?? terrain.heightAt(piece.polygon.outer[0]))
            : terrain.foundationAt(piece.id, piece.polygon.outer);
        // Structures stand level; their base is shared with the saved plot or sampled foundation.
        const clipped = regionBoolean(item.polygons, [frame], "intersection");
        if (clipped.length) surfaces.push({ ...item, polygons: clipped });
      } else add(item);
    }
  }
  // Ground reservations precede roads and walls in the plan view; details remain above them.
  const grounds = surfaces.filter(s => s.kind === "feature" && s.pieceRole === "ground" && s.heightMeters === 0);
  for (const ground of grounds) {
    surfaces.splice(surfaces.indexOf(ground), 1);
  }
  surfaces.unshift(...grounds);
  for (const plan of Object.values(doc.environment?.defenses ?? {}))
    surfaces.push(...vectorDefenseSurfaces(plan, frame));
  if (doc.environment?.harbor) surfaces.push(...vectorHarborSurfaces(doc.environment.harbor));
  for (const ferry of Object.values(doc.environment?.ferries ?? {})) surfaces.push(...vectorFerrySurfaces(ferry));
  for (const house of Object.values(doc.environment?.monasteries ?? {}))
    surfaces.push(...vectorMonasterySurfaces(house));
  if (doc.environment?.guilds) surfaces.push(...vectorGuildSurfaces(doc.environment.guilds));
  if (doc.environment?.inns) surfaces.push(...vectorInnSurfaces(doc.environment.inns));
  if (doc.environment?.landmarks) surfaces.push(...vectorOpenLandmarkSurfaces(doc.environment.landmarks));
  if (doc.environment?.forest)
    surfaces.push({
      id: "environment:forest",
      kind: "feature",
      featureKind: "forest",
      pieceRole: `forest-${doc.environment.forest.density}`,
      polygons: doc.environment.forest.regions,
      color: "#5f7f4e",
      elevationMeters: 0.01,
      heightMeters: 0
    });
  // Water points (P7d), in the mesh editor's colours (aerialLandmarksSvg): rim, water, access path.
  for (const w of doc.urban?.wells ?? []) {
    const disc = (r: number) => ({
      outer: Array.from(
        { length: 12 },
        (_, k): Point => [
          w.center[0] + Math.cos((k / 12) * Math.PI * 2) * r,
          w.center[1] + Math.sin((k / 12) * Math.PI * 2) * r
        ]
      ),
      holes: []
    });
    const [a, b] = [w.access[0], w.access.at(-1)!],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      n: Point = [(-(b[1] - a[1]) / l) * 0.5, ((b[0] - a[0]) / l) * 0.5];
    surfaces.push(
      {
        id: `urban:water:${w.id}:access`,
        kind: "feature",
        featureKind: "well",
        pieceRole: "access",
        polygons: [
          {
            outer: [
              [a[0] + n[0], a[1] + n[1]],
              [b[0] + n[0], b[1] + n[1]],
              [b[0] - n[0], b[1] - n[1]],
              [a[0] - n[0], a[1] - n[1]]
            ],
            holes: []
          }
        ],
        color: "#c9b48f",
        elevationMeters: 0.03,
        heightMeters: 0
      },
      {
        id: `urban:water:${w.id}`,
        kind: "feature",
        featureKind: "well",
        pieceRole: w.kind === "well" || w.kind === "publicBasin" ? "bv-well" : w.kind,
        polygons: [disc(w.radius)],
        color: w.kind === "pond" ? "#88a5a0" : "#d0c8b7",
        elevationMeters: 0.05,
        heightMeters: 0
      }
    );
    if (w.kind !== "pond")
      surfaces.push({
        id: `urban:water:${w.id}:water`,
        kind: "feature",
        featureKind: "well",
        pieceRole: w.kind === "well" || w.kind === "publicBasin" ? "bv-well" : "water",
        polygons: [disc(w.radius * 0.65)],
        color: "#719ca8",
        elevationMeters: 0.06,
        heightMeters: 0
      });
  }
  // Park wards (P7c): the mesh editor's lawn, walkway and canopy colours (openSpaceSites).
  for (const park of doc.urban?.parks ?? []) {
    surfaces.push({
      id: `urban:park:${park.id}`,
      kind: "feature",
      featureKind: "park",
      pieceRole: "lawn",
      polygons: park.lawns.map(outer => ({ outer, holes: [] })),
      color: "#7ea867",
      elevationMeters: 0.025,
      heightMeters: 0
    });
    const walk = park.paths.flatMap(line =>
      line.slice(1).flatMap((b, i) => {
        const a = line[i],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 1e-6) return [];
        const n: Point = [(-(b[1] - a[1]) / l) * 0.9, ((b[0] - a[0]) / l) * 0.9];
        return [
          {
            outer: [
              [a[0] + n[0], a[1] + n[1]],
              [b[0] + n[0], b[1] + n[1]],
              [b[0] - n[0], b[1] - n[1]],
              [a[0] - n[0], a[1] - n[1]]
            ] as Point[],
            holes: []
          }
        ];
      })
    );
    if (walk.length)
      surfaces.push({
        id: `urban:park:${park.id}:walk`,
        kind: "feature",
        featureKind: "park",
        pieceRole: "walk",
        polygons: walk,
        color: "#d8d1bf",
        elevationMeters: 0.045,
        heightMeters: 0
      });
    if (park.trees.length)
      surfaces.push({
        id: `urban:park:${park.id}:trees`,
        kind: "feature",
        featureKind: "park",
        // 3D draws the species models instead (P2d-1); the 2D plan keeps the crowns.
        pieceRole: "landscape-tree",
        polygons: park.trees.map(t => ({
          outer: Array.from(
            { length: 10 },
            (_, k): Point => [
              t.center[0] + Math.cos((k / 10) * Math.PI * 2) * t.radius,
              t.center[1] + Math.sin((k / 10) * Math.PI * 2) * t.radius
            ]
          ),
          holes: []
        })),
        color: "#4f7a45",
        elevationMeters: 0.07,
        heightMeters: 0
      });
  }
  if (doc.environment?.landscape)
    for (const surface of vectorLandscapeSurfaces(doc.environment.landscape)) add(surface);
  let terrainMesh: VectorRenderData["terrain"], contours: ContourLine[] | undefined;
  if (terrain.hasRelief) {
    const count = 64,
      points: [number, number, number][] = [],
      indices: number[] = [];
    for (let y = 0; y <= count; y++)
      for (let x = 0; x <= count; x++) {
        const p: Point = [center[0] - extent / 2 + (x * extent) / count, center[1] - extent / 2 + (y * extent) / count];
        points.push([p[0], terrain.heightAt(p) - 0.01, p[1]]);
      }
    for (let y = 0; y < count; y++)
      for (let x = 0; x < count; x++) {
        const i = y * (count + 1) + x;
        indices.push(i, i + 1, i + count + 1, i + 1, i + count + 2, i + count + 1);
      }
    terrainMesh = { points, indices };
    const elevations = new Float32Array(points.map(p => p[1] + 0.01));
    let low = Infinity,
      high = -Infinity;
    for (const value of elevations) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    contours = fieldContours(
      {
        origin: [center[0] - extent / 2, center[1] - extent / 2],
        sampleMeters: extent / count,
        columns: count + 1,
        rows: count + 1,
        elevationsMeters: elevations
      },
      Math.max(5, (high - low) / 50)
    );
  }
  if (doc.urban && !urban) warnings.push("stale-stages");
  const drawn = new Set(surfaces.filter(s => s.kind === "wall" || s.kind === "bridge").map(s => s.id)),
    // Fabric lines are drawn per record (`<record>~l`), or per line (`<record>~l3`) when the union fails.
    roadOwners = new Set(surfaces.filter(s => s.kind === "road").map(s => s.id.replace(/(~[sl])\d+$/, "$1")));
  const siteWater = new Map((doc.site?.water ?? []).map(w => [w.id, w]));
  const water =
    terrain.hasRelief || doc.environment?.harbor
      ? undefined
      : surfaces
          .filter(s => s.kind === "river")
          .map(s => {
            const w = siteWater.get(s.id),
              kind: TownWaterKind = !w || w.riverPathId ? "river" : w.id.startsWith("fmg-coast:") ? "ocean" : "lake";
            return { id: s.id, kind, polygons: s.polygons };
          });
  return {
    water,
    structures: vectorStructures(doc).filter(s => drawn.has(s.owner)),
    wallProfile: vectorWallProfile(doc),
    facilities: {
      aerial: {
        windmills: doc.environment?.landmarks?.windmills ?? [],
        gallows: doc.environment?.landmarks?.gallows ?? [],
        gateInns: doc.environment?.inns ?? [],
        guildHalls: doc.environment?.guilds?.halls ?? [],
        guildYards: doc.environment?.guilds?.yards ?? []
      },
      arid:
        normalizeBuildingAppearanceContext({
          period: doc.context.historicalPeriod,
          tradition: doc.site?.descriptor?.civilization?.tradition,
          temperatureC: doc.site?.descriptor?.climate?.temperatureC,
          biome:
            doc.site?.descriptor?.biome ??
            (doc.site?.descriptor?.climate?.biomeKey ? { key: doc.site.descriptor.climate.biomeKey } : undefined)
        }).arid === true
    },
    monasteries: Object.values(doc.environment?.monasteries ?? {}),
    openSpaces: vectorOpenSpaces(doc),
    seasonDescriptor: doc.site?.descriptor,
    ...(doc.environment?.forest
      ? {
          forest: {
            regions: doc.environment.forest.regions,
            density: doc.environment.forest.density,
            seed: doc.recipe.seed,
            climate: vectorLandscapeClimate(doc)
          }
        }
      : {}),
    piers: (doc.environment?.harbor?.piers ?? []).flatMap(p =>
      p.polygon.outer.length === 4 ? [{ id: p.id, deck: p.polygon.outer, depth: p.depthMeters }] : []
    ),
    roads: vectorRoadRibbons(doc, id => roadOwners.has(id)),
    revision: doc.revision,
    stage,
    center,
    extentMeters: extent,
    surfaces,
    paths,
    nodes: nodes.map(n => ({ id: n.id, position: n.position })),
    warnings,
    contours,
    groundCutouts: [
      ...Object.values(doc.environment?.defenses ?? {}).flatMap(p => p.ditches.flatMap(d => d.region)),
      ...(doc.environment?.harbor?.navigation.water ?? [])
    ],
    landscapeTrees: (doc.environment?.landscape?.trees ?? []).map(tree => ({
      ...tree,
      elevationMeters: terrain.heightAt(tree.point)
    })),
    // Wells and the plaza basin as the mesh editor's BV waterworks (P2d-1); cisterns and ponds stay surfaces.
    wells: (doc.urban?.wells ?? []).flatMap(w =>
      w.kind === "well" || w.kind === "publicBasin"
        ? [{ id: `urban:water:${w.id}`, point: w.center, kind: w.kind, elevationMeters: terrain.heightAt(w.center) }]
        : []
    ),
    terrain: terrainMesh
  };
}

/**
 * Park trees (P2d-1, drawn with the open spaces since P2d-8): the mesh editor's park planting (`garden_parkland`) adapted to the town's
 * climate, at the canopy's saved centre and radius, the species' height and a turn from its position.
 */
function vectorParkTrees(doc: VectorCityDocument): VectorLandscapeTree[] {
  const parks = doc.urban?.parks ?? [];
  if (!parks.length) return [];
  const climate = { ...vectorLandscapeClimate(doc), seed: doc.recipe.seed };
  return parks.flatMap(park =>
    park.trees.flatMap((t, i): VectorLandscapeTree[] => {
      const species = treeSpeciesForClimate("garden_parkland", climate, t.center);
      if (!species) return [];
      return [
        {
          id: `urban:park:${park.id}:tree:${i}`,
          ownerId: `urban:park:${park.id}`,
          point: t.center,
          radiusMeters: t.radius,
          heightMeters: treeLodProfile(species)?.heightMeters ?? 10,
          angleRadians:
            (((t.center[0] * 12.9898 + t.center[1] * 78.233) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
          species
        }
      ];
    })
  );
}

/** The town's appearance profile as the mesh editor reads it for its towers and gates: the houses' automatic one. */
function vectorWallProfile(doc: VectorCityDocument): BuildingAppearanceProfile {
  const descriptor = doc.site?.descriptor,
    context = normalizeBuildingAppearanceContext({
      period: doc.context.historicalPeriod,
      tradition: descriptor?.civilization?.tradition,
      temperatureC: descriptor?.climate?.temperatureC,
      biome: descriptor?.biome ?? (descriptor?.climate?.biomeKey ? { key: descriptor.climate.biomeKey } : undefined)
    });
  return buildingAppearanceProfile({
    profile: vectorHousingCulture(doc) ?? automaticHousingProfile(context, !!descriptor, doc.recipe.seed),
    context,
    rural: false
  });
}

/**
 * The cemeteries as the mesh editor's open-space plan (P2d-5): graves and ledgers on its plots, chapels, cottages,
 * ossuaries and boundary walls, and churchyard trees adapted to the town's climate. Only the models: the ground
 * and paths stay the 2D surfaces.
 */
function vectorOpenSpaces(doc: VectorCityDocument): OpenSpacePlan | undefined {
  const cemeteries = doc.environment?.landscape?.cemeteries ?? [],
    // Park trees join the open spaces (P2d-8), as in the mesh editor, for its camera tree LOD and seasons.
    parkTrees = vectorParkTrees(doc).map(t => ({
      model: t.species,
      point: t.point,
      radius: t.radiusMeters,
      angle: t.angleRadians
    }));
  if (!cemeteries.length && !parkTrees.length) return undefined;
  const plan = collectOpenSpacePlan(
      [],
      cemeteries.map(c => ({ ...c, faceId: c.id }) as unknown as CemeteryPlan)
    ),
    climate = { ...vectorLandscapeClimate(doc), seed: doc.recipe.seed },
    trees = new Set<string>(TREE_SPECIES);
  const sites = plan.sites.flatMap(site => {
    if (!trees.has(site.model)) return [site];
    const model = treeSpeciesForClimate(site.model as TreeSpecies, climate, site.point);
    return model ? [{ ...site, model }] : [];
  });
  sites.push(...parkTrees);
  return sites.length ? { sites, surfaces: [] } : undefined;
}
