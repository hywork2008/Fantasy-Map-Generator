import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { buildSeaRouteGraph, findSeaRouteDistance } from "./seaRouteGraph";

export interface TacticalTargetResult {
  fromBurg?: Burg;
  toBurg?: Burg;
  tacticalRole: "concentrated" | "divide";
}

/**
 * Checks if stateA and stateB are genuinely connected by sea.
 * Both states must have ports, and their ports must share the same navigable ocean
 * (or have a charted sea route between them if routes exist).
 */
export function areStatesSeaConnected(pack: PackedGraph, stateA: number, stateB: number): boolean {
  if (!stateA || !stateB || stateA === stateB) return false;

  const portsA = (pack.burgs || []).filter(b => b && b.state === stateA && b.port && !b.removed);
  const portsB = (pack.burgs || []).filter(b => b && b.state === stateB && b.port && !b.removed);
  if (!portsA.length || !portsB.length) return false;

  // If routes are already generated, check charted sea route connectivity
  const hasSearoutes = pack.routes?.some(r => r.group === "searoutes" && r.navigation !== "river");
  if (hasSearoutes) {
    const seaGraph = buildSeaRouteGraph(pack);
    for (const pa of portsA) {
      if (!seaGraph.adjacency.has(pa.cell)) continue;
      for (const pb of portsB) {
        if (!seaGraph.adjacency.has(pb.cell)) continue;
        const dist = findSeaRouteDistance(seaGraph, pa.cell, pb.cell);
        if (dist !== null) return true;
      }
    }
    return false;
  }

  // Pre-routes fallback: verify ports share at least one navigable water/ocean body
  const getWaterFeatures = (ports: typeof portsA) => {
    const featureIds = new Set<number>();
    for (const b of ports) {
      const haven = pack.cells.haven?.[b.cell];
      if (haven !== undefined && haven > 0 && pack.cells.h[haven] < 20) {
        featureIds.add(pack.cells.f[haven]);
      } else {
        // Look at neighboring water cells
        for (const c of pack.cells.c[b.cell] || []) {
          if (pack.cells.h[c] < 20) {
            featureIds.add(pack.cells.f[c]);
          }
        }
      }
    }
    return featureIds;
  };

  const featuresA = getWaterFeatures(portsA);
  const featuresB = getWaterFeatures(portsB);

  for (const fId of featuresA) {
    if (featuresB.has(fId)) {
      // Ignore small freshwater lakes unless large ocean/sea
      const feat = pack.features?.[fId];
      if (!feat || feat.type === "ocean") return true;
    }
  }

  return false;
}

/**
 * Finds all border cells directly between stateA and stateB.
 */
export function findBorderCells(
  pack: PackedGraph,
  stateA: number,
  stateB: number
): { borderCellsA: number[]; borderCellsB: number[] } {
  const { cells } = pack;
  const borderCellsA: number[] = [];
  const borderCellsB: number[] = [];
  const seenA = new Set<number>();
  const seenB = new Set<number>();

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const s = cells.state[i];
    if (s !== stateA && s !== stateB) continue;

    for (const c of cells.c[i]) {
      if (cells.h[c] < 20) continue;
      const neighborState = cells.state[c];
      if (s === stateA && neighborState === stateB && !seenA.has(i)) {
        borderCellsA.push(i);
        seenA.add(i);
        break;
      } else if (s === stateB && neighborState === stateA && !seenB.has(i)) {
        borderCellsB.push(i);
        seenB.add(i);
        break;
      }
    }
  }

  return { borderCellsA, borderCellsB };
}

/**
 * Finds and sorts burgs belonging to `stateId` by proximity to the border with `targetStateId`.
 * For non-adjacent nations (e.g. naval expeditions), ports are strongly preferred.
 */
export function findBorderBurgs(pack: PackedGraph, stateId: number, targetStateId: number): Burg[] {
  const stateBurgs = (pack.burgs || []).filter(b => b && b.state === stateId && !b.removed);
  if (!stateBurgs.length) return [];

  const { borderCellsA } = findBorderCells(pack, stateId, targetStateId);

  if (borderCellsA.length > 0) {
    // Directly bordering: calculate distance to closest border cell
    const scoredBurgs = stateBurgs.map(b => {
      let minDistSq = Infinity;
      for (const c of borderCellsA) {
        const [cx, cy] = pack.cells.p[c];
        const dx = b.x - cx;
        const dy = b.y - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) minDistSq = distSq;
      }
      return { burg: b, score: minDistSq };
    });

    scoredBurgs.sort((a, b) => a.score - b.score);
    return scoredBurgs.map(sb => sb.burg);
  }

  // Non-adjacent border (distant or maritime nations):
  // Prefer ports first, then proximity to target state's center
  const targetCenterCell = pack.states?.[targetStateId]?.center;
  const targetCenter =
    targetCenterCell !== undefined && pack.cells.p[targetCenterCell] ? pack.cells.p[targetCenterCell] : [0, 0];

  const scoredBurgs = stateBurgs.map(b => {
    const dx = b.x - targetCenter[0];
    const dy = b.y - targetCenter[1];
    const distSq = dx * dx + dy * dy;
    // Port bonus: prioritize ports by dramatically reducing sort distance
    const portMultiplier = b.port ? 0.05 : 1.0;
    return { burg: b, score: distSq * portMultiplier };
  });

  scoredBurgs.sort((a, b) => a.score - b.score);
  return scoredBurgs.map(sb => sb.burg);
}

