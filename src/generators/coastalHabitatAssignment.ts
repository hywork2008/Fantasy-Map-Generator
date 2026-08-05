/**
 * Automatic coastal / nearshore habitat assignment (Phase 3).
 * Runs after biome assignment; does not replace climate biomes.
 *
 * Coastline is classified as contiguous segments. For the global profile,
 * sandy beaches target ~25–35% of coast length (plan).
 *
 * Classification reads from `grid.cells.ambientCurrentSpeed` (harbor-siting-grade current
 * exposure, see `docs/simulation/ocean-currents.md` §6) rather than `pack.cells.enclosure`.
 * The latter is a user-configurable display value (`useOptionsState.enclosureCalculationMode`)
 * that defaults to a mode which saturates near 100 for almost every coastal cell (LBM no-slip
 * boundary layer) — tying habitat classification to it made nearly all mild-slope coastline read
 * as "enclosed" and get swallowed into `tidalFlat` before `sandyBeach` was ever considered. Using
 * `ambientCurrentSpeed` directly keeps this module correct regardless of what the user has the
 * enclosure display set to.
 */

import { getCoastalHabitatCode, getNearshoreHabitatCode } from "../data/coastalHabitatCatalog";
import { BiomeConstants, HeightThreshold } from "../data/constants";
import type { BiomeRegionProfile } from "../types/biomeRegion";
import type { CoastalHabitatKey, NearshoreHabitatKey } from "../types/coastalHabitat";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { spatialNoise } from "./biomeAssignment";

const LAND_COAST = 1;
const WATER_COAST = -1;

export interface CoastalAssignmentOptions {
  readonly profile: BiomeRegionProfile;
  readonly seed: number;
}

interface CoastCell {
  cellId: number;
  /** Proxy for slope: land height minus mean adjacent water height. Higher = steeper rock. */
  slope: number;
  /**
   * River-mouth sediment supply, spread along the coast by `diffuseSediment()` so cells near
   * (not just exactly at) a river mouth get partial credit — see the module doc comment.
   */
  sedimentSupply: number;
  temperature: number;
  /**
   * Current/wave exposure, 0 (stagnant) .. 100 (fully exposed), derived from
   * `grid.cells.ambientCurrentSpeed`. See the module doc comment for why this replaces
   * `pack.cells.enclosure` here.
   */
  exposure: number;
  /**
   * How much faster the seabed deepens one hop further offshore than immediately offshore
   * (`waterDepthTrend()`). Positive and large = fjord-like: water drops away sharply just past
   * the shore even where the land side looks like a gentle beach slope.
   */
  depthDrop: number;
}

function meanAdjacentWaterHeight(pack: PackedGraph, cellId: number): number {
  const { h, c: neighbors } = pack.cells;
  let sum = 0;
  let n = 0;
  for (const nb of neighbors[cellId] ?? []) {
    if (h[nb] < HeightThreshold.WATER_MAX_HEIGHT) {
      sum += h[nb];
      n++;
    }
  }
  return n ? sum / n : HeightThreshold.WATER_MAX_HEIGHT - 1;
}

/**
 * Compares mean water depth one hop offshore against mean water depth two hops offshore.
 * A large positive result means the seabed drops away sharply just past the immediate shore
 * (a fjord/steep-shelf coast) — real beaches don't form there even if the land-side slope alone
 * looks mild. Returns 0 when there isn't a second ring to compare against (e.g. a narrow strait).
 */
