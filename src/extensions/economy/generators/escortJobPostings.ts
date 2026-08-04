/**
 * Burg-posted escort (護衛) job board — all culture sets.
 * Protects trade caravans and travelers between cities.
 *
 * Fee = f(travel days, route danger, bandits, beasts) × market-rate variance.
 */
import { findCell, rn } from "../../hostUtils";
import {
  getEscortActiveContracts,
  getEscortHireApplications,
  getEscortJobPostings,
  getSimulationDay,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  setEscortActiveContracts,
  setEscortCooldowns,
  setEscortHireApplications,
  setEscortJobPostings
} from "../economyContext";
import { CaravanMovement } from "./caravanMovement";
import type { EscortJobPosting, EscortKind, EscortTransport } from "./escortHireTypes";
import {
  computeBaseEscortFee,
  computeRouteThreat,
  FOOT_SPEED_MULTIPLIER,
  finalizeEscortFee,
  marketRateFromSeed
} from "./escortRouteThreat";
import { calculateRouteDurationDays } from "./tradeRouteDuration";
import { TradeRoutePlanner } from "./tradeRoutePlanner";
import { TradeSecurity } from "./tradeSecurity";
import { UrbanLaborIntake } from "./urbanLaborIntake";

export const ESCORT_MAX_POSTINGS_PER_BURG = 2;
export const ESCORT_MAX_POSTINGS_PER_STATE = 10;
export const ESCORT_POST_EXPIRE_DAYS = 40;
export const ESCORT_PLAYER_HIRE_LAG_DAYS = 5;
export const ESCORT_ANON_HIRE_LAG_DAYS = 8;
export const ESCORT_ANON_ROUND_DAYS = 12;
export const ESCORT_INJURY_COOLDOWN_DAYS = 20;
export const ESCORT_INJURY_WEALTH_LOSS = 0.4;
export const ESCORT_BOARD_REFRESH_DAYS = 25;
/** Soft treasury floor kept after escrow (same spirit as HUNT_RESERVE). */
export const ESCORT_TREASURY_RESERVE = 2;
/** Cap mission days so long sea routes do not lock PCs forever. */
export const ESCORT_MAX_MISSION_DAYS = 45;
export const ESCORT_MIN_MISSION_DAYS = 2;
/** Max destination candidates scanned per origin burg. */
const MAX_DEST_CANDIDATES = 8;
/** Prefer destinations within this many caravan-days when ranking. */
const PREFERRED_MAX_DAYS = 28;

let daysSinceBoardRefresh = 0;

export function getSimulationOrdinalDay(): number {
  return getSimulationYear() * 365 + (getSimulationMonth() - 1) * 30 + getSimulationDay();
}

export function clearEscortHireState(): void {
  setEscortJobPostings([]);
  setEscortHireApplications([]);
  setEscortActiveContracts([]);
  setEscortCooldowns({});
  daysSinceBoardRefresh = 0;
}

function nextPostingId(posts: readonly EscortJobPosting[]): number {
  let max = 0;
  for (const post of posts) max = Math.max(max, post.i);
  return max + 1;
}

function isBurgEligible(burg: {
  i?: number;
  removed?: boolean | number;
  state?: number;
  cell?: number;
  group?: string;
}): boolean {
  if (!burg?.i || burg.removed) return false;
  if (!(burg.state && burg.state > 0)) return false;
  // Forts rarely post civilian escorts; allow only towns/cities/ports.
  if (burg.group === "fort") return false;
  return burg.cell != null;
}

interface RouteProbe {
  missionDays: number;
  dangerSamples: number[];
  frontierShare: number;
}

/**
 * Probe origin→dest trade route for duration and land-cell danger samples.
 * Returns null when no path exists.
 */
export function probeEscortRoute(originCell: number, destCell: number, transport: EscortTransport): RouteProbe | null {
  const path = TradeRoutePlanner.findRoutePath(originCell, destCell);
  if (!path?.segments?.length) return null;

  const world = getWorldContext();
  const distanceScale = world.distanceScale || 1;
  let missionDays = calculateRouteDurationDays(path.segments, distanceScale);
  if (!Number.isFinite(missionDays) || missionDays <= 0) return null;

  if (transport === "foot") {
    // Pedestrian: scale total days (sea legs rare for pure foot; still inflate whole trip).
    missionDays = missionDays / FOOT_SPEED_MULTIPLIER;
  }

  missionDays = Math.max(ESCORT_MIN_MISSION_DAYS, Math.min(ESCORT_MAX_MISSION_DAYS, Math.ceil(missionDays)));

  const cells = world.pack.cells;
  const dangerSamples: number[] = [];
  let landCells = 0;
  let wildCells = 0;
  const seen = new Set<number>();

  for (const segment of path.segments) {
    if (segment.type !== "land") continue;
    // Sample every other point to keep board rebuild cheap on long roads.
    for (let i = 0; i < segment.points.length; i += 2) {
      const [x, y] = segment.points[i];
      let cellId: number;
      try {
        cellId = findCell(x, y);
      } catch {
        continue;
      }
      if (!Number.isInteger(cellId) || cellId < 0 || !cells || cellId >= cells.i.length) continue;
      if (seen.has(cellId)) continue;
      seen.add(cellId);
      landCells += 1;
      dangerSamples.push(cells.danger?.[cellId] ?? 0);
      const owner = cells.state?.[cellId] ?? 0;
      if (!owner) wildCells += 1;
    }
  }

  // Fallback: sample origin/dest cells when path has no land samples (sea-only).
  if (!dangerSamples.length) {
    dangerSamples.push(cells?.danger?.[originCell] ?? 0, cells?.danger?.[destCell] ?? 0);
    landCells = 2;
    if (!(cells?.state?.[originCell] ?? 0)) wildCells += 1;
    if (!(cells?.state?.[destCell] ?? 0)) wildCells += 1;
  }

  return {
    missionDays,
    dangerSamples,
    frontierShare: landCells > 0 ? wildCells / landCells : 0
  };
}

