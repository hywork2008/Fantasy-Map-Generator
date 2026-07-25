import type { ChronicleEvent, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { minmax } from "../utils";
import { findReachableCells, type SeaRouteGraph } from "./seaRouteGraph";

/**
 * Threat weight per diplomatic relation, used only to score how much a border
 * deserves a garrison/fortress. Deliberately separate from military-generator's
 * `rate` table, which scores overall state alert (and includes negative weights
 * for friendly relations) — a different concern from "where is the frontier."
 */
const RELATION_THREAT_WEIGHT: Record<string, number> = {
  Enemy: 1,
  Rival: 0.5,
  Suspicion: 0.2,
  Neutral: 0.05,
  Unknown: 0.05,
  Friendly: 0.02,
  Ally: 0.02,
  Vassal: 0.01,
  Suzerain: 0.01
};

const ACTIVE_WAR_BOOST = 2.5;
const RECENT_WAR_YEARS = 15;

export interface FrontierSegment {
  neighborState: number;
  relation: string;
  threatWeight: number;
  cells: number[];
  cx: number;
  cy: number;
  /** The landmass/feature id (`cells.f`) shared by every cell in this segment. */
  landmass: number;
  /**
   * "land" (analyzeFrontiers, adjacency-based), "sea" (analyzeSeaFrontiers,
   * sea-route-based), or "unclaimed" (analyzeUnclaimedFrontiers). Optional/absent is
   * treated as "land" — callers that only ever see analyzeFrontiers() output (and existing
   * tests) don't need to set it. `neighborState` is 0 only for an unclaimed frontier; it never
   * represents a diplomatic State.
   */
  origin?: "land" | "sea" | "unclaimed";
}

const UNCLAIMED_FRONTIER_BASE_THREAT = 0.15;
const UNCLAIMED_FRONTIER_DANGER_WEIGHT = 0.35;

/**
 * Resolves a set of border cells to a single anchor point that is guaranteed to sit on
 * one of those actual cells, never an arbitrary point in space. A plain arithmetic mean
 * of border-cell coordinates can fall in open water when the border wraps concavely
 * (around a bay, or encircling a small exclave from most sides) — that previously let
 * garrisoned regiments get pulled toward a point in the middle of the sea. Snapping to
 * the real border cell closest to that mean keeps the anchor on land while still
 * favoring the geometrically "central" part of the border.
 */
function getBorderAnchor(borderCells: number[], points: [number, number][]): [number, number] {
  let meanX = 0;
  let meanY = 0;
  for (const c of borderCells) {
    meanX += points[c][0];
    meanY += points[c][1];
  }
  meanX /= borderCells.length;
  meanY /= borderCells.length;

  let bestCell = borderCells[0];
  let bestDist = Infinity;
  for (const c of borderCells) {
    const dist = Math.hypot(points[c][0] - meanX, points[c][1] - meanY);
    if (dist < bestDist) {
      bestDist = dist;
      bestCell = c;
    }
  }
  return [points[bestCell][0], points[bestCell][1]];
}

/** `state.diplomacy[neighborState]` as a plain string label, or undefined if unset/not a string. */
function getRelationLabel(state: State, neighborState: number): string | undefined {
  const relation = state.diplomacy?.[neighborState];
  return typeof relation === "string" ? relation : undefined;
}

/**
 * Relation+war-history threat weight for `state`'s relationship with `neighborState`,
 * shared by land (analyzeFrontiers) and sea (analyzeSeaFrontiers) frontier analysis. 0
 * means "not hostile enough to matter" (including no diplomacy entry at all) — callers
 * should skip the pair entirely rather than create a zero-weight segment.
 */
function getThreatWeight(state: State, neighborState: number, currentYear: number): number {
  const relationLabel = getRelationLabel(state, neighborState);
  const baseWeight = relationLabel ? (RELATION_THREAT_WEIGHT[relationLabel] ?? 0) : 0;
  if (baseWeight <= 0) return 0;

  const hasActiveOrRecentWar = state.campaigns?.some(
    c =>
      (c.attacker === neighborState || c.defender === neighborState) &&
      (c.end === undefined || currentYear - c.end <= RECENT_WAR_YEARS)
  );
  return hasActiveOrRecentWar ? baseWeight * ACTIVE_WAR_BOOST : baseWeight;
}

/**
 * Groups each state's border cells by (hostile neighbor, landmass), weighted by
 * relation and boosted for active/recent wars (from `state.campaigns`). Non-hostile
 * borders (Ally, Neutral, Friendly, Vassal, Suzerain, Unknown, …) are omitted
 * entirely, so peaceful states resolve to no segments at all.
 *
 * Splitting by landmass (not just neighbor) keeps every segment geographically
 * coherent: a regiment on an exclave's landmass should never be pointed at a
 * border segment that only exists on the mainland across open sea (see
 * `pickPrimaryFrontier`'s landmass-filtered callers).
 *
 * This only sees land-adjacent borders (`cells.c`) — a state separated from a hostile
 * neighbor by open water gets no segment here at all, even if it's a short sail away.
 * See analyzeSeaFrontiers() for the sea-route-based counterpart.
 */
export function analyzeFrontiers(pack: PackedGraph, currentYear: number): Map<number, FrontierSegment[]> {
  const { cells, states } = pack;
  const cellsByNeighborLandmass = new Map<
    number,
    Map<string, { neighborState: number; landmass: number; cells: number[] }>
  >();

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const s = cells.state[i];
    if (!s) continue;
    const landmass = cells.f[i];

    for (const c of cells.c[i]) {
      if (cells.h[c] < 20) continue;
      const t = cells.state[c];
      if (!t || t === s) continue;

      if (!cellsByNeighborLandmass.has(s)) cellsByNeighborLandmass.set(s, new Map());
      const byKey = cellsByNeighborLandmass.get(s)!;
      const key = `${t}:${landmass}`;
      if (!byKey.has(key)) byKey.set(key, { neighborState: t, landmass, cells: [] });
      byKey.get(key)!.cells.push(i);
    }
  }

  const result = new Map<number, FrontierSegment[]>();

  cellsByNeighborLandmass.forEach((byKey, s) => {
    const state = states[s];
    const segments: FrontierSegment[] = [];

    byKey.forEach(({ neighborState: t, landmass, cells: rawCells }) => {
      const threatWeight = getThreatWeight(state, t, currentYear);
      if (threatWeight <= 0) return;

      const borderCells = Array.from(new Set(rawCells));
      const [cx, cy] = getBorderAnchor(borderCells, cells.p);

      segments.push({
        neighborState: t,
        relation: getRelationLabel(state, t) ?? "Unknown",
        threatWeight,
        cells: borderCells,
        cx,
        cy,
        landmass
      });
    });

    if (segments.length) result.set(s, segments);
  });

  return result;
}

