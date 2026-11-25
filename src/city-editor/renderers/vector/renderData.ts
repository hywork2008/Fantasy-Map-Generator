import { normalizeBuildingAppearanceContext } from "../../../buildings/appearance/resolver";
import type { BuildingAppearance, BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import { TREE_SPECIES, type TreeSpecies, treeLodProfile } from "../../../buildings/landscape/trees";
import { packedMarketPitch } from "../../../buildings/medieval/marketPresentation";
import type { VillageHouseProfile, VillageHouseSpec } from "../../../buildings/medieval/opusVillageHouses";
import type { FacilityPlans } from "../../../city3d/three/facilityMeshes";
import { growthRandom } from "../../../utils/urbanMorphology";
import { lotMassing, massingContext } from "../../generators/buildingMassing";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../generators/geom";
import { treeSpeciesForClimate } from "../../generators/landscapeTreeSpecies";
import { type ContourLine, fieldContours } from "../../generators/terrainField/contours";
import type { TownWaterKind } from "../../generators/townWater";
import { curveSource } from "../../generators/vector/editing/paths";
import {
  cellHouseCount,
  cellHouseRing,
  fabricHouseId,
  unpackLine,
  unpackPoints
} from "../../generators/vector/fabric/pack";
import { vectorLandscapeClimate } from "../../generators/vector/generation/forest";
import { vectorTownProfile } from "../../generators/vector/generation/housingCulture";
import { vectorHouseHeightKey, vectorHousingHeights } from "../../generators/vector/generation/housingHeights";
import { tanneryWaterWorks } from "../../generators/vector/generation/tanneryWaterWorks";
import { evaluateAnchor } from "../../generators/vector/geometry/curves";
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
import type { VectorFabricCell, VectorFabricLines } from "../../types/vector/fabric";
import type { VectorPolygon } from "../../types/vector/generation";
import type { VectorHarborShip } from "../../types/vector/harbor";
import type { VectorLandscapeTree } from "../../types/vector/landscape";
import type { VectorFurlongCourse } from "../../types/vector/landUse";
import type { Monastery } from "../../types/vector/monastery";
import type { VectorStage } from "../../types/vector/urban";
import { collectOpenSpacePlan, type OpenSpacePlan } from "../openSpaceSites";
import { vectorDefenseSurfaces } from "./defense";
import { vectorFerrySurfaces } from "./ferry";
import { vectorGuildSurfaces } from "./guild";
import { vectorHarborSurfaces } from "./harbor";
import { vectorHouseAppearance } from "./houseAppearance";
import { vectorInnSurfaces } from "./inn";
import { vectorOpenLandmarkSurfaces } from "./landmark";
import { vectorLandscapeSurfaces } from "./landscape";
import { vectorMonasterySurfaces } from "./monastery";
import { type ReliefCut, type ReliefPrism, reliefPlotWalls, reliefYardTerraces, STONE_COLOR } from "./reliefYards";
import { vectorRoadRibbons } from "./roadRibbons";
import { vectorStructures } from "./structureMassing";
import { vectorVillageProfile, villageHouse3d } from "./villageHouses";
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
  /** Drawn in 3D by `prisms` instead (levelled yards and their walls on relief); kept as the pick target. */
  hidden3d?: boolean;
  /** Generated houses of one street block, aligned with `polygons` (a clipped house may repeat its id). */
  houses?: {
    ids: string[];
    heightsMeters: number[];
    elevationsMeters: number[];
    /** The mesh editor's walls, roof and colour per house (P3a), parallel to `ids`. */
    massing?: BuildingMassing[];
    /** Regional roof and wall colours per house (P3b), parallel to `massing`. */
    appearance?: (BuildingAppearance | undefined)[];
    /** Each house's door on its wall and the point it reaches on its street (the fabric entrance), parallel to `ids`:
     * the 3D house turns its door there. */
    doors?: [Point, Point][];
    /** A roadside village's buildings, parallel to `ids` in place of `massing`: the Opus village model each one takes
     * (docs/plan/ce-meshless-roadside-burgage-village.md V4). */
    village?: VillageHouse3d[];
  };
}
/** A village building drawn by its Opus model, fitted to its footprint: its centre, and the turn that brings the
 * model's long side along the footprint's and its front to the road (a barn's to its yard). */