function waterDepthTrend(pack: PackedGraph, cellId: number): number {
  const { h, c: neighbors } = pack.cells;
  let nearDepth = 0;
  let nearN = 0;
  const nearWaterIds: number[] = [];
  for (const nb of neighbors[cellId] ?? []) {
    if (h[nb] < HeightThreshold.WATER_MAX_HEIGHT) {
      nearDepth += HeightThreshold.WATER_MAX_HEIGHT - h[nb];
      nearN++;
      nearWaterIds.push(nb);
    }
  }
  if (!nearN) return 0;

  let farDepth = 0;
  let farN = 0;
  for (const wid of nearWaterIds) {
    for (const nb2 of neighbors[wid] ?? []) {
      if (nb2 === cellId || h[nb2] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
      farDepth += HeightThreshold.WATER_MAX_HEIGHT - h[nb2];
      farN++;
    }
  }
  if (!farN) return 0;

  return farDepth / farN - nearDepth / nearN;
}

/**
 * Spreads raw river-mouth sediment along the coast by repeatedly averaging each land-coast cell
 * toward the mean of itself and its land-coast neighbors (same neighbor-averaging technique as
 * `OceanCurrentsModule.computeAmbientCurrentSpeed()`, applied to coast-cell adjacency instead of
 * open ocean). Without this, `cells.r[cellId]` gates sediment to the exact river-mouth cell only,
 * so a cove a couple of cells down the shore from a river gets zero credit even though longshore
 * drift would realistically carry sediment there. Fewer passes than the ocean-current smoothing
 * (`OceanCurrentConstants.AMBIENT_SMOOTHING_PASSES`, 6) since a sediment plume shouldn't spread a
 * whole coastline's length, just a short stretch either side of the mouth.
 */
function diffuseSediment(coastCells: CoastCell[], coastSet: Set<number>, neighbors: number[][]): Map<number, number> {
  let current = new Map(coastCells.map(c => [c.cellId, c.sedimentSupply]));
  for (let pass = 0; pass < BiomeConstants.COASTAL_SEDIMENT_DIFFUSION_PASSES; pass++) {
    const next = new Map(current);
    for (const [id] of current) {
      let sum = current.get(id)!;
      let count = 1;
      for (const nb of neighbors[id] ?? []) {
        if (!coastSet.has(nb)) continue;
        sum += current.get(nb) ?? 0;
        count++;
      }
      next.set(id, sum / count);
    }
    current = next;
  }
  return current;
}

function buildCoastCells(pack: PackedGraph, grid: Grid): CoastCell[] {
  const { cells } = pack;
  const out: CoastCell[] = [];
  for (const cellId of cells.i) {
    if (cells.t[cellId] !== LAND_COAST) continue;
    if (cells.h[cellId] < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const waterH = meanAdjacentWaterHeight(pack, cellId);
    const slope = cells.h[cellId] - waterH;
    const sedimentSupply = cells.r[cellId] ? Math.min(cells.fl[cellId] / 20, 8) : 0;
    const g = cells.g[cellId];
    const temperature = grid.cells.temp[g] ?? 10;
    // ambientCurrentSpeed is preferred (de-saturated, see module doc comment); fall back to the
    // raw currentSpeed, then a neutral mid-value, for older saves/fixtures without either array.
    const speed = grid.cells.ambientCurrentSpeed?.[g] ?? grid.cells.currentSpeed?.[g];
    const exposure = speed !== undefined ? (speed / 255) * 100 : 50;
    const depthDrop = waterDepthTrend(pack, cellId);
    out.push({ cellId, slope, sedimentSupply, temperature, exposure, depthDrop });
  }

  const coastSet = new Set(out.map(c => c.cellId));
  const diffused = diffuseSediment(out, coastSet, cells.c);
  for (const cell of out) cell.sedimentSupply = diffused.get(cell.cellId) ?? cell.sedimentSupply;

  return out;
}

/**
 * Group land-coast cells into contiguous segments via BFS along land-coast neighbors,
 * stopping the walk wherever the local terrain classification changes.
 *
 * A plain connectivity BFS (no classification check) is not enough: land-coast cells
 * around a single landmass are almost always all mutually connected, so an unconstrained
 * BFS produces exactly one giant segment per landmass/island regardless of how its slope
 * or sediment actually varies along the shore. `classifySegmentBase()` then has no choice
 * but to average slope/sediment/enclosure over the *entire* coastline and collapse it to a
 * single habitat, and `balanceSandyShare()` can only flip whole landmasses at a time — the
 * observed symptom was most islands reading ~100% sandy or ~100% rocky with almost no
 * in-between (see docs/plan/biomes.md's "区間の内部では同じハビタットを連続させ、短い遷移帯だけを
 * 混在させる" — segments were meant to be sub-stretches of a coastline, not the whole thing).
 *
 * Fix: classify each cell from a small local window (itself + its immediate land-coast
 * neighbors, via the same `classifySegmentBase()` formula) *before* grouping, then only
 * merge adjacent cells that share that local classification. Segment boundaries now fall
 * where the terrain genuinely shifts (steep/sedimented/sheltered changes), producing many
 * shorter segments per landmass instead of one, while still keeping runs of similar terrain
 * contiguous (no cell-by-cell checkerboarding) because the local window itself is smoothed
 * over 1-hop neighbors.
 */
function buildCoastSegments(
  pack: PackedGraph,
  coastCells: CoastCell[],
  byId: Map<number, CoastCell>,
  profile: BiomeRegionProfile
): number[][] {
  const coastSet = new Set(coastCells.map(c => c.cellId));
  const neighbors = pack.cells.c;

  const localKey = new Map<number, CoastalHabitatKey>();
  for (const cell of coastCells) {
    const window = [cell.cellId];
    for (const nb of neighbors[cell.cellId] ?? []) {
      if (coastSet.has(nb)) window.push(nb);
    }
    localKey.set(cell.cellId, classifySegmentBase(window, byId, profile));
  }

  const visited = new Set<number>();
  const segments: number[][] = [];

  for (const start of coastSet) {
    if (visited.has(start)) continue;
    const key = localKey.get(start)!;
    const segment: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const id = queue.pop()!;
      segment.push(id);
      for (const nb of neighbors[id] ?? []) {
        if (!coastSet.has(nb) || visited.has(nb)) continue;
        if (localKey.get(nb) !== key) continue;
        visited.add(nb);
        queue.push(nb);
      }
    }
    if (segment.length) segments.push(segment);
  }
  return segments;
}

function classifySegmentBase(
  segment: number[],
  byId: Map<number, CoastCell>,
  profile: BiomeRegionProfile
): CoastalHabitatKey {
  let slopeSum = 0;
  let sedimentSum = 0;
  let tempSum = 0;
  let exposureSum = 0;
  let depthDropSum = 0;
  for (const id of segment) {
    const c = byId.get(id)!;
    slopeSum += c.slope;
    sedimentSum += c.sedimentSupply;
    tempSum += c.temperature;
    exposureSum += c.exposure;
    depthDropSum += c.depthDrop;
  }
  const n = segment.length || 1;
  const avgSlope = slopeSum / n;
  const avgSediment = sedimentSum / n;
  const avgTemp = tempSum / n;
  const avgExposure = exposureSum / n; // 0 stagnant .. 100 fully exposed
  const avgDepthDrop = depthDropSum / n;
  const {
    COASTAL_EXPOSURE_CALM_THRESHOLD,
    COASTAL_FJORD_DEPTH_DROP,
    COASTAL_SEDIMENT_SANDY_MIN,
    COASTAL_SEDIMENT_TIDAL_MIN
  } = BiomeConstants;

  // Steep terrain is rock regardless of waves/current — real cliffs don't need pounding surf.
  if (avgSlope >= 8) return "rockyIntertidal";
  // Fjord-like: land side looks mild but the seabed drops away sharply just offshore. No beach
  // forms there even at a gentle land-side slope.
  if (avgDepthDrop >= COASTAL_FJORD_DEPTH_DROP) return "rockyIntertidal";
  // Moderate slope, real current/wave energy, nothing to hold sediment: scoured bare rock.
  if (avgSlope >= 5 && avgExposure >= COASTAL_EXPOSURE_CALM_THRESHOLD && avgSediment < 0.5) return "rockyIntertidal";
  // Very flat, stagnant, and heavily sedimented: with almost no current to sort it, fine
  // sediment settles as mud rather than clean sand.
  if (avgSlope <= 3 && avgExposure < COASTAL_EXPOSURE_CALM_THRESHOLD && avgSediment >= COASTAL_SEDIMENT_TIDAL_MIN) {
    return "tidalFlat";
  }
  // Mild-to-moderate slope with either real current/wave action to sort sediment into sand, or a
  // modest sediment supply on its own (a sheltered, lightly sedimented cove is still a beach, not
  // a bare rock). Sediment is a bonus here, not a hard gate — most real-world beaches aren't at a
  // river mouth, and `diffuseSediment()` already spreads river-mouth credit along nearby coast.
  if (avgSlope <= 6 && (avgExposure >= COASTAL_EXPOSURE_CALM_THRESHOLD || avgSediment >= COASTAL_SEDIMENT_SANDY_MIN)) {
    return "sandyBeach";
  }
  // Very flat, stagnant, and sediment-starved: no current to keep it a beach either way, settles
  // as flat mud/estuary by default.
  if (avgSlope <= 3) return "tidalFlat";
  // Profile biases
  if (profile === "tropicalRiverBasin" && avgTemp >= 18 && avgSlope <= 5) return "sandyBeach";
  if (profile === "mountainRealm" && avgSlope >= 4) return "rockyIntertidal";
  if (profile === "mediterranean" && avgSlope >= 4) return "rockyIntertidal";
  // Default: lean sandy rather than rocky for whatever's left (moderate-slope, moderate-exposure
  // coast) — matches sandy beach being a common, not rare, global outcome (docs/plan/biomes.md
  // targets ~25-35% of coastline length).
  return avgSlope >= 5 ? "rockyIntertidal" : "sandyBeach";
}

/**
 * Adjust segment habitats so global sandy share is in [25%, 35%] of coast length.
 */
function balanceSandyShare(
  segmentKeys: CoastalHabitatKey[],
  segmentLengths: number[],
  seed: number,
  targetMin: number,
  targetMax: number
): CoastalHabitatKey[] {
  const total = segmentLengths.reduce((a, b) => a + b, 0) || 1;
  const sandyLen = () =>
    segmentKeys.reduce(
      (sum, key, i) => sum + (key === "sandyBeach" || key === "coastalDune" ? segmentLengths[i]! : 0),
      0
    );
  let share = sandyLen() / total;
  const result = [...segmentKeys];

  // Convert excess sand → rock
  if (share > targetMax) {
    const order = result
      .map((key, i) => ({ key, i, len: segmentLengths[i]!, noise: spatialNoise(i * 10, 0, seed) }))
      .filter(s => s.key === "sandyBeach")
      .sort((a, b) => a.noise - b.noise);
    for (const s of order) {
      if (sandyLen() / total <= targetMax) break;
      result[s.i] = "rockyIntertidal";
    }
  }
  // Convert rock → sand if too little sand
  share = sandyLen() / total;
  if (share < targetMin) {
    const order = result
      .map((key, i) => ({ key, i, len: segmentLengths[i]!, noise: spatialNoise(i * 10, 1, seed + 3) }))
      .filter(s => s.key === "rockyIntertidal")
      .sort((a, b) => b.noise - a.noise);
    for (const s of order) {
      if (sandyLen() / total >= targetMin) break;
      // Prefer shorter segments to fill gap without overshooting
      result[s.i] = "sandyBeach";
    }
  }
  return result;
}

function placeDunes(
  pack: PackedGraph,
  coastal: Uint8Array,
  segment: number[],
  habitat: CoastalHabitatKey,
  seed: number
): void {
  if (habitat !== "sandyBeach" || segment.length < 4) return;
  // Dunes only behind long sandy stretches: mark a few interior-ish coast cells
  for (const cellId of segment) {
    if (spatialNoise(cellId, 2, seed) < 0.78) continue;
    // Prefer cells with a landlocked neighbor (behind the beach)
    const hasBack = (pack.cells.c[cellId] ?? []).some(
      nb => pack.cells.h[nb] >= HeightThreshold.WATER_MAX_HEIGHT && pack.cells.t[nb] >= 2
    );
    if (hasBack) coastal[cellId] = getCoastalHabitatCode("coastalDune");
  }
}

function assignNearshore(
  pack: PackedGraph,
  grid: Grid,
  nearshore: Uint8Array,
  coastal: Uint8Array,
  seed: number
): void {
  const { cells } = pack;
  const sandy = getCoastalHabitatCode("sandyBeach");
  const dune = getCoastalHabitatCode("coastalDune");
  const rockyCoast = getCoastalHabitatCode("rockyIntertidal");

  for (const cellId of cells.i) {
    if (cells.t[cellId] !== WATER_COAST) continue;
    if (cells.h[cellId] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
    // Shallow only
    const depthProxy = HeightThreshold.WATER_MAX_HEIGHT - cells.h[cellId];
    if (depthProxy > BiomeConstants.NEARSHORE_MAX_DEPTH_PROXY) continue;

    const g = cells.g[cellId];
    const temp = grid.cells.temp[g] ?? 10;
    // Look at adjacent land coast habitats
    let adjSandy = false;
    let adjRocky = false;
    for (const nb of cells.c[cellId] ?? []) {
      if (cells.h[nb] < HeightThreshold.WATER_MAX_HEIGHT) continue;
      const ch = coastal[nb] ?? 0;
      if (ch === sandy || ch === dune) adjSandy = true;
      if (ch === rockyCoast) adjRocky = true;
    }

    let key: NearshoreHabitatKey = "none";
    if (temp >= 22 && adjSandy && spatialNoise(cellId, 5, seed) > 0.35) key = "coralReef";
    else if (adjRocky || (temp < 18 && spatialNoise(cellId, 6, seed) > 0.4)) key = "rockyReef";
    else if (adjSandy && temp >= 8) key = "seagrassMeadow";
    else if (spatialNoise(cellId, 7, seed) > 0.55) key = "rockyReef";

    if (key !== "none") nearshore[cellId] = getNearshoreHabitatCode(key);
  }
}

/**
 * Fill coastalHabitat / nearshoreHabitat columns for the packed graph.
 */
export function assignCoastalHabitats(pack: PackedGraph, grid: Grid, options: CoastalAssignmentOptions): void {
  const n = pack.cells.i.length;
  const coastal = pack.cells.coastalHabitat instanceof Uint8Array ? pack.cells.coastalHabitat : new Uint8Array(n);
  const nearshore = pack.cells.nearshoreHabitat instanceof Uint8Array ? pack.cells.nearshoreHabitat : new Uint8Array(n);
  coastal.fill(0);
  nearshore.fill(0);

  const coastCells = buildCoastCells(pack, grid);
  if (!coastCells.length) {
    pack.cells.coastalHabitat = coastal;
    pack.cells.nearshoreHabitat = nearshore;
    return;
  }

  const byId = new Map(coastCells.map(c => [c.cellId, c]));
  const segments = buildCoastSegments(pack, coastCells, byId, options.profile);
  const baseKeys = segments.map(seg => classifySegmentBase(seg, byId, options.profile));
  const lengths = segments.map(s => s.length);

  let keys = baseKeys;
  // Global and default: enforce sandy beach share
  if (options.profile === "global" || options.profile === "tropicalRiverBasin") {
    keys = balanceSandyShare(
      baseKeys,
      lengths,
      options.seed,
      BiomeConstants.SANDY_BEACH_TARGET_MIN,
      BiomeConstants.SANDY_BEACH_TARGET_MAX
    );
  } else if (options.profile === "mountainRealm") {
    // More rock
    keys = baseKeys.map(k => (k === "sandyBeach" && spatialNoise(0, 0, options.seed) > 0.3 ? "rockyIntertidal" : k));
  }

  for (let s = 0; s < segments.length; s++) {
    const habitat = keys[s]!;
    const code = getCoastalHabitatCode(habitat);
    for (const cellId of segments[s]!) {
      coastal[cellId] = code;
    }
    placeDunes(pack, coastal, segments[s]!, habitat, options.seed);
  }

  assignNearshore(pack, grid, nearshore, coastal, options.seed);

  pack.cells.coastalHabitat = coastal;
  pack.cells.nearshoreHabitat = nearshore;
}

/** Coastline length share of sandy beach + dune (for tests). */
export function measureSandyBeachShare(coastal: ArrayLike<number>, landCoastCellIds: number[]): number {
  if (!landCoastCellIds.length) return 0;
  const sandy = getCoastalHabitatCode("sandyBeach");
  const dune = getCoastalHabitatCode("coastalDune");
  let s = 0;
  for (const id of landCoastCellIds) {
    const c = coastal[id] ?? 0;
    if (c === sandy || c === dune) s++;
  }
  return s / landCoastCellIds.length;
}
