import type { Character } from "../../characters/characterTypes";
import {
  getConstructionHireApplications,
  getConstructionNamedSeats,
  getConstructionOperations,
  getWorldContext,
  setConstructionHireApplications,
  setConstructionNamedSeats
} from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import type { ConstructionHireApplication, ConstructionHireRole, ConstructionNamedSeat } from "./constructionHireTypes";
import { getConstructionJobPosting } from "./constructionJobPostings";
import { peopleToPoints } from "./craftScale";
import { characterHasEmploymentCommitment } from "./employmentCommitment";

export type { ConstructionHireApplication, ConstructionHireRole, ConstructionNamedSeat } from "./constructionHireTypes";

/** Player / named character applications wait this long before hire resolves. */
export const PLAYER_HIRE_LAG_DAYS = 14;
/** Anonymous board hires resolve faster but only one seat per hire round. */
export const ANON_HIRE_LAG_DAYS = 7;
/** How often each burg may start one anonymous hire application. */
export const HIRE_ROUND_DAYS = 7;
/** Source tag on Character.roles for construction seats. */
export const CONSTRUCTION_ROLE_SOURCE = "economy";
export const CONSTRUCTION_ROLE_KIND = "constructionWorker";

/** Accumulator for anonymous hire rounds (session; not persisted — fine for Phase 2). */
let daysSinceGlobalHireRound = 0;

export function clearConstructionHireState(): void {
  setConstructionHireApplications([]);
  setConstructionNamedSeats([]);
  daysSinceGlobalHireRound = 0;
}

export function countNamedSeats(
  burgId: number,
  role?: ConstructionHireRole
): { mason: number; carpenter: number; total: number } {
  let mason = 0;
  let carpenter = 0;
  for (const seat of getConstructionNamedSeats()) {
    if (seat.burgId !== burgId) continue;
    if (role && seat.role !== role) continue;
    if (seat.role === "mason") mason += 1;
    else carpenter += 1;
  }
  return { mason, carpenter, total: mason + carpenter };
}

export function countPendingApplications(
  burgId: number,
  role?: ConstructionHireRole
): { mason: number; carpenter: number; total: number } {
  let mason = 0;
  let carpenter = 0;
  for (const app of getConstructionHireApplications()) {
    if (app.burgId !== burgId) continue;
    if (role && app.role !== role) continue;
    if (app.role === "mason") mason += 1;
    else carpenter += 1;
  }
  return { mason, carpenter, total: mason + carpenter };
}

/** Effective workers for production: anonymous + named seats. */
export function getEffectiveConstructionWorkers(burgId: number): { mason: number; carpenter: number } {
  const op = getConstructionOperations().find(o => o.active && o.burgId === burgId);
  const named = countNamedSeats(burgId);
  return {
    mason: (op?.masonWorkers ?? 0) + named.mason,
    carpenter: (op?.carpenterWorkers ?? 0) + named.carpenter
  };
}

function nextApplicationId(apps: readonly ConstructionHireApplication[]): number {
  let max = 0;
  for (const app of apps) max = Math.max(max, app.i);
  return max + 1;
}

function pickRole(openMason: number, openCarpenter: number): ConstructionHireRole | null {
  if (openMason <= 0 && openCarpenter <= 0) return null;
  if (openMason >= openCarpenter && openMason > 0) return "mason";
  if (openCarpenter > 0) return "carpenter";
  return openMason > 0 ? "mason" : null;
}

function characterHasConstructionJob(character: Character): boolean {
  return (character.roles ?? []).some(
    role => role.source === CONSTRUCTION_ROLE_SOURCE && role.kind === CONSTRUCTION_ROLE_KIND
  );
}

function removeConstructionRole(character: Character): void {
  if (!character.roles?.length) return;
  character.roles = character.roles.filter(
    role => !(role.source === CONSTRUCTION_ROLE_SOURCE && role.kind === CONSTRUCTION_ROLE_KIND)
  );
}

function addConstructionRole(character: Character, burgId: number, role: ConstructionHireRole): void {
  if (!character.roles) character.roles = [];
  removeConstructionRole(character);
  character.roles.push({
    source: CONSTRUCTION_ROLE_SOURCE,
    kind: CONSTRUCTION_ROLE_KIND,
    entityType: "burg",
    entityId: burgId,
    label: role === "mason" ? "Mason" : "Carpenter",
    domain: role
  });
}