export interface VillageHouse3d {
  spec: VillageHouseSpec;
  center: Point;
  /** Radians, CE frame: the model's +x along the footprint's long side. */
  angle: number;
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
  terrain?: { points: [number, number, number][]; indices: number[]; colors?: number[] };
  /** Level ground on relief (natural relief §5.1, §5.7): building plinths, yard terraces and their walls. */
  prisms?: ReliefPrism[];
  /** The finished ground for the mesh editor's 3D parts on relief: absolute heights and level foundations. */
  ground?: { heightAt: (point: Point) => number; foundationAt: (ring: readonly Point[]) => number };
  /** Walls (with towers and gates) and bridges as the mesh editor's structure massing, for 3D. Only owners
   * drawn in this stage; the 2D view keeps the surfaces. */
  structures?: ReturnType<typeof vectorStructures>;
  /** The culture profile of the mesh editor's BV town towers and gates (P2d-2). */
  wallProfile?: BuildingAppearanceProfile;
  /** A roadside village's region for its Opus village models: its houses, and the 3D shape of its workshops' street
   * houses (docs/plan/ce-meshless-roadside-burgage-village.md V7). */
  villageProfile?: VillageHouseProfile;
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
/** A plot wall this close to a facility's site belongs to the facility's own enclosure, and is left out. */
const FACILITY_WALL_GAP_METERS = 0.3;
/** A rainwater cistern's stone curb is this tall above the ground. */
const CISTERN_CURB_METERS = 0.6;
/** Yard ground and boundary walls of a burgage street block are this tall; walls this wide. */
const PLOT_WALL_METERS = { height: 1.1, width: 0.25 };

/**
 * A burgage street block's plots as surfaces (plan §5.4, B4): the yards as one ground (every plot, the vacant ones as
 * gardens; the houses stand on it), the walls between plots and along their backs (never across the fronts, which
 * the houses close), and a binaire block's venelles. Binaire plots are the houses themselves: they have no yard.
 */
export function burgagePlotSurfaces(
  cell: VectorFabricCell,
  warnings: string[] = [],
  /** Facility sites: a facility's model brings its own yard and walls, so no plot wall runs through or along it. */
  facilitySites: Point[][] = []
): VectorRenderSurface[] {
  const plots = cell.plots;
  if (!plots) return [];
  const out: VectorRenderSurface[] = [];
  const venelles = plots.venelles;
  if (venelles?.widths.length) {
    let strips = venelles.widths.flatMap((w, i) => strip(unpackLine(venelles, i, cell.origin), w));
    try {
      strips = regionBoolean(strips, [], "union", false);
    } catch {
      warnings.push(`burgage-venelles:${cell.id}`);
    }
    out.push({
      id: `${cell.id}~venelles`,
      kind: "feature",
      featureKind: "burgage",
      pieceRole: "venelle",
      polygons: strips,
      color: "#6f6658",
      heightMeters: 0,
      elevationMeters: 0.03
    });
    return out;
  }
  // Only plots a house was built on are yards (a vacant plot, a park's lawn, outskirts the town did not need, are no
  // one's): no ground, walls or trees of their own.
  const all = plots.offsets.map((start, i) =>
      unpackPoints(plots.coords, cell.origin, start, plots.offsets[i + 1] ?? plots.coords.length / 2)
    ),
    built = builtPlots(cell, all),
    rings = all.filter((_, i) => built[i]);
  if (!rings.length) return out;
  const parts = rings.map(outer => ({ outer, holes: [] as Point[][] }));
  let yards: VectorPolygon[];
  try {
    yards = regionBoolean(parts, [], "union", false);
  } catch {
    warnings.push(`burgage-yards:${cell.id}`);
    yards = parts;
  }
  out.push({
    id: `${cell.id}~yards`,
    kind: "feature",
    featureKind: "burgage",
    pieceRole: "yard",
    polygons: yards,
    color: "#b5b27f",
    heightMeters: 0,
    elevationMeters: 0.02
  });
  // Each edge once: the sides plots share, their backs, and the corners' sides; never a plot's front.
  const fronts = all
    .map((_, i) => unpackPoints(plots.fronts, cell.origin, i * 2, i * 2 + 2))
    .filter((_, i) => built[i]);
  const key = (a: Point, b: Point) => {
    const p = `${Math.round(a[0] * 10)},${Math.round(a[1] * 10)}`,
      q = `${Math.round(b[0] * 10)},${Math.round(b[1] * 10)}`;
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };
  const seen = new Set<string>(),
    walls: VectorPolygon[] = [];
  const near = (r: Point[]) => r.some(p => Math.hypot(p[0] - cell.origin[0], p[1] - cell.origin[1]) < 400),
    // Each site with its box grown by the gap: a wall's midpoint outside it is neither in the site nor near its edge.
    sites = facilitySites.filter(near).map(site => {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of site) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      const g = FACILITY_WALL_GAP_METERS;
      return { site, minX: minX - g, minY: minY - g, maxX: maxX + g, maxY: maxY + g };
    });
  rings.forEach((ring, i) => {
    const [fa, fb] = fronts[i];
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length];
      const onFront = [a, b].every(p => nearestOnPolyline(p, [fa, fb]).dist < 0.02);
      const id = key(a, b),
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (onFront || seen.has(id) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) return;
      if (
        sites.some(
          ({ site, minX, minY, maxX, maxY }) =>
            mid[0] >= minX &&
            mid[0] <= maxX &&
            mid[1] >= minY &&
            mid[1] <= maxY &&
            (pointInPolygon(mid, site) ||
              site.some(
                (p, j) => nearestOnPolyline(mid, [p, site[(j + 1) % site.length]]).dist < FACILITY_WALL_GAP_METERS
              ))
        )
      )
        return;
      seen.add(id);
      // In whole centimetres, like the plots: walls meeting at a corner then share their points exactly.
      walls.push(
        ...strip([a, b], PLOT_WALL_METERS.width).map(w => ({
          outer: w.outer.map((p): Point => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]),
          holes: []
        }))
      );
    });
  });
  if (!walls.length) return out;
  let merged: VectorPolygon[];
  try {
    merged = regionBoolean(walls, [], "union", false);
    // A wall running into a facility's site stops at its edge: the facility's model brings its own enclosure.
    const all = rings.flat(),
      x0 = Math.min(...all.map(p => p[0])),
      y0 = Math.min(...all.map(p => p[1])),
      x1 = Math.max(...all.map(p => p[0])),
      y1 = Math.max(...all.map(p => p[1])),
      crossed = sites
        .map(s => s.site)
        .filter(
          site =>
            site.some(p => p[0] >= x0) &&
            site.some(p => p[0] <= x1) &&
            site.some(p => p[1] >= y0) &&
            site.some(p => p[1] <= y1)
        );
    if (crossed.length)
      merged = regionBoolean(
        merged,
        crossed.map(outer => ({ outer, holes: [] })),
        "difference",
        false
      );
  } catch {
    // Unjoined, every wall would be its own mesh in 3D; the block keeps its yards without them.
    warnings.push(`burgage-walls:${cell.id}`);
    return out;
  }
  out.push({
    id: `${cell.id}~walls`,
    kind: "feature",
    featureKind: "burgage",
    pieceRole: "plot-wall",
    polygons: merged,
    color: "#8f7d63",
    heightMeters: PLOT_WALL_METERS.height,
    elevationMeters: 0.02
  });
  return out;
}

