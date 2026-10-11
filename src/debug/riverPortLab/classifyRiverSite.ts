/**
 * River-Port Lab site classifier (docs/plan/river-port-lab.md §4.3).
 *
 * One pure function shared by lab generation (choosing candidate cells) and lab statistics
 * (judging where a burg actually ended up), so intended and actual site kinds stay comparable.
 */

export type LabSiteKind =
  | "estuary"
  | "deltaBranch"
  | "confluence"
  | "confluenceBelow"
  | "meander"
  | "riverBank"
  | "lakeOutlet"
  | "coastNoRiver"
  | "inland";

export const LAB_SITE_KINDS: readonly LabSiteKind[] = [
  "estuary",
  "deltaBranch",
  "confluence",
  "confluenceBelow",
  "meander",
  "riverBank",
  "lakeOutlet",
  "coastNoRiver",
  "inland"
];

/** Where the cell's own river ends: the sea, a lake, another river, or the map edge. */
export type RiverOutflow = "ocean" | "lake" | "river" | "offmap";

export interface RiverSiteClass {
  kind: LabSiteKind;
  riverId: number;
  /** River cells between this cell and its own river's mouth (0 = the mouth); null off-river. */
  distanceToMouthCells: number | null;
  outflow: RiverOutflow | null;
  /** Rivers meeting at this cell (1 = plain river cell, 0 = off-river). */
  confluenceOrder: number;
  flux: number;
  /** Turn of the river path at this cell, 0 (straight) .. 180 (fold-back); null off-river or at ends. */
  curvatureDeg: number | null;
  /** The cell touches the ocean (haven is an ocean cell). */
  seaAccess: boolean;
}

export interface RiverSiteCells {
  r: ArrayLike<number>;
  conf: ArrayLike<number>;
  haven: ArrayLike<number>;
  h: ArrayLike<number>;
  f: ArrayLike<number>;
  fl: ArrayLike<number>;
  p: ArrayLike<readonly [number, number]>;
}

export interface RiverSiteWorld {
  cells: RiverSiteCells;
  features: ReadonlyArray<{ type?: string; outCell?: number; outlet?: number } | 0 | null | undefined>;
  rivers: ReadonlyArray<{ i: number; cells: number[]; parent?: number }>;
}

/** A river turn at least this sharp counts as a meander. */
export const MEANDER_MIN_TURN_DEG = 45;
/** River cells upstream of an ocean mouth still counted as the delta. */
export const DELTA_MAX_DISTANCE_CELLS = 3;

interface RiverIndex {
  river: RiverSiteWorld["rivers"][number];
  /** Position of each land cell on the river path. */
  position: Map<number, number>;
  mouthIndex: number;
  outflow: RiverOutflow;
}

/** Precomputed lookups; build once per world and reuse for every cell. */
export interface RiverSiteIndex {
  world: RiverSiteWorld;
  rivers: Map<number, RiverIndex>;
  riversThroughCell: Map<number, number>;
  lakeOutCells: Set<number>;
}

const isOcean = (world: RiverSiteWorld, cell: number) => {
  const feature = world.features[world.cells.f[cell]];
  return Boolean(feature && feature.type === "ocean");
};