/**
 * Finds each State's land border with politically unclaimed territory. Unlike
 * `analyzeFrontiers`, this is not a diplomatic border: `neighborState = 0` is
 * a sentinel only, and the moderate threat weight represents patrol, escort,
 * and relief demand rather than an enemy army. Segments stay on the owning
 * State's actual cells so military destinations never claim wilderness.
 */
export function analyzeUnclaimedFrontiers(pack: PackedGraph): Map<number, FrontierSegment[]> {
  const { cells, states } = pack;
  const borderCellsByStateLandmass = new Map<number, Map<number, number[]>>();

  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue;
    const stateId = cells.state[cellId];
    if (!stateId || states[stateId]?.removed) continue;
    if (!(cells.c[cellId] ?? []).some(neighborId => cells.h[neighborId] >= 20 && cells.state[neighborId] === 0)) {
      continue;
    }

    const landmass = cells.f[cellId];
    if (!borderCellsByStateLandmass.has(stateId)) borderCellsByStateLandmass.set(stateId, new Map());
    const byLandmass = borderCellsByStateLandmass.get(stateId)!;
    const borderCells = byLandmass.get(landmass) ?? [];
    borderCells.push(cellId);
    byLandmass.set(landmass, borderCells);
  }

  const result = new Map<number, FrontierSegment[]>();
  borderCellsByStateLandmass.forEach((byLandmass, stateId) => {
    const segments: FrontierSegment[] = [];
    byLandmass.forEach((rawCells, landmass) => {
      const cellsOnFrontier = Array.from(new Set(rawCells));
      const [cx, cy] = getBorderAnchor(cellsOnFrontier, cells.p);
      const meanDanger =
        cellsOnFrontier.reduce((total, cellId) => {
          const frontierDanger = (cells.c[cellId] ?? [])
            .filter(neighborId => cells.h[neighborId] >= 20 && cells.state[neighborId] === 0)
            .reduce((highest, neighborId) => Math.max(highest, cells.danger?.[neighborId] ?? 0), 0);
          return total + frontierDanger;
        }, 0) / cellsOnFrontier.length;
      segments.push({
        neighborState: 0,
        relation: "Unclaimed",
        threatWeight: UNCLAIMED_FRONTIER_BASE_THREAT + (meanDanger / 255) * UNCLAIMED_FRONTIER_DANGER_WEIGHT,
        cells: cellsOnFrontier,
        cx,
        cy,
        landmass,
        origin: "unclaimed"
      });
    });
    if (segments.length) result.set(stateId, segments);
  });

  return result;
}