function banditPressureForBurg(burgId: number): number {
  const burg = getWorldContext().pack.burgs?.[burgId];
  if (!burg?.state) return 0;
  const byState = UrbanLaborIntake.getBanditPressureByState();
  // Destination bandit risk (TradeSecurity) plus origin state pressure.
  const destRisk = TradeSecurity.getBanditRiskPerDay(burgId, 0);
  // Map per-day risk (~0.001 scale) into 0..1 pressure contribution.
  const fromRisk = Math.min(1, destRisk * 400);
  const fromCohorts = byState.get(burg.state) ?? 0;
  return Math.max(fromRisk, fromCohorts);
}

function stateCanFundFee(treasury: number, feePartial: number): boolean {
  return treasury >= feePartial * 0.5 + ESCORT_TREASURY_RESERVE;
}

function buildLabel(kind: EscortKind, transport: EscortTransport, destName: string, marketRate: string): string {
  const vehicle = transport === "foot" ? "on foot" : "caravan";
  if (kind === "trade") return `Escort ${vehicle} to ${destName} (${marketRate})`;
  return `Escort travelers ${vehicle} to ${destName} (${marketRate})`;
}

/**
 * Drop expired / invalid postings and free related applications.
 */
export function pruneInvalidEscortPostings(): void {
  const world = getWorldContext();
  const posts = getEscortJobPostings();
  const kept: EscortJobPosting[] = [];
  const keptIds = new Set<number>();

  for (const post of posts) {
    if (post.expiresInDays <= 0) continue;
    const origin = world.pack.burgs?.[post.burgId];
    const dest = world.pack.burgs?.[post.destinationBurgId];
    if (!origin?.i || origin.removed || !dest?.i || dest.removed) continue;
    kept.push(post);
    keptIds.add(post.i);
  }
  if (kept.length !== posts.length) setEscortJobPostings(kept);

  const apps = getEscortHireApplications().filter(app => keptIds.has(app.postingId));
  if (apps.length !== getEscortHireApplications().length) setEscortHireApplications(apps);
}

/**
 * Rebuild / top-up escort board. Works for every culturesSet (no fantasy gate).
 */