/**
 * Finds the frontline target burg in the defender's territory facing the attacker.
 * - For direct land neighbors: picks the outermost border burg directly facing the attacker
 *   (minimizing distance to the shared border, so the attacker does not bypass or penetrate deep behind enemy cities).
 * - For maritime / naval wars: picks the defender port directly facing the attacker across the sea
 *   (minimizing distance to attacker's ports, avoiding circumnavigation to the opposite/back coast).
 */
export function findFrontlineTargetBurg(
  pack: PackedGraph,
  defenderStateId: number,
  attackerStateId: number
): Burg | undefined {
  const defenderBurgs = (pack.burgs || []).filter(b => b && b.state === defenderStateId && !b.removed);
  if (!defenderBurgs.length) return undefined;

  const { borderCellsA } = findBorderCells(pack, defenderStateId, attackerStateId);

  if (borderCellsA.length > 0) {
    // Direct land border: find burg closest to the shared border cells facing attacker
    let bestBurg = defenderBurgs[0];
    let bestDistSq = Infinity;

    for (const b of defenderBurgs) {
      let minDistToBorder = Infinity;
      for (const c of borderCellsA) {
        const [cx, cy] = pack.cells.p[c];
        const dx = b.x - cx;
        const dy = b.y - cy;
        const dSq = dx * dx + dy * dy;
        if (dSq < minDistToBorder) minDistToBorder = dSq;
      }
      if (minDistToBorder < bestDistSq) {
        bestDistSq = minDistToBorder;
        bestBurg = b;
      }
    }
    return bestBurg;
  }

  // Maritime / naval: find defender port directly facing attacker's embarkation ports
  const attackerPorts = (pack.burgs || []).filter(b => b && b.state === attackerStateId && b.port && !b.removed);
  const defenderPorts = defenderBurgs.filter(b => b.port);

  if (defenderPorts.length > 0 && attackerPorts.length > 0) {
    let bestPort = defenderPorts[0];
    let minNauticalDistSq = Infinity;

    for (const dp of defenderPorts) {
      for (const ap of attackerPorts) {
        const dx = dp.x - ap.x;
        const dy = dp.y - ap.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < minNauticalDistSq) {
          minNauticalDistSq = dSq;
          bestPort = dp;
        }
      }
    }
    return bestPort;
  }

  // Fallback: closest burg to attacker's center or first burg
  const attackerCenterCell = pack.states?.[attackerStateId]?.center;
  const [acx, acy] =
    attackerCenterCell !== undefined && pack.cells.p[attackerCenterCell] ? pack.cells.p[attackerCenterCell] : [0, 0];

  let closestBurg = defenderBurgs[0];
  let minCenterDistSq = Infinity;
  for (const b of defenderBurgs) {
    const dx = b.x - acx;
    const dy = b.y - acy;
    const dSq = dx * dx + dy * dy;
    if (dSq < minCenterDistSq) {
      minCenterDistSq = dSq;
      closestBurg = b;
    }
  }
  return closestBurg;
}

/**
 * Finds the nearest staging city in the attacker's territory to the target city.
 * Armies mobilize from their nearest border garrison/base rather than marching
 * across the entire homeland from a distant interior capital.
 */
export function findStagingBurg(
  pack: PackedGraph,
  attackerStateId: number,
  targetBurg?: Burg,
  preferPort = false
): Burg | undefined {
  const allAttackerBurgs = (pack.burgs || []).filter(b => b && b.state === attackerStateId && !b.removed);
  if (!allAttackerBurgs.length) return undefined;

  const candidateBurgs =
    preferPort && allAttackerBurgs.some(b => b.port) ? allAttackerBurgs.filter(b => b.port) : allAttackerBurgs;

  if (!targetBurg) return candidateBurgs[0];

  let nearestBurg = candidateBurgs[0];
  let minDistanceSq = Infinity;

  for (const b of candidateBurgs) {
    const dx = b.x - targetBurg.x;
    const dy = b.y - targetBurg.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      nearestBurg = b;
    }
  }

  return nearestBurg;
}