/**
 * Sea-going counterpart to analyzeFrontiers(): groups each state's own port cells by
 * (hostile-ish neighbor, own port's landmass), where "reachable" comes from the charted
 * sea-route graph (seaRouteGraph.ts) instead of cell adjacency. Two states separated by
 * open, uncharted water get no segment at all — same "no border, no segment" rule as the
 * land version, just gated by a shipping lane instead of a shared coastline.
 *
 * `landmass` on the returned segments is the *attacker's own* landmass (where its ports —
 * and therefore its fleet — actually are), not the target's, so these segments slot
 * directly into landmass-filtered callers like military-generator.ts's
 * `redistributeGarrisons` and `pickPrimaryFrontier`. See docs/plan/naval-sea-lanes.md §2.1.
 */
export function analyzeSeaFrontiers(
  pack: PackedGraph,
  seaRouteGraph: SeaRouteGraph,
  currentYear: number
): Map<number, FrontierSegment[]> {
  const { cells, states, burgs } = pack;

  const allPorts = burgs.filter(b => b.i && !b.removed && b.state && b.port);
  const portsByState = new Map<number, typeof allPorts>();
  for (const port of allPorts) {
    const owner = port.state!;
    if (!portsByState.has(owner)) portsByState.set(owner, []);
    portsByState.get(owner)!.push(port);
  }

  const result = new Map<number, FrontierSegment[]>();

  portsByState.forEach((ownPorts, s) => {
    const state = states[s];
    if (!state) return;

    const byKey = new Map<string, { neighborState: number; landmass: number; cells: Set<number> }>();

    for (const ownPort of ownPorts) {
      const reachable = findReachableCells(seaRouteGraph, ownPort.cell);
      if (!reachable.size) continue;
      const landmass = cells.f[ownPort.cell];

      for (const otherPort of allPorts) {
        if (otherPort.state === s) continue;
        if (!reachable.has(otherPort.cell)) continue;

        const t = otherPort.state!;
        const key = `${t}:${landmass}`;
        if (!byKey.has(key)) byKey.set(key, { neighborState: t, landmass, cells: new Set() });
        byKey.get(key)!.cells.add(ownPort.cell);
      }
    }

    const segments: FrontierSegment[] = [];

    byKey.forEach(({ neighborState: t, landmass, cells: cellSet }) => {
      const threatWeight = getThreatWeight(state, t, currentYear);
      if (threatWeight <= 0) return;

      const borderCells = Array.from(cellSet);
      const [cx, cy] = getBorderAnchor(borderCells, cells.p);

      segments.push({
        neighborState: t,
        relation: getRelationLabel(state, t) ?? "Unknown",
        threatWeight,
        cells: borderCells,
        cx,
        cy,
        landmass,
        origin: "sea"
      });
    });

    if (segments.length) result.set(s, segments);
  });

  return result;
}