export function buildRiverSiteIndex(world: RiverSiteWorld): RiverSiteIndex {
  const { cells } = world;
  const rivers = new Map<number, RiverIndex>();
  const riversThroughCell = new Map<number, number>();
  for (const river of world.rivers) {
    if (!river?.cells?.length) continue;
    // River paths end with the receiving cell: water, a river cell of the parent, or -1 off-map.
    const last = river.cells[river.cells.length - 1];
    const mouthIndex = river.cells.length - 2;
    const outflow: RiverOutflow =
      last < 0 ? "offmap" : cells.h[last] < 20 ? (isOcean(world, last) ? "ocean" : "lake") : "river";
    const position = new Map<number, number>();
    river.cells.forEach((cell, index) => {
      if (cell < 0 || cells.h[cell] < 20 || position.has(cell)) return;
      // A tributary's receiving cell counts toward the confluence order but is not on its own path.
      if (index <= mouthIndex) position.set(cell, index);
      riversThroughCell.set(cell, (riversThroughCell.get(cell) ?? 0) + 1);
    });
    rivers.set(river.i, { river, position, mouthIndex, outflow });
  }
  const lakeOutCells = new Set<number>();
  world.features.forEach((feature, featureId) => {
    if (typeof feature !== "object" || feature?.type !== "lake") return;
    // outCell exists only during generation (Lakes.cleanupLakeData drops it); saved maps keep the
    // outlet river. It may share its id with an inflow river, so the out cell is the first land
    // cell after this lake's last water cell on that path.
    if (feature.outCell != null) lakeOutCells.add(feature.outCell);
    const path = feature.outlet ? rivers.get(feature.outlet)?.river.cells : undefined;
    if (!path) return;
    let lastLakeCell = -1;
    path.forEach((cell, index) => {
      if (cell >= 0 && cells.h[cell] < 20 && cells.f[cell] === featureId) lastLakeCell = index;
    });
    const outCell = lastLakeCell >= 0 ? path[lastLakeCell + 1] : undefined;
    if (outCell !== undefined && outCell >= 0 && cells.h[outCell] >= 20) lakeOutCells.add(outCell);
  });
  return { world, rivers, riversThroughCell, lakeOutCells };
}

function turnDeg(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    vx = c[0] - b[0],
    vy = c[1] - b[1];
  const lu = Math.hypot(ux, uy),
    lv = Math.hypot(vx, vy);
  if (!lu || !lv) return null;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Classifies a land cell; returns null for water cells. */
export function classifyRiverSite(index: RiverSiteIndex, cell: number): RiverSiteClass | null {
  const { world } = index;
  const { cells } = world;
  if (cells.h[cell] < 20) return null;
  const havenCell = cells.haven[cell];
  const seaAccess = Boolean(havenCell) && isOcean(world, havenCell);
  const riverId = cells.r[cell];
  const flux = cells.fl[cell] ?? 0;
  const entry = riverId ? index.rivers.get(riverId) : undefined;
  if (!entry) {
    return {
      kind: seaAccess ? "coastNoRiver" : "inland",
      riverId: 0,
      distanceToMouthCells: null,
      outflow: null,
      confluenceOrder: 0,
      flux,
      curvatureDeg: null,
      seaAccess
    };
  }

  const path = entry.river.cells;
  const at = entry.position.get(cell) ?? -1;
  const distanceToMouthCells = at >= 0 ? entry.mouthIndex - at : null;
  const curvatureDeg =
    at > 0 && path[at + 1] >= 0 && cells.h[path[at + 1]] >= 20
      ? turnDeg(cells.p[path[at - 1]], cells.p[cell], cells.p[path[at + 1]])
      : null;
  const confluenceOrder = Math.max(1, index.riversThroughCell.get(cell) ?? 1);
  const upstream = at > 0 ? path[at - 1] : -1;

  const base = {
    riverId,
    distanceToMouthCells,
    outflow: entry.outflow,
    confluenceOrder,
    flux,
    curvatureDeg: curvatureDeg == null ? null : Math.round(curvatureDeg),
    seaAccess
  };
  const oceanMouthDistance = entry.outflow === "ocean" ? distanceToMouthCells : null;
  let kind: LabSiteKind;
  if (oceanMouthDistance === 0 || (seaAccess && oceanMouthDistance != null && oceanMouthDistance <= 1))
    kind = "estuary";
  // A lake outlet often also gathers tributaries; the rarer relation wins.
  else if (index.lakeOutCells.has(cell) || (at === 0 && isLakeAdjacentSource(index, cell))) kind = "lakeOutlet";
  else if (cells.conf[cell] || confluenceOrder > 1) kind = "confluence";
  else if (oceanMouthDistance != null && oceanMouthDistance <= DELTA_MAX_DISTANCE_CELLS) kind = "deltaBranch";
  else if (upstream >= 0 && cells.conf[upstream]) kind = "confluenceBelow";
  else if (curvatureDeg != null && curvatureDeg >= MEANDER_MIN_TURN_DEG) kind = "meander";
  else kind = "riverBank";
  return { kind, ...base };
}

function isLakeAdjacentSource(index: RiverSiteIndex, cell: number) {
  const havenCell = index.world.cells.haven[cell];
  if (!havenCell) return false;
  const feature = index.world.features[index.world.cells.f[havenCell]];
  return Boolean(feature && feature.type === "lake");
}