/**
 * Resolves the primary border burg endpoints for the war leader.
 * - Target city: frontline city facing the attacker.
 * - Staging city: nearest city in the attacker realm to that target city.
 */
export function resolveLeaderWarEndpoints(
  pack: PackedGraph,
  attacker: number,
  defender: number
): { fromBurg?: Burg; toBurg?: Burg } {
  const isDirectNeighbor =
    findBorderCells(pack, attacker, defender).borderCellsA.length > 0 ||
    (pack.states?.[attacker]?.neighbors?.includes(defender) ?? false);
  const isNaval = !isDirectNeighbor && areStatesSeaConnected(pack, attacker, defender);

  const toBurg = findFrontlineTargetBurg(pack, defender, attacker);
  const fromBurg = findStagingBurg(pack, attacker, toBurg, isNaval);

  return { fromBurg, toBurg };
}

/**
 * Resolves target burg for an allied attacker, choosing between concentrating on the leader's target
 * or opening a second front at another border city to divide enemy defenses.
 * - Allies only attack frontline cities facing them directly.
 * - The staging city is the ally's closest base to that target city.
 */
export function resolveAlliedAttackerTarget(
  pack: PackedGraph,
  allyStateId: number,
  defenderStateId: number,
  leaderTargetBurg?: Burg,
  options?: { preferredRole?: "concentrated" | "divide"; randomFn?: () => number }
): TacticalTargetResult {
  const { borderCellsA } = findBorderCells(pack, defenderStateId, allyStateId);
  const isDirectNeighbor =
    borderCellsA.length > 0 || (pack.states?.[allyStateId]?.neighbors?.includes(defenderStateId) ?? false);
  const isNaval = !isDirectNeighbor && areStatesSeaConnected(pack, allyStateId, defenderStateId);
  const rand = options?.randomFn ?? Math.random;

  const allyFrontlineTarget = findFrontlineTargetBurg(pack, defenderStateId, allyStateId);

  // If directly neighboring, check if leaderTargetBurg is also a frontline city facing allyStateId
  let canConcentrate = false;
  if (leaderTargetBurg && isDirectNeighbor) {
    if (borderCellsA.length > 0) {
      let distToAllyBorder = Infinity;
      for (const c of borderCellsA) {
        const [cx, cy] = pack.cells.p[c];
        const dx = leaderTargetBurg.x - cx;
        const dy = leaderTargetBurg.y - cy;
        const dSq = dx * dx + dy * dy;
        if (dSq < distToAllyBorder) distToAllyBorder = dSq;
      }
      // If leader's target is reasonably close to ally's border, concentration without deep penetration is viable
      let allyFrontlineDist = Infinity;
      if (allyFrontlineTarget) {
        for (const c of borderCellsA) {
          const [cx, cy] = pack.cells.p[c];
          const dx = allyFrontlineTarget.x - cx;
          const dy = allyFrontlineTarget.y - cy;
          const dSq = dx * dx + dy * dy;
          if (dSq < allyFrontlineDist) allyFrontlineDist = dSq;
        }
      }
      canConcentrate = distToAllyBorder <= allyFrontlineDist * 2.25; // within 1.5x distance
    }
  } else if (leaderTargetBurg && isNaval) {
    // In naval wars, concentration is only valid if leader targeted the same facing port
    canConcentrate = allyFrontlineTarget ? leaderTargetBurg.i === allyFrontlineTarget.i : false;
  }

  let tacticalRole: "concentrated" | "divide" = "concentrated";
  if (options?.preferredRole) {
    tacticalRole = options.preferredRole;
  } else if (!canConcentrate) {
    tacticalRole = "divide";
  } else if (rand() < 0.5) {
    tacticalRole = "divide";
  }

  let toBurg = leaderTargetBurg;
  if (tacticalRole === "concentrated" && canConcentrate && leaderTargetBurg) {
    toBurg = leaderTargetBurg;
  } else {
    // Divide forces: open a second front at an alternative frontline burg if one exists
    const allyBorderBurgs = findBorderBurgs(pack, defenderStateId, allyStateId);
    const alternativeBurg = allyBorderBurgs.find(b => !leaderTargetBurg || b.i !== leaderTargetBurg.i);
    toBurg = alternativeBurg ?? allyFrontlineTarget ?? leaderTargetBurg;
  }

  const fromBurg = findStagingBurg(pack, allyStateId, toBurg, isNaval);

  return {
    fromBurg,
    toBurg,
    tacticalRole
  };
}