/** Merges multiple frontier maps (e.g. land + sea) into one, concatenating segment lists per state. */
export function mergeFrontiers(...maps: Map<number, FrontierSegment[]>[]): Map<number, FrontierSegment[]> {
  const result = new Map<number, FrontierSegment[]>();
  for (const map of maps) {
    map.forEach((segments, stateId) => {
      result.set(stateId, (result.get(stateId) ?? []).concat(segments));
    });
  }
  return result;
}

/**
 * Collects every burg that appears as an attacker/defender's nearest burg
 * (`fromBurg`/`toBurg`) in the war chronicle — i.e. towns that were actually
 * fought over, not just any border town.
 */
export function getChronicleContestedBurgs(pack: PackedGraph): Set<number> {
  const contested = new Set<number>();
  const chronicle = pack.states[0]?.diplomacy as unknown[] | undefined;
  if (!chronicle) return contested;

  for (const war of chronicle) {
    if (!Array.isArray(war)) continue;
    for (const entry of war) {
      if (!entry || typeof entry !== "object") continue;
      const event = entry as ChronicleEvent;
      if (event.fromBurg) contested.add(event.fromBurg);
      if (event.toBurg) contested.add(event.toBurg);
    }
  }

  return contested;
}

/**
 * Picks the frontier segment a unit at (x, y) should garrison toward: the one
 * with the best combination of threat weight and proximity.
 */
export function pickPrimaryFrontier(x: number, y: number, segments: FrontierSegment[]): FrontierSegment | null {
  if (!segments.length) return null;

  let best: FrontierSegment | null = null;
  let bestScore = -Infinity;
  for (const segment of segments) {
    const dist = Math.hypot(segment.cx - x, segment.cy - y);
    const score = segment.threatWeight / (1 + dist / 1000);
    if (score > bestScore) {
      bestScore = score;
      best = segment;
    }
  }
  return best;
}

/** Normalizes a raw habitability score against the map's populated-cell range, clamped to [0, 1]. */
export function normalizeHabitability(score: number, meanScore: number, maxScore: number): number {
  if (maxScore <= meanScore) return 0;
  return minmax((score - meanScore) / (maxScore - meanScore), 0, 1);
}

export interface ProvinceThreat {
  totalWeight: number;
  /** The single hostile neighbor this province's border cells are most threatened by. */
  primaryNeighbor: number;
}

/**
 * Aggregates a state's frontier segments by province: for every border cell that
 * belongs to a province (`cells.province` — 0 means "no province"), sums the
 * threat weight of every segment touching it and tracks whichever neighbor
 * contributes the most weight. Used to decide which provinces are "frontier"
 * provinces and which single hostile direction each one should reinforce.
 */
export function getProvinceThreats(pack: PackedGraph, segments: FrontierSegment[]): Map<number, ProvinceThreat> {
  const { cells } = pack;
  const result = new Map<number, ProvinceThreat>();
  const neighborWeightByProvince = new Map<number, Map<number, number>>();

  for (const segment of segments) {
    // A segment contributes its threat weight once per province it touches — not once per
    // border cell — so a longer shared border doesn't inflate the weight beyond the relation.
    const provincesTouched = new Set<number>();
    for (const cellId of segment.cells) {
      const province = cells.province[cellId];
      if (province) provincesTouched.add(province);
    }

    for (const province of provincesTouched) {
      if (!neighborWeightByProvince.has(province)) neighborWeightByProvince.set(province, new Map());
      const byNeighbor = neighborWeightByProvince.get(province)!;
      byNeighbor.set(segment.neighborState, (byNeighbor.get(segment.neighborState) ?? 0) + segment.threatWeight);
    }
  }

  neighborWeightByProvince.forEach((byNeighbor, province) => {
    let totalWeight = 0;
    let primaryNeighbor = -1;
    let primaryWeight = -Infinity;
    byNeighbor.forEach((weight, neighborState) => {
      totalWeight += weight;
      if (weight > primaryWeight) {
        primaryWeight = weight;
        primaryNeighbor = neighborState;
      }
    });
    result.set(province, { totalWeight, primaryNeighbor });
  });

  return result;
}