/**
 * Player/NPC applies for a construction seat. Seat is reserved for PLAYER_HIRE_LAG_DAYS.
 */
export function applyCharacterToConstructionJob(args: {
  characterId: number;
  burgId: number;
  role?: ConstructionHireRole;
}): { ok: boolean; message: string; daysRemaining?: number } {
  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === args.characterId);
  if (!character || character.dead) {
    return { ok: false, message: "Character not found or dead." };
  }
  if (character.location !== args.burgId) {
    return { ok: false, message: "Character must be in this burg to apply." };
  }
  // Construction xor cull (and block double construction seat/app) — K10.
  if (characterHasEmploymentCommitment(args.characterId)) {
    return { ok: false, message: "Already committed to employment (construction, hunt, escort, or research)." };
  }

  const posting = getConstructionJobPosting(args.burgId);
  if (!posting || posting.openSeats <= 0) {
    return { ok: false, message: "No construction openings on the hire board." };
  }

  let role = args.role;
  if (!role) {
    role = pickRole(posting.openMason, posting.openCarpenter) ?? undefined;
  }
  if (!role) return { ok: false, message: "No construction openings on the hire board." };
  if (role === "mason" && posting.openMason <= 0) {
    return { ok: false, message: "No mason openings; try carpenter." };
  }
  if (role === "carpenter" && posting.openCarpenter <= 0) {
    return { ok: false, message: "No carpenter openings; try mason." };
  }

  const apps = [...getConstructionHireApplications()];
  apps.push({
    i: nextApplicationId(apps),
    burgId: args.burgId,
    role,
    characterId: args.characterId,
    daysRemaining: PLAYER_HIRE_LAG_DAYS
  });
  setConstructionHireApplications(apps);
  return {
    ok: true,
    message: `Applied as ${role}. Decision in ${PLAYER_HIRE_LAG_DAYS} days.`,
    daysRemaining: PLAYER_HIRE_LAG_DAYS
  };
}

/** Leave a named construction seat (immediate). */
export function resignConstructionJob(characterId: number): { ok: boolean; message: string } {
  const seats = getConstructionNamedSeats().filter(seat => seat.characterId !== characterId);
  if (seats.length === getConstructionNamedSeats().length) {
    return { ok: false, message: "Not employed in construction." };
  }
  setConstructionNamedSeats(seats);
  // Cancel pending apps
  setConstructionHireApplications(getConstructionHireApplications().filter(app => app.characterId !== characterId));
  const character = getWorldContext().pack.characters?.find(c => c.i === characterId);
  if (character) removeConstructionRole(character);
  return { ok: true, message: "Left construction work." };
}

/** Withdraw a pending application (frees the reserved board seat). */
export function cancelConstructionApplication(characterId: number): { ok: boolean; message: string } {
  const apps = getConstructionHireApplications();
  const next = apps.filter(app => app.characterId !== characterId);
  if (next.length === apps.length) {
    return { ok: false, message: "No pending construction application." };
  }
  setConstructionHireApplications(next);
  return { ok: true, message: "Construction application withdrawn." };
}

/**
 * Drop seats/apps for dead characters, wrong location, or missing construction ops.
 * Called each hire tick so named labor cannot stick after travel/death.
 */
export function purgeInvalidConstructionHireState(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters ?? [];
  const byId = new Map(characters.map(c => [c.i, c]));
  const activeBurgIds = new Set(
    getConstructionOperations()
      .filter(op => op.active)
      .map(op => op.burgId)
  );

  const validSeats: ConstructionNamedSeat[] = [];
  for (const seat of getConstructionNamedSeats()) {
    if (!activeBurgIds.has(seat.burgId)) {
      const ch = byId.get(seat.characterId);
      if (ch) removeConstructionRole(ch);
      continue;
    }
    const character = byId.get(seat.characterId);
    if (!character || character.dead || character.location !== seat.burgId) {
      if (character) removeConstructionRole(character);
      continue;
    }
    validSeats.push(seat);
  }
  setConstructionNamedSeats(validSeats);

  const validApps = getConstructionHireApplications().filter(app => {
    if (!activeBurgIds.has(app.burgId)) return false;
    if (app.characterId == null) return true;
    const character = byId.get(app.characterId);
    if (!character || character.dead || character.location !== app.burgId) return false;
    return true;
  });
  setConstructionHireApplications(validApps);
}

