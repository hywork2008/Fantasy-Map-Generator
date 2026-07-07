import { mean } from "d3";
import type { ChronicleEvent } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { minmax } from "../utils";

/**
 * Threat weight per diplomatic relation, used only to score how much a border
 * deserves a garrison/fortress. Deliberately separate from military-generator's
 * `rate` table, which scores overall state alert (and includes negative weights
 * for friendly relations) — a different concern from "where is the frontier."
 */
const RELATION_THREAT_WEIGHT: Record<string, number> = {
  Enemy: 1,
  Rival: 0.5,
  Suspicion: 0.2
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
}

/**
 * Groups each state's border cells by hostile neighbor, weighted by relation
 * and boosted for active/recent wars (from `state.campaigns`). Non-hostile
 * borders (Ally, Neutral, Friendly, Vassal, Suzerain, Unknown, …) are omitted
 * entirely, so peaceful states resolve to no segments at all.
 */
export function analyzeFrontiers(pack: PackedGraph, currentYear: number): Map<number, FrontierSegment[]> {
  const { cells, states } = pack;
  const cellsByNeighbor = new Map<number, Map<number, number[]>>();

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const s = cells.state[i];
    if (!s) continue;

    for (const c of cells.c[i]) {
      if (cells.h[c] < 20) continue;
      const t = cells.state[c];
      if (!t || t === s) continue;

      if (!cellsByNeighbor.has(s)) cellsByNeighbor.set(s, new Map());
      const byNeighbor = cellsByNeighbor.get(s)!;
      if (!byNeighbor.has(t)) byNeighbor.set(t, []);
      byNeighbor.get(t)!.push(i);
    }
  }

  const result = new Map<number, FrontierSegment[]>();

  cellsByNeighbor.forEach((byNeighbor, s) => {
    const state = states[s];
    const segments: FrontierSegment[] = [];

    byNeighbor.forEach((rawCells, t) => {
      const relation = state.diplomacy?.[t];
      const relationLabel = typeof relation === "string" ? relation : undefined;
      const baseWeight = relationLabel ? (RELATION_THREAT_WEIGHT[relationLabel] ?? 0) : 0;
      if (baseWeight <= 0) return;

      const hasActiveOrRecentWar = state.campaigns?.some(
        c => (c.attacker === t || c.defender === t) && (c.end === undefined || currentYear - c.end <= RECENT_WAR_YEARS)
      );
      const threatWeight = hasActiveOrRecentWar ? baseWeight * ACTIVE_WAR_BOOST : baseWeight;

      const borderCells = Array.from(new Set(rawCells));
      const cx = mean(borderCells.map(c => cells.p[c][0])) ?? 0;
      const cy = mean(borderCells.map(c => cells.p[c][1])) ?? 0;

      segments.push({
        neighborState: t,
        relation: relationLabel ?? "Unknown",
        threatWeight,
        cells: borderCells,
        cx,
        cy
      });
    });

    if (segments.length) result.set(s, segments);
  });

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