export function rebuildEscortJobPostings(options?: { clearAll?: boolean }): void {
  if (options?.clearAll) clearEscortHireState();
  else pruneInvalidEscortPostings();

  const world = getWorldContext();
  const burgs = world.pack?.burgs;
  const states = world.pack?.states;
  if (!burgs?.length || !states?.length) return;

  // Ensure trade security ledgers exist so bandit risk is defined.
  if (!TradeSecurity.getLedger(1) && states.some(s => s?.i && !s.removed)) {
    try {
      TradeSecurity.generate();
    } catch {
      // Unit tests without full economy slice may skip.
    }
  }

  const ordinal = getSimulationOrdinalDay();
  const existing = [...getEscortJobPostings()];
  const countByBurg = new Map<number, number>();
  const countByState = new Map<number, number>();
  const pairKeys = new Set<string>();

  for (const post of existing) {
    countByBurg.set(post.burgId, (countByBurg.get(post.burgId) ?? 0) + 1);
    countByState.set(post.stateId, (countByState.get(post.stateId) ?? 0) + 1);
    pairKeys.add(`${post.burgId}->${post.destinationBurgId}:${post.kind}`);
  }

  let nextId = nextPostingId(existing);
  const created: EscortJobPosting[] = [];

  const eligible = burgs.filter(isBurgEligible);
  // Larger / capital-ish first so major towns get boards before hamlets.
  eligible.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));

  for (const origin of eligible) {
    const burgId = origin.i!;
    const stateId = origin.state!;
    const state = states[stateId];
    if (!state?.i || state.removed) continue;

    let burgCount = countByBurg.get(burgId) ?? 0;
    let stateCount = countByState.get(stateId) ?? 0;
    if (burgCount >= ESCORT_MAX_POSTINGS_PER_BURG) continue;
    if (stateCount >= ESCORT_MAX_POSTINGS_PER_STATE) continue;

    const destinations = eligible
      .filter(d => d.i !== burgId && d.i != null)
      .map(d => {
        // Cheap distance proxy before pathfinding.
        const dx = (d.x ?? 0) - (origin.x ?? 0);
        const dy = (d.y ?? 0) - (origin.y ?? 0);
        return { burg: d, dist2: dx * dx + dy * dy };
      })
      .sort((a, b) => a.dist2 - b.dist2)
      .slice(0, MAX_DEST_CANDIDATES);

    let destIndex = 0;
    for (const { burg: dest } of destinations) {
      if (burgCount >= ESCORT_MAX_POSTINGS_PER_BURG) break;
      if (stateCount >= ESCORT_MAX_POSTINGS_PER_STATE) break;

      // Alternate trade / traveler kinds for variety.
      const kind: EscortKind = destIndex % 2 === 0 ? "trade" : "traveler";
      destIndex += 1;
      const transport: EscortTransport = kind === "traveler" && destIndex % 3 === 0 ? "foot" : "caravan";

      const pairKey = `${burgId}->${dest.i}:${kind}`;
      if (pairKeys.has(pairKey)) continue;

      const originCell = origin.cell!;
      const destCell = dest.cell!;
      const probe = probeEscortRoute(originCell, destCell, transport);
      if (!probe) continue;
      if (probe.missionDays > PREFERRED_MAX_DAYS && burgCount > 0) continue;

      const banditThreat = Math.max(banditPressureForBurg(burgId), banditPressureForBurg(dest.i!));
      const threat = computeRouteThreat({
        dangerSamples: probe.dangerSamples,
        banditPressure: banditThreat,
        frontierWildernessShare: probe.frontierShare
      });

      const seed = burgId * 10_007 + dest.i! * 97 + ordinal + (kind === "trade" ? 0 : 3);
      const { rate, mult } = marketRateFromSeed(seed);
      const baseFee = computeBaseEscortFee({
        missionDays: probe.missionDays,
        threatScore: threat.threatScore,
        kind,
        transport
      });
      const { fee, feePartial } = finalizeEscortFee(baseFee, mult);

      if (!stateCanFundFee(state.treasury ?? 0, feePartial)) continue;

      const destName = dest.name || `Burg ${dest.i}`;
      const post: EscortJobPosting = {
        i: nextId++,
        burgId,
        stateId,
        destinationBurgId: dest.i!,
        kind,
        transport,
        missionDays: probe.missionDays,
        threat,
        fee,
        feePartial,
        marketRate: rate,
        rateMultiplier: mult,
        openSeats: 1,
        postedAtDay: ordinal,
        expiresInDays: ESCORT_POST_EXPIRE_DAYS,
        label: buildLabel(kind, transport, destName, rate)
      };
      created.push(post);
      pairKeys.add(pairKey);
      burgCount += 1;
      stateCount += 1;
      countByBurg.set(burgId, burgCount);
      countByState.set(stateId, stateCount);
    }
  }

  if (created.length) setEscortJobPostings([...existing, ...created]);
}

export function tickEscortJobBoard(deltaDays: number): void {
  if (!(deltaDays > 0)) return;

  const posts = getEscortJobPostings();
  if (posts.length) {
    setEscortJobPostings(
      posts.map(post => ({
        ...post,
        expiresInDays: post.expiresInDays - deltaDays
      }))
    );
  }

  daysSinceBoardRefresh += deltaDays;
  while (daysSinceBoardRefresh >= ESCORT_BOARD_REFRESH_DAYS) {
    daysSinceBoardRefresh -= ESCORT_BOARD_REFRESH_DAYS;
    pruneInvalidEscortPostings();
    rebuildEscortJobPostings();
  }
  pruneInvalidEscortPostings();
}

export function getLiveEscortOpenSeats(postingId: number): number {
  const post = getEscortJobPostings().find(p => p.i === postingId);
  if (!post) return 0;
  let reserved = 0;
  for (const app of getEscortHireApplications()) {
    if (app.postingId === postingId) reserved += 1;
  }
  for (const contract of getEscortActiveContracts()) {
    if (contract.postingId === postingId) reserved += 1;
  }
  return Math.max(0, post.openSeats - reserved);
}

export function getEscortJobPostingById(postingId: number): EscortJobPosting | null {
  return getEscortJobPostings().find(p => p.i === postingId) ?? null;
}

export function getEscortJobPostingsForBurg(burgId: number): EscortJobPosting[] {
  return getEscortJobPostings().filter(p => p.burgId === burgId && p.expiresInDays > 0);
}

export function formatEscortJobPostingsForBurg(burgId: number): string {
  const posts = getEscortJobPostingsForBurg(burgId);
  if (!posts.length) return "—";
  const open = posts.filter(p => getLiveEscortOpenSeats(p.i) > 0);
  if (!open.length) return `${posts.length} listing(s), none open`;
  const labels = open.slice(0, 3).map(p => `${p.label} · ${rn(p.fee, 2)}`);
  const more = open.length > 3 ? ` +${open.length - 3}` : "";
  return `${open.length} open: ${labels.join("; ")}${more}`;
}

/** Expose movement options for tests that stub routes without full planner. */
export function getCaravanLandKmPerDay(): number {
  return CaravanMovement.getOptions().landKmPerDay;
}
