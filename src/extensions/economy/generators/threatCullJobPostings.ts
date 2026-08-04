/**
 * Burg-posted threat cull / pest-control job board.
 * Spec: docs/plan/player-threat-cull-jobs.md PR-2.
 *
 * PR-2 ships postings + slice storage only (no apply/resolve — that is PR-3a/3b).
 */
import type { SimulationContext } from "../../../context/simulationContext";
import { collectStateBorderCells, MAX_HUNT_HOPS, minHopsBetween } from "../../../generators/huntGeometry";
import {
  annualHuntCostForRarity,
  type CullTargetRef,
  getCullTargetsNearBurg,
  HUNT_RESERVE,
  setupHuntCost
} from "../../../generators/threatCullEffects";
import { useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import {
  getCullActiveContracts,
  getCullHireApplications,
  getCullJobPostings,
  getSimulationContext,
  getSimulationDay,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  setCullActiveContracts,
  setCullCooldowns,
  setCullHireApplications,
  setCullJobPostings
} from "../economyContext";
import type { CullJobPosting } from "./threatCullHireTypes";

export const CULL_MAX_POSTINGS_PER_BURG = 3;
export const CULL_MAX_POSTINGS_PER_STATE = 12;
export const CULL_POST_EXPIRE_DAYS = 45;
export const CULL_PLAYER_HIRE_LAG_DAYS = 7;
export const CULL_ANON_HIRE_LAG_DAYS = 10;
export const CULL_ANON_ROUND_DAYS = 14;
export const CULL_INJURY_COOLDOWN_DAYS = 30;
export const CULL_INJURY_WEALTH_LOSS = 0.5;
/** When true, darkFantasy border forts may post cull jobs. */
export const CULL_ALLOW_BORDER_FORTS = true;
/** How often the board expires + refills (calendar days). */
export const CULL_BOARD_REFRESH_DAYS = 30;

/** Session accumulator for monthly board refresh (not persisted — fine for PR-2). */
let daysSinceBoardRefresh = 0;

export function getSimulationOrdinalDay(): number {
  return getSimulationYear() * 365 + (getSimulationMonth() - 1) * 30 + getSimulationDay();
}

export function computePostedBounty(rarity: number): { bounty: number; bountyPartial: number } {
  const setup = setupHuntCost(rarity);
  const bounty = rn(setup * 0.4 * (1 + 0.05 * (rarity - 1)), 2);
  const bountyPartial = rn(bounty * 0.4, 2);
  return { bounty, bountyPartial };
}

export function computeJoinMacroBounty(rarity: number): { bounty: number; bountyPartial: number } {
  const bounty = rn(annualHuntCostForRarity(rarity) * 0.25, 2);
  const bountyPartial = rn(bounty * 0.4, 2);
  return { bounty, bountyPartial };
}

export function uiDifficultyFromRarity(rarity: number): number {
  return Math.max(1, Math.min(5, Math.round(rarity)));
}

export function computeMissionDays(args: { hops: number; rarity: number; powerSnapshot: number }): number {
  const raw = 5 + args.hops * 2 + args.rarity * 3 + Math.floor(args.powerSnapshot / 5);
  return Math.max(5, Math.min(40, raw));
}

export function clearCullHireState(): void {
  setCullJobPostings([]);
  setCullHireApplications([]);
  setCullActiveContracts([]);
  setCullCooldowns({});
  daysSinceBoardRefresh = 0;
}

function nextPostingId(posts: readonly CullJobPosting[]): number {
  let max = 0;
  for (const post of posts) max = Math.max(max, post.i);
  return max + 1;
}

function isTargetStillValid(target: CullTargetRef, world: ReturnType<typeof getWorldContext>): boolean {
  if (target.kind === "monster") {
    if (target.monsterId === null) return false;
    const monster = (world.pack.monsters ?? []).find(m => m?.i === target.monsterId);
    return Boolean(monster && monster.power > 0);
  }
  // Pest / biomePredator: cell still land and had predator base at post time — keep while land.
  const cells = world.pack.cells;
  if (!cells || target.cellId < 0 || target.cellId >= cells.i.length) return false;
  return (cells.h[target.cellId] ?? 0) >= 20;
}

function findMacroCellId(stateId: number, monsterId: number | null, simulation: SimulationContext): number | null {
  if (monsterId === null) return null;
  for (const project of Object.values(simulation.wilderness?.cullProjects ?? {})) {
    if (project.stateId === stateId && project.monsterId === monsterId) return project.cellId;
  }
  return null;
}

function burgIsOnStateBorder(
  burgCell: number,
  stateId: number,
  cells: ReturnType<typeof getWorldContext>["pack"]["cells"]
): boolean {
  const borders = collectStateBorderCells(stateId, cells);
  if (borders.includes(burgCell)) return true;
  // Adjacent to a border cell counts for fort placement.
  return (cells.c[burgCell] ?? []).some(n => borders.includes(n));
}

function isBurgEligibleForCullBoard(
  burg: {
    i?: number;
    removed?: boolean | number;
    state?: number;
    group?: string;
    cell?: number;
  },
  cells: ReturnType<typeof getWorldContext>["pack"]["cells"],
  culturesSet: string
): boolean {
  if (!burg?.i || burg.removed) return false;
  const stateId = burg.state ?? 0;
  if (!(stateId > 0)) return false;
  if (burg.group === "fort") {
    if (!CULL_ALLOW_BORDER_FORTS || culturesSet !== "darkFantasy") return false;
    if (burg.cell == null || !burgIsOnStateBorder(burg.cell, stateId, cells)) return false;
  }
  return true;
}

function stateCanFundBounty(treasury: number, bountyPartial: number): boolean {
  // Need at least half partial + hunt reserve (escrow floor from design).
  return treasury >= bountyPartial * 0.5 + HUNT_RESERVE;
}

/**
 * Drop expired / invalid postings and free related applications (not active contracts —
 * those are PR-3 purge territory; PR-2 only drops apps whose posting vanished).
 */
export function pruneInvalidCullPostings(): void {
  const world = getWorldContext();
  const posts = getCullJobPostings();
  const kept: CullJobPosting[] = [];
  const keptIds = new Set<number>();

  for (const post of posts) {
    if (post.expiresInDays <= 0) continue;
    if (!isTargetStillValid(post.target, world)) continue;
    const burg = world.pack.burgs?.[post.burgId];
    if (!burg?.i || burg.removed) continue;
    kept.push(post);
    keptIds.add(post.i);
  }
  if (kept.length !== posts.length) setCullJobPostings(kept);

  const apps = getCullHireApplications().filter(app => keptIds.has(app.postingId));
  if (apps.length !== getCullHireApplications().length) setCullHireApplications(apps);
}

/**
 * Rebuild / top-up the cull job board to burg and state caps.
 * @param options.clearAll when true, wipes applications/contracts/cooldowns first (map generate).
 */
export function rebuildCullJobPostings(options?: { clearAll?: boolean }): void {
  if (options?.clearAll) clearCullHireState();
  else pruneInvalidCullPostings();

  const world = getWorldContext();
  const cells = world.pack?.cells;
  const burgs = world.pack?.burgs;
  const states = world.pack?.states;
  if (!cells || !burgs?.length || !states?.length) return;

  // simulationContext via economy API (may be null in pure unit tests).
  const live = getSimulationContext();
  const simulation = (live ?? {
    wilderness: { cullProjects: {}, lastEvaluatedYear: null },
    currentYear: getSimulationYear(),
    currentMonth: getSimulationMonth(),
    currentDay: getSimulationDay()
  }) as SimulationContext;
  const culturesSet = useOptionsState.getState().culturesSet ?? "world";
  const ordinal = getSimulationOrdinalDay();

  const existing = [...getCullJobPostings()];
  const reservedMonsters = new Set<number>();
  const reservedPestCells = new Set<number>();
  const countByBurg = new Map<number, number>();
  const countByState = new Map<number, number>();

  for (const post of existing) {
    countByBurg.set(post.burgId, (countByBurg.get(post.burgId) ?? 0) + 1);
    countByState.set(post.stateId, (countByState.get(post.stateId) ?? 0) + 1);
    if (post.target.monsterId != null) reservedMonsters.add(post.target.monsterId);
    if (post.target.kind === "pest" || post.target.kind === "biomePredator") {
      reservedPestCells.add(post.target.cellId);
    }
  }

  let nextId = nextPostingId(existing);
  const created: CullJobPosting[] = [];

  for (const burg of burgs) {
    if (!isBurgEligibleForCullBoard(burg, cells, culturesSet)) continue;
    const burgId = burg.i!;
    const stateId = burg.state!;
    const state = states[stateId];
    if (!state?.i || state.removed) continue;

    let burgCount = countByBurg.get(burgId) ?? 0;
    let stateCount = countByState.get(stateId) ?? 0;
    if (burgCount >= CULL_MAX_POSTINGS_PER_BURG) continue;
    if (stateCount >= CULL_MAX_POSTINGS_PER_STATE) continue;

    const targets = getCullTargetsNearBurg(world, simulation, burgId);
    for (const target of targets) {
      if (burgCount >= CULL_MAX_POSTINGS_PER_BURG) break;
      if (stateCount >= CULL_MAX_POSTINGS_PER_STATE) break;

      if (target.kind === "monster" && target.monsterId != null) {
        if (reservedMonsters.has(target.monsterId)) continue;
      } else if (target.kind === "pest" || target.kind === "biomePredator") {
        if (reservedPestCells.has(target.cellId)) continue;
      } else {
        // residualDanger out of scope for v1 posts
        continue;
      }

      const macroCellId = target.kind === "monster" ? findMacroCellId(stateId, target.monsterId, simulation) : null;
      const pay = macroCellId != null ? computeJoinMacroBounty(target.rarity) : computePostedBounty(target.rarity);

      if (!stateCanFundBounty(state.treasury ?? 0, pay.bountyPartial)) {
        // Try cheaper posts later in list; pests are usually cheaper.
        continue;
      }

      const hops =
        burg.cell != null
          ? (minHopsBetween(burg.cell, target.cellId, cells, MAX_HUNT_HOPS) ?? MAX_HUNT_HOPS)
          : MAX_HUNT_HOPS;

      const post: CullJobPosting = {
        i: nextId++,
        burgId,
        stateId,
        target,
        macroCellId,
        bounty: pay.bounty,
        bountyPartial: pay.bountyPartial,
        missionDays: computeMissionDays({
          hops,
          rarity: target.rarity,
          powerSnapshot: target.powerSnapshot
        }),
        uiDifficulty: uiDifficultyFromRarity(target.rarity),
        openSeats: 1,
        postedAtDay: ordinal,
        expiresInDays: CULL_POST_EXPIRE_DAYS
      };
      created.push(post);
      burgCount += 1;
      stateCount += 1;
      countByBurg.set(burgId, burgCount);
      countByState.set(stateId, stateCount);
      if (target.monsterId != null) reservedMonsters.add(target.monsterId);
      if (target.kind === "pest" || target.kind === "biomePredator") {
        reservedPestCells.add(target.cellId);
      }
    }
  }

  if (created.length) setCullJobPostings([...existing, ...created]);
}

/**
 * Advance post expiry and run a monthly top-up.
 * Call from economy.tick with effective calendar days.
 */
export function tickCullJobBoard(deltaDays: number): void {
  if (!(deltaDays > 0)) return;

  const posts = getCullJobPostings();
  if (posts.length) {
    setCullJobPostings(
      posts.map(post => ({
        ...post,
        expiresInDays: post.expiresInDays - deltaDays
      }))
    );
  }

  daysSinceBoardRefresh += deltaDays;
  while (daysSinceBoardRefresh >= CULL_BOARD_REFRESH_DAYS) {
    daysSinceBoardRefresh -= CULL_BOARD_REFRESH_DAYS;
    pruneInvalidCullPostings();
    rebuildCullJobPostings();
  }
  // Also prune immediately if anything expired this tick.
  pruneInvalidCullPostings();
}

/** Live open seats after pending applications and active contracts. */
export function getLiveOpenSeats(postingId: number): number {
  const post = getCullJobPostings().find(p => p.i === postingId);
  if (!post) return 0;
  let reserved = 0;
  for (const app of getCullHireApplications()) {
    if (app.postingId === postingId) reserved += 1;
  }
  for (const contract of getCullActiveContracts()) {
    if (contract.postingId === postingId) reserved += 1;
  }
  return Math.max(0, post.openSeats - reserved);
}

export function getCullJobPostingById(postingId: number): CullJobPosting | null {
  return getCullJobPostings().find(p => p.i === postingId) ?? null;
}

export function getCullJobPostingsForBurg(burgId: number): CullJobPosting[] {
  return getCullJobPostings().filter(p => p.burgId === burgId && p.expiresInDays > 0);
}

/** One-line English for UI (Burg Editor / PC panel). */
export function formatCullJobPostingsForBurg(burgId: number): string {
  const posts = getCullJobPostingsForBurg(burgId);
  if (!posts.length) return "—";
  const open = posts.filter(p => getLiveOpenSeats(p.i) > 0);
  if (!open.length) return `${posts.length} listing(s), none open`;
  const labels = open.slice(0, 3).map(p => {
    const kind = p.target.kind === "pest" ? "pest" : p.macroCellId != null ? "royal hunt" : "cull";
    return `${p.target.label} (${kind}, ${p.bounty})`;
  });
  const more = open.length > 3 ? ` +${open.length - 3}` : "";
  return `${open.length} open: ${labels.join("; ")}${more}`;
}