function acceptApplication(app: ConstructionHireApplication): void {
  if (app.characterId != null) {
    const character = getWorldContext().pack.characters?.find(c => c.i === app.characterId);
    if (!character || character.dead || character.location !== app.burgId) return;
    if (characterHasConstructionJob(character)) return;

    const seats = getConstructionNamedSeats().filter(s => s.characterId !== app.characterId);
    seats.push({ burgId: app.burgId, role: app.role, characterId: app.characterId });
    setConstructionNamedSeats(seats);
    addConstructionRole(character, app.burgId, app.role);
    return;
  }

  // Anonymous: add one real person's worth of population points to the matching worker pool.
  // Pre-PR-3 this added a full 1.0 population point per accepted hire — at the default rate
  // 1000, that overcounted one hired worker as 1000 real people (docs/plan/
  // craft-demand-calibration.md §2.0 P10). applyCalibration converts the increment to
  // peopleToPoints(1), leaving the legacy +1 point in place while the flag is off.
  const op = getConstructionOperations().find(o => o.active && o.burgId === app.burgId);
  if (!op) return;
  const increment = getEconomyCalibrationState().applyCalibration
    ? peopleToPoints(1, Math.max(0, getWorldContext().populationRate ?? 0) || 1)
    : 1;
  if (app.role === "mason") op.masonWorkers = (op.masonWorkers ?? 0) + increment;
  else op.carpenterWorkers = (op.carpenterWorkers ?? 0) + increment;
}

/**
 * Advance hire lag and run slow anonymous applications.
 * Call from economy.tick with effective calendar days.
 */
export function tickConstructionHiring(deltaDays: number): void {
  if (!(deltaDays > 0)) return;

  // Drop seats for dead / departed workers before resolving new hires.
  purgeInvalidConstructionHireState();

  // Resolve pending applications.
  const remaining: ConstructionHireApplication[] = [];
  for (const app of getConstructionHireApplications()) {
    const daysLeft = app.daysRemaining - deltaDays;
    if (daysLeft > 0) {
      remaining.push({ ...app, daysRemaining: daysLeft });
      continue;
    }
    // Pending apps already reserved a board seat — accept if the op still exists.
    // Character applications also re-validate location/death inside acceptApplication.
    const op = getConstructionOperations().find(o => o.active && o.burgId === app.burgId);
    if (op) acceptApplication(app);
  }
  setConstructionHireApplications(remaining);

  // Anonymous hire rounds: one application per burg with free seats, lag ANON_HIRE_LAG_DAYS.
  daysSinceGlobalHireRound += deltaDays;
  while (daysSinceGlobalHireRound >= HIRE_ROUND_DAYS) {
    daysSinceGlobalHireRound -= HIRE_ROUND_DAYS;
    runAnonymousHireRound();
  }
}

function runAnonymousHireRound(): void {
  const apps = [...getConstructionHireApplications()];
  let nextId = nextApplicationId(apps);
  const burgsWithPendingAnon = new Set(apps.filter(a => a.characterId === null).map(a => a.burgId));

  for (const op of getConstructionOperations()) {
    if (!op.active) continue;
    if (burgsWithPendingAnon.has(op.burgId)) continue;
    const posting = getConstructionJobPosting(op.burgId);
    if (!posting || posting.openSeats <= 0) continue;
    const role = pickRole(posting.openMason, posting.openCarpenter);
    if (!role) continue;
    apps.push({
      i: nextId++,
      burgId: op.burgId,
      role,
      characterId: null,
      daysRemaining: ANON_HIRE_LAG_DAYS
    });
  }
  setConstructionHireApplications(apps);
}

export function getCharacterConstructionEmployment(characterId: number): ConstructionNamedSeat | null {
  return getConstructionNamedSeats().find(seat => seat.characterId === characterId) ?? null;
}

export function getCharacterPendingConstructionApplication(characterId: number): ConstructionHireApplication | null {
  return getConstructionHireApplications().find(app => app.characterId === characterId) ?? null;
}