/** A burgage street block's built plots and their fronts (no venelles). */
function burgagePlotRings(cell: VectorFabricCell): { rings: Point[][]; fronts: [Point, Point][] } {
  const plots = cell.plots;
  if (!plots) return { rings: [], fronts: [] };
  const all = plots.offsets.map((start, i) =>
      unpackPoints(plots.coords, cell.origin, start, plots.offsets[i + 1] ?? plots.coords.length / 2)
    ),
    built = builtPlots(cell, all);
  return {
    rings: all.filter((_, i) => built[i]),
    fronts: all
      .map((_, i) => unpackPoints(plots.fronts, cell.origin, i * 2, i * 2 + 2) as [Point, Point])
      .filter((_, i) => built[i])
  };
}

/** Which of a street block's plots a house stands on (its front house or a rear one). */
function builtPlots(cell: VectorFabricCell, rings: Point[][]): boolean[] {
  const detached = new Set(cell.detached),
    houses: Point[] = [];
  for (let i = 0; i < cellHouseCount(cell); i++)
    if (!detached.has(i)) houses.push(polygonCentroid(cellHouseRing(cell, i)));
  return rings.map(ring => houses.some(h => pointInPolygon(h, ring)));
}

/**
 * The door of a house on a burgage plot, from the plot itself (docs/plan/ce-burgage-plot-fabric.md §8.8): on the
 * house's side nearest the plot's front, opening towards the front: a front house onto its street, a house behind it
 * onto its court. Taken from the plot, not the saved entrance, so a city saved before the entrances followed the plots
 * (v64/v65) shows its doors right too. Undefined for a house on no plot.
 */
