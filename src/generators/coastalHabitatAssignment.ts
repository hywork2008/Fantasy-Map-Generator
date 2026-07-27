/**
 * Automatic coastal / nearshore habitat assignment (Phase 3).
 * Runs after biome assignment; does not replace climate biomes.
 *
 * Coastline is classified as contiguous segments. For the global profile,
 * sandy beaches target ~25–35% of coast length (plan).
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
  riverSediment: number;
  temperature: number;
  enclosure: number;
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

function buildCoastCells(pack: PackedGraph, grid: Grid): CoastCell[] {
  const { cells } = pack;
  const out: CoastCell[] = [];
  for (const cellId of cells.i) {
    if (cells.t[cellId] !== LAND_COAST) continue;
    if (cells.h[cellId] < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const waterH = meanAdjacentWaterHeight(pack, cellId);
    const slope = cells.h[cellId] - waterH;
    const riverSediment = cells.r[cellId] ? Math.min(cells.fl[cellId] / 20, 8) : 0;
    const g = cells.g[cellId];
    const temperature = grid.cells.temp[g] ?? 10;
    const enclosure = cells.enclosure?.[cellId] ?? 0;
    out.push({ cellId, slope, riverSediment, temperature, enclosure });
  }
  return out;
}

/**
 * Group land-coast cells into contiguous segments via BFS along land-coast neighbors.
 */
function buildCoastSegments(pack: PackedGraph, coastCells: CoastCell[]): number[][] {
  const coastSet = new Set(coastCells.map(c => c.cellId));
  const visited = new Set<number>();
  const segments: number[][] = [];
  const neighbors = pack.cells.c;

  for (const start of coastSet) {
    if (visited.has(start)) continue;
    const segment: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const id = queue.pop()!;
      segment.push(id);
      for (const nb of neighbors[id] ?? []) {
        if (!coastSet.has(nb) || visited.has(nb)) continue;
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
  let enclosureSum = 0;
  for (const id of segment) {
    const c = byId.get(id)!;
    slopeSum += c.slope;
    sedimentSum += c.riverSediment;
    tempSum += c.temperature;
    enclosureSum += c.enclosure;
  }
  const n = segment.length || 1;
  const avgSlope = slopeSum / n;
  const avgSediment = sedimentSum / n;
  const avgTemp = tempSum / n;
  const avgEnclosure = enclosureSum / n;

  // Steep rocky coasts / exposed
  if (avgSlope >= 8 || (avgSlope >= 5 && avgSediment < 0.5)) return "rockyIntertidal";
  // Very flat + river/bay → tidal flat
  if (avgSlope <= 3 && (avgSediment >= 1.5 || avgEnclosure > 40)) return "tidalFlat";
  // Mild slope + sediment → sandy
  if (avgSlope <= 6 && avgSediment >= 0.3) return "sandyBeach";
  // Profile biases
  if (profile === "tropicalRiverBasin" && avgTemp >= 18 && avgSlope <= 5) return "sandyBeach";
  if (profile === "mountainRealm" && avgSlope >= 4) return "rockyIntertidal";
  if (profile === "mediterranean" && avgSlope >= 4) return "rockyIntertidal";
  // Default mid: mild rock or sand by noise later
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
  const segments = buildCoastSegments(pack, coastCells);
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