function plotDoorOf(cell: VectorFabricCell): (ring: Point[]) => [Point, Point] | undefined {
  const plots = cell.plots;
  if (!plots || plots.venelles?.widths.length) return () => undefined;
  const rings = plots.offsets.map((start, i) =>
      unpackPoints(plots.coords, cell.origin, start, plots.offsets[i + 1] ?? plots.coords.length / 2)
    ),
    fronts = rings.map((_, i) => unpackPoints(plots.fronts, cell.origin, i * 2, i * 2 + 2));
  return ring => {
    const centre = polygonCentroid(ring),
      k = rings.findIndex(r => pointInPolygon(centre, r));
    if (k < 0) return undefined;
    const [a, b] = fronts[k],
      mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      length = Math.hypot(mid[0] - centre[0], mid[1] - centre[1]);
    if (length < 1e-6) return undefined;
    let door = ring[0],
      gap = Infinity;
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length],
        m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
        d = nearestOnPolyline(m, [a, b]).dist;
      if (d < gap) {
        gap = d;
        door = m;
      }
    });
    const out: Point = [(mid[0] - centre[0]) / length, (mid[1] - centre[1]) / length];
    return [door, [door[0] + out[0] * 3, door[1] + out[1] * 3]];
  };
}

/** Fruit trees of burgage yards (plan §5.4, B5): an apple or a pear in the back half of a deep plot, two in a vacant
 * one. Placed from the plot's own geometry, so a redraw puts them back where they were. */
export function burgageYardTrees(cell: VectorFabricCell, blocked: Point[][]): VectorLandscapeTree[] {
  const plots = cell.plots;
  if (!plots || plots.venelles?.widths.length) return [];
  const trees: VectorLandscapeTree[] = [];
  const near = blocked.filter(r => r.some(p => Math.hypot(p[0] - cell.origin[0], p[1] - cell.origin[1]) < 400));
  const rings = plots.offsets.map((start, i) =>
      unpackPoints(plots.coords, cell.origin, start, plots.offsets[i + 1] ?? plots.coords.length / 2)
    ),
    built = builtPlots(cell, rings);
  plots.offsets.forEach((_, i) => {
    // Only a yard keeps fruit trees.
    if (!built[i]) return;
    const ring = rings[i],
      [a, b] = unpackPoints(plots.fronts, cell.origin, i * 2, i * 2 + 2),
      frontage = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (frontage < 3) return;
    const u: Point = [(b[0] - a[0]) / frontage, (b[1] - a[1]) / frontage],
      c = ring.reduce((n, p) => [n[0] + p[0] / ring.length, n[1] + p[1] / ring.length] as Point, [0, 0] as Point);
    let v: Point = [-u[1], u[0]];
    if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]];
    const depth = Math.max(...ring.map(p => (p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]));
    if (depth < YARD_TREE_MIN_DEPTH) return;
    const hash = growthRandom(`${cell.id}:yard-tree:${i}`),
      vacant = !near.some(r => pointInPolygon(c, r) || r.some(p => pointInPolygon(p, ring)));
    const at = vacant ? [0.55, 0.85] : hash < 0.6 ? [0.8] : [];
    at.forEach((share, k) => {
      const side = (k % 2 ? -1 : 1) * (hash - 0.5) * frontage * 0.4,
        radius = 2 + hash * 1,
        point: Point = [
          a[0] + u[0] * (frontage / 2 + side) + v[0] * depth * share,
          a[1] + u[1] * (frontage / 2 + side) + v[1] * depth * share
        ];
      // Clear of the plot's own sides and of every building.
      if (!pointInPolygon(point, ring)) return;
      if (ring.some((p, j) => nearestOnPolyline(point, [p, ring[(j + 1) % ring.length]]).dist < radius * 0.7)) return;
      if (
        near.some(r => pointInPolygon(point, r) || r.some(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < radius))
      )
        return;
      trees.push({
        id: `${cell.id}~tree${i}.${k}`,
        ownerId: cell.id,
        point,
        radiusMeters: radius,
        heightMeters: 4.5 + hash * 2.5,
        angleRadians: hash * Math.PI * 2,
        species: (hash + k * 0.37) % 1 < 0.6 ? "domestic_apple" : "european_pear"
      });
    });
  });
  return trees;
}

/** Plots shallower than this keep no tree behind their house. */
const YARD_TREE_MIN_DEPTH = 20;

/** The 2D crowns of trees; 3D draws their species models instead. */
function treeCrowns(id: string, trees: VectorLandscapeTree[]): VectorRenderSurface {
  return {
    id,
    kind: "feature",
    featureKind: "burgage",
    pieceRole: "landscape-tree",
    polygons: trees.map(t => ({
      outer: Array.from(
        { length: 10 },
        (_, k): Point => [
          t.point[0] + Math.cos((k / 10) * Math.PI * 2) * t.radiusMeters,
          t.point[1] + Math.sin((k / 10) * Math.PI * 2) * t.radiusMeters
        ]
      ),
      holes: []
    })),
    color: "#6f9455",
    heightMeters: 0,
    elevationMeters: 0.06
  };
}

/** A line as quadrilaterals `width` wide, one per segment. */
function strip(points: Point[], width: number): VectorPolygon[] {
  return points.slice(1).flatMap((b, i) => {
    const a = points[i],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) return [];
    const n: Point = [(-(b[1] - a[1]) / l) * (width / 2), ((b[0] - a[0]) / l) * (width / 2)];
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
  });
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
  /** Yard trees of burgage plots (B5): derived from the plots when drawn, never saved. */
  const yardTrees: VectorLandscapeTree[] = [];
  const terrain = vectorTerrain(doc);
  const hiddenFeatures = new Set(doc.environment?.hidden ?? []);
  const hiddenPaths = new Set(
    Object.values(doc.environment?.features ?? {})
      .filter(f => hiddenFeatures.has(f.id))
      .flatMap(f => f.pathIds)
  );
  for (const id of hiddenPaths) hidden.add(id);
  paths = paths.filter(p => !hiddenPaths.has(p.id));
  const prisms: ReliefPrism[] = [],
    cuts: ReliefCut[] = [];
  // The finished ground: the natural ground, cut down where level ground (a yard terrace) lies below it. Indexed on
  // first use, once every cut is known (natural relief §4.1, §7.1).
  let cutIndex: Map<string, ReliefCut[]> | undefined;
  const CUT_CELL = 24;
  const groundAt = (p: Point): number => {
    const natural = terrain.heightAt(p);
    if (!cuts.length) return natural;
    if (!cutIndex) {
      cutIndex = new Map();
      for (const cut of cuts) {
        const xs = cut.ring.map(q => q[0]),
          ys = cut.ring.map(q => q[1]);
        for (let x = Math.floor(Math.min(...xs) / CUT_CELL); x <= Math.floor(Math.max(...xs) / CUT_CELL); x++)
          for (let y = Math.floor(Math.min(...ys) / CUT_CELL); y <= Math.floor(Math.max(...ys) / CUT_CELL); y++) {
            const key = `${x},${y}`;
            cutIndex.set(key, [...(cutIndex.get(key) ?? []), cut]);
          }
      }
    }
    let h = natural;
    for (const cut of cutIndex.get(`${Math.floor(p[0] / CUT_CELL)},${Math.floor(p[1] / CUT_CELL)}`) ?? [])
      if (h > cut.level - 0.05 && pointInPolygon(p, cut.ring)) h = cut.level - 0.05;
    return h;
  };
  const plinth = (id: string, ring: Point[], level: { floor: number; low: number }) => {
    if (level.floor - level.low > 0.05)
      prisms.push({
        id,
        ring,
        bottom: ring.map(() => level.low - 0.3),
        top: ring.map(() => level.floor),
        sideColor: STONE_COLOR
      });
  };
  const add = (item: VectorRenderSurface) => {
    if (hiddenPaths.has(item.id)) return;
    if (terrain.hasRelief) {
      if (item.kind === "building" && terrain.relief) {
        // A building's floor meets its street; a plinth carries it down to the ground (§5.1).
        const ring = item.polygons[0].outer,
          access = item.placement?.accesses[0],
          street = access && doc.paths[access.pathId] ? evaluateAnchor(doc.paths[access.pathId], access) : undefined,
          level = terrain.floorAt(ring, street);
        item.elevationMeters += level.floor - 0.1;
        plinth(item.id, ring, level);
      } else if (item.kind === "building")
        item.elevationMeters += terrain.foundationAt(item.id, item.polygons[0].outer);
      else if (item.kind !== "bridge")
        item.heightAt =
          item.kind === "river"
            ? p => terrain.waterAt(p) ?? terrain.heightAt(p)
            : ["road", "junction", "access"].includes(item.kind)
              ? terrain.surfaceAt
              : groundAt;
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
  // A harbour's water stands for the site's water and lies under its bridges, as the site's water does.
  const harbor = doc.environment?.harbor ? vectorHarborSurfaces(doc.environment.harbor) : [];
  surfaces.push(...harbor.filter(h => h.pieceRole === "harbor-water"));
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
    // A wet tannery's revetment out to the bank, and its intake and effluent channels across it (tanners' row T2b).
    const works = tanneryWaterWorks(doc, p);
    if (works) {
      if (works.revetment.length)
        add({
          id: p.id,
          kind: "access",
          polygons: works.revetment,
          color: "#a39883",
          heightMeters: 0.05,
          elevationMeters: 0.03
        });
      if (works.channels.length)
        add({
          id: p.id,
          kind: "access",
          polygons: works.channels,
          color: "#5f97b0",
          heightMeters: 0.02,
          elevationMeters: 0.09
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
      appearance = vectorHouseAppearance(doc),
      // A roadside village draws its single-storey buildings with the Opus village models (plan V4).
      villageProfile = doc.urban?.settings.plotFabric === "burgage-village" ? vectorVillageProfile(doc) : undefined;
    for (const district of Object.values(doc.fabric.districts))
      lines(district.id, "s", district.streets, district.origin, district.detachedLines);
    const facilitySites = Object.values(doc.placements).flatMap(p =>
      p.building?.kind === "facility" ? [p.site.outer] : []
    );
    for (const cell of Object.values(doc.fabric.cells)) {
      lines(cell.id, "l", cell.lanes, cell.origin, cell.detachedLines);
      // Burgage plots (docs/plan/ce-burgage-plot-fabric.md B4): yards and their boundary walls, under the houses.
      // On relief each house's floor is levelled first: its yard's terraces start from it (natural relief §5.7).
      const plotDoor = plotDoorOf(cell),
        floors = new Map<number, { floor: number; low: number; high: number }>();
      if (terrain.relief)
        for (let i = 0; i < cellHouseCount(cell); i++) {
          const ring = cellHouseRing(cell, i),
            [, access] = plotDoor(ring) ?? unpackPoints(cell.houses.entrances, cell.origin, 2 * i, 2 * i + 2);
          floors.set(i, terrain.floorAt(ring, access));
        }
      if (cell.plots && cellHouseCount(cell)) {
        const plotSurfaces = burgagePlotSurfaces(cell, warnings, facilitySites);
        if (terrain.relief && !cell.plots.venelles?.widths.length) {
          const { rings, fronts } = burgagePlotRings(cell),
            yard = plotSurfaces.find(p => p.pieceRole === "yard"),
            wall = plotSurfaces.find(p => p.pieceRole === "plot-wall"),
            terraces = reliefYardTerraces(
              `${cell.id}~yards`,
              rings,
              fronts,
              [...floors].map(([i, level]) => ({ ring: cellHouseRing(cell, i), floor: level.floor })),
              terrain.heightAt,
              yard?.color ?? "#b5b27f"
            );
          prisms.push(...terraces.prisms);
          cuts.push(...terraces.cuts);
          if (wall)
            prisms.push(
              ...reliefPlotWalls(
                `${cell.id}~walls`,
                wall.polygons,
                terraces.levels,
                terrain.heightAt,
                wall.heightMeters,
                wall.color
              )
            );
          for (const surface of plotSurfaces)
            if (surface.pieceRole === "yard" || surface.pieceRole === "plot-wall") surface.hidden3d = true;
        }
        plotSurfaces.forEach(add);
        // Fruit trees in the yards' back halves, clear of every house and of every facility's whole site (B5).
        const houseRings = Array.from({ length: cellHouseCount(cell) }, (_, i) => cellHouseRing(cell, i)),
          trees = burgageYardTrees(cell, [...houseRings, ...facilitySites]);
        yardTrees.push(...trees);
        if (trees.length) add(treeCrowns(`${cell.id}~trees`, trees));
      }
      if (urban && stage !== "housing") continue;
      // One surface per street block: 2D draws it as one path, 3D batches it by storeys.
      const detached = new Set(cell.detached),
        polygons: VectorPolygon[] = [],
        houses: NonNullable<VectorRenderSurface["houses"]> = {
          ids: [],
          heightsMeters: [],
          elevationsMeters: [],
          massing: [],
          appearance: [],
          doors: []
        },
        plain: { id: string; massing: BuildingMassing }[] = [];
      if (villageProfile) houses.village = [];
      for (let i = 0; i < cellHouseCount(cell); i++) {
        if (detached.has(i)) continue;
        const id = fabricHouseId(cell.id, i),
          ring = cellHouseRing(cell, i),
          parts = withinFrame(ring)
            ? [{ outer: ring, holes: [] }]
            : regionBoolean([{ outer: ring, holes: [] }], [frame], "intersection"),
          [door, access] = plotDoor(ring) ?? unpackPoints(cell.houses.entrances, cell.origin, 2 * i, 2 * i + 2),
          level = terrain.relief ? (floors.get(i) ?? terrain.floorAt(ring, access)) : undefined,
          elevation = level ? level.floor : 0.1 + (terrain.hasRelief ? terrain.foundationAt(id, ring) : 0);
        if (level) plinth(id, ring, level);
        for (const part of parts) {
          polygons.push(part);
          houses.ids.push(id);
          houses.doors!.push([door, access]);
          houses.heightsMeters.push(cell.houses.storeys[i] * FABRIC_STOREY_METERS);
          houses.elevationsMeters.push(elevation);
          if (houses.village) {
            houses.village.push(villageHouse3d(cell, i, villageProfile!, id));
            continue;
          }
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
  surfaces.push(...harbor.filter(h => h.pieceRole !== "harbor-water"));
  for (const ferry of Object.values(doc.environment?.ferries ?? {})) surfaces.push(...vectorFerrySurfaces(ferry));
  for (const house of Object.values(doc.environment?.monasteries ?? {}))
    surfaces.push(...vectorMonasterySurfaces(house));
  if (doc.environment?.guilds) surfaces.push(...vectorGuildSurfaces(doc.environment.guilds));
  if (doc.environment?.inns) surfaces.push(...vectorInnSurfaces(doc.environment.inns));
  if (doc.environment?.landmarks) surfaces.push(...vectorOpenLandmarkSurfaces(doc.environment.landmarks));
  // Open land by use (U5b), under the woodland: tilled, mown, grazed, and wild ground in the biome's ground colour.
  const landUse = doc.environment?.landUse;
  if (landUse) {
    const wildColor =
      landUse.landClass === "desert"
        ? "#e3d3a4"
        : landUse.landClass === "steppe"
          ? "#d6cf9a"
          : landUse.landClass === "wetland"
            ? "#a9bfa0"
            : landUse.landClass === "cold"
              ? "#c9cbbd"
              : "#b9c48f";
    const colors = { arable: "#d9c98c", meadow: "#a8cc7e", pasture: "#c3d394", wild: wildColor } as const;
    for (const zone of landUse.zones)
      surfaces.push({
        id: `environment:land-use:${zone.kind}`,
        kind: "feature",
        featureKind: "farm",
        pieceRole: `land-use-${zone.kind}`,
        polygons: zone.regions,
        color: colors[zone.kind],
        elevationMeters: 0.005,
        heightMeters: 0
      });
    // Furlongs (U5c): each great field in its course of the rotation, each selion in its holder's own shade of the
    // course ("each patch growing its own crop", Slater 1907); the arable between bundles shows as headland.
    const shades: Record<VectorFurlongCourse, string[]> = {
      winter: ["#cfb56a", "#d9c27a", "#e2cd8a", "#c6ab62"],
      spring: ["#bfc37a", "#c9cb86", "#d3d394", "#b6bb72"],
      fallow: ["#b8bf94", "#c2c79f", "#aeb68a", "#c9c9a6"]
    };
    const buckets = new Map<string, VectorPolygon[]>();
    for (const f of landUse.furlongs ?? [])
      f.strips.forEach((strip, i) => {
        // Neighbours always differ; the shade otherwise follows a fixed hash of the furlong and selion.
        const h = (i * 2 + ((Number(f.id.replace(/\D/g, "")) * 7 + ((i * i) % 5)) % 2)) % 4,
          key = `${f.course}:${h}`;
        buckets.set(key, [...(buckets.get(key) ?? []), strip]);
      });
    for (const [key, polygons] of buckets) {
      const [course, h] = key.split(":") as [VectorFurlongCourse, string];
      surfaces.push({
        id: `environment:land-use:furlong-${course}-${h}`,
        kind: "feature",
        featureKind: "farm",
        pieceRole: `land-use-furlong-${course}`,
        polygons,
        color: shades[course][Number(h)],
        elevationMeters: 0.006,
        heightMeters: 0
      });
    }
  }
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
        // A cistern has no BV model: its stone curb stands round the water as a low ring.
        polygons: [
          w.kind === "cistern" ? { outer: disc(w.radius).outer, holes: [disc(w.radius * 0.65).outer] } : disc(w.radius)
        ],
        color: w.kind === "pond" ? "#88a5a0" : "#d0c8b7",
        elevationMeters: 0.05,
        heightMeters: w.kind === "cistern" ? CISTERN_CURB_METERS : 0
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
        // A cistern's water stands just below its curb's top.
        elevationMeters: w.kind === "cistern" ? CISTERN_CURB_METERS - 0.15 : 0.06,
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
    // Fine enough for a motte or a castle hill: about 4 m in a town frame, no more than 385² vertices
    // (docs/plan/ce-meshless-natural-relief.md §7.1).
    const count = Math.max(64, Math.min(384, Math.ceil(extent / 4))),
      step = extent / count,
      points: [number, number, number][] = [],
      indices: number[] = [],
      colors: number[] = [];
    for (let y = 0; y <= count; y++)
      for (let x = 0; x <= count; x++) {
        const p: Point = [center[0] - extent / 2 + x * step, center[1] - extent / 2 + y * step];
        points.push([p[0], groundAt(p) - 0.01, p[1]]);
      }
    const at = (x: number, y: number) =>
      points[Math.min(count, Math.max(0, y)) * (count + 1) + Math.min(count, Math.max(0, x))][1];
    // Earth on gentle ground, grey rock on slopes steeper than 1:1 (§7.1).
    for (let y = 0; y <= count; y++)
      for (let x = 0; x <= count; x++) {
        const slope = Math.hypot(at(x + 1, y) - at(x - 1, y), at(x, y + 1) - at(x, y - 1)) / (2 * step),
          rock = Math.min(1, Math.max(0, (slope - 0.7) / 0.5));
        colors.push(0.925 + (0.55 - 0.925) * rock, 0.902 + (0.54 - 0.902) * rock, 0.851 + (0.52 - 0.851) * rock);
      }
    for (let y = 0; y < count; y++)
      for (let x = 0; x < count; x++) {
        const i = y * (count + 1) + x;
        indices.push(i, i + 1, i + count + 1, i + 1, i + count + 2, i + count + 1);
      }
    terrainMesh = { points, indices, colors };
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
  // Ground surfaces pushed past `add` (land use, forest, wells, generated precincts) lie on the relief too (P8b).
  if (terrain.relief)
    for (const surface of surfaces)
      if (!surface.heightAt && !surface.elevations && surface.kind !== "building" && surface.kind !== "bridge")
        surface.heightAt = surface.kind === "river" ? p => terrain.waterAt(p) ?? terrain.heightAt(p) : groundAt;
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
  // Burgage yards, walls, venelles and yard trees lie on the ground: in the 2D plan they come before every building,
  // or a facility placed before its street block's yards would be drawn under them.
  const ground = surfaces.filter(s => s.featureKind === "burgage");
  if (ground.length) {
    const rest = surfaces.filter(s => s.featureKind !== "burgage"),
      firstBuilding = rest.findIndex(s => s.kind === "building");
    surfaces.splice(0, surfaces.length, ...rest);
    surfaces.splice(firstBuilding < 0 ? surfaces.length : firstBuilding, 0, ...ground);
  }
  return {
    water,
    structures: vectorStructures(doc).filter(s => drawn.has(s.owner)),
    wallProfile: vectorWallProfile(doc),
    ...(doc.urban?.settings.plotFabric === "burgage-village" ? { villageProfile: vectorVillageProfile(doc) } : {}),
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
    landscapeTrees: [...(doc.environment?.landscape?.trees ?? []), ...yardTrees].map(tree => ({
      ...tree,
      elevationMeters: groundAt(tree.point)
    })),
    // Wells and the plaza basin as the mesh editor's BV waterworks (P2d-1); cisterns (a curbed ring) and ponds stay
    // surfaces.
    wells: (doc.urban?.wells ?? []).flatMap(w =>
      w.kind === "well" || w.kind === "publicBasin"
        ? [{ id: `urban:water:${w.id}`, point: w.center, kind: w.kind, elevationMeters: groundAt(w.center) }]
        : []
    ),
    terrain: terrainMesh,
    ...(prisms.length ? { prisms } : {}),
    ...(terrain.hasRelief
      ? {
          ground: {
            heightAt: groundAt,
            foundationAt: (ring: readonly Point[]) => terrain.foundationAt("", [...ring])
          }
        }
      : {})
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
  return vectorTownProfile(doc);
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
