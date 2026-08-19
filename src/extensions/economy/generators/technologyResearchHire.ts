/**
 * Player research hire: workshop researcher and mine laborer seats.
 * Lag + named seats + location/death purge (docs/plan/player-character-technology-bias.md PR-3).
 */
import type { Character } from "../../characters/characterTypes";
import {
  getExperimentalWorkshops,
  getMineOperations,
  getResearchHireApplications,
  getResearchNamedSeats,
  getWorldContext,
  setResearchHireApplications,
  setResearchNamedSeats
} from "../economyContext";
import { characterHasEmploymentCommitment } from "./employmentCommitment";
import { ENGINEERING_WORKSHOP_MIN } from "./technologyBiasApply";
import type { ResearchHireApplication, ResearchNamedSeat } from "./technologyBiasTypes";

export type ResearchPlayerHireRole = "workshopResearcher" | "mineLaborer";

/** Player / named character applications wait this long before hire resolves. */
export const RESEARCH_PLAYER_HIRE_LAG_DAYS = 14;
export const RESEARCH_ROLE_SOURCE = "economy";

const PLAYER_HIRE_ROLES = new Set<ResearchPlayerHireRole>(["workshopResearcher", "mineLaborer"]);

function isPlayerHireRole(role: string): role is ResearchPlayerHireRole {
  return PLAYER_HIRE_ROLES.has(role as ResearchPlayerHireRole);
}

function researchRoleLabel(role: ResearchNamedSeat["role"]): string {
  if (role === "workshopResearcher") return "Workshop researcher";
  if (role === "mineLaborer") return "Mine laborer";
  return "Trial machinist";
}

export function clearResearchHireState(): void {
  setResearchHireApplications([]);
  setResearchNamedSeats([]);
}

export function burgHasActiveExperimentalWorkshop(burgId: number): boolean {
  return getExperimentalWorkshops().some(workshop => workshop.active && workshop.burgId === burgId);
}

export function burgHasActiveMine(burgId: number): boolean {
  return getMineOperations().some(operation => operation.active && operation.burgId === burgId);
}

function firstActiveMineId(burgId: number): number | undefined {
  return getMineOperations().find(operation => operation.active && operation.burgId === burgId)?.i;
}

function nextApplicationId(apps: readonly ResearchHireApplication[]): number {
  let max = 0;
  for (const app of apps) max = Math.max(max, app.i);
  return max + 1;
}

function characterHasResearchJob(character: Character): boolean {
  return (character.roles ?? []).some(role => role.source === RESEARCH_ROLE_SOURCE && isPlayerHireRole(role.kind));
}

function removeResearchRole(character: Character): void {
  if (!character.roles?.length) return;
  character.roles = character.roles.filter(
    role => !(role.source === RESEARCH_ROLE_SOURCE && isPlayerHireRole(role.kind))
  );
}

function addResearchRole(character: Character, burgId: number, role: ResearchPlayerHireRole): void {
  if (!character.roles) character.roles = [];
  removeResearchRole(character);
  character.roles.push({
    source: RESEARCH_ROLE_SOURCE,
    kind: role,
    entityType: "burg",
    entityId: burgId,
    label: researchRoleLabel(role),
    domain: role
  });
}

function readEngineering(character: Character): number | null {
  const value = character.skills?.engineering;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Player applies for a workshop or mine-labor seat. Seat is reserved for RESEARCH_PLAYER_HIRE_LAG_DAYS.
 */
export function applyCharacterToResearchJob(args: {
  characterId: number;
  burgId: number;
  role: ResearchPlayerHireRole;
}): { ok: boolean; message: string; daysRemaining?: number } {
  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === args.characterId);
  if (!character || character.dead) {
    return { ok: false, message: "Character not found or dead." };
  }
  if (character.location !== args.burgId) {
    return { ok: false, message: "Character must be in this burg to apply." };
  }
  if (!isPlayerHireRole(args.role)) {
    return { ok: false, message: "Unknown research role." };
  }
  if (characterHasEmploymentCommitment(args.characterId)) {
    return { ok: false, message: "Already committed to employment (construction, hunt, escort, or research)." };
  }

  if (args.role === "workshopResearcher") {
    if (!burgHasActiveExperimentalWorkshop(args.burgId)) {
      return { ok: false, message: "No experimental workshop in this burg." };
    }
    const engineering = readEngineering(character);
    if (engineering === null || engineering < ENGINEERING_WORKSHOP_MIN) {
      return {
        ok: false,
        message: `Engineering skill of ${ENGINEERING_WORKSHOP_MIN} or higher is required for workshop research.`
      };
    }
  } else if (!burgHasActiveMine(args.burgId)) {
    return { ok: false, message: "No active mine in this burg." };
  }

  const apps = [...getResearchHireApplications()];
  const application: ResearchHireApplication = {
    i: nextApplicationId(apps),
    burgId: args.burgId,
    role: args.role,
    characterId: args.characterId,
    daysRemaining: RESEARCH_PLAYER_HIRE_LAG_DAYS
  };
  if (args.role === "mineLaborer") {
    const mineOperationId = firstActiveMineId(args.burgId);
    if (mineOperationId != null) application.mineOperationId = mineOperationId;
  }
  apps.push(application);
  setResearchHireApplications(apps);
  return {
    ok: true,
    message: `Applied as ${args.role === "workshopResearcher" ? "workshop researcher" : "mine laborer"}. Decision in ${RESEARCH_PLAYER_HIRE_LAG_DAYS} days.`,
    daysRemaining: RESEARCH_PLAYER_HIRE_LAG_DAYS
  };
}

/** Withdraw a pending research application (frees the reserved commitment). */
export function cancelResearchApplication(characterId: number): { ok: boolean; message: string } {
  const apps = getResearchHireApplications();
  const next = apps.filter(app => app.characterId !== characterId);
  if (next.length === apps.length) {
    return { ok: false, message: "No pending research application." };
  }
  setResearchHireApplications(next);
  return { ok: true, message: "Research application withdrawn." };
}

/** Leave a named research seat (immediate). */
export function resignResearchJob(characterId: number): { ok: boolean; message: string } {
  const seats = getResearchNamedSeats().filter(seat => seat.characterId !== characterId);
  if (seats.length === getResearchNamedSeats().length) {
    return { ok: false, message: "Not employed in research." };
  }
  setResearchNamedSeats(seats);
  setResearchHireApplications(getResearchHireApplications().filter(app => app.characterId !== characterId));
  const character = getWorldContext().pack.characters?.find(c => c.i === characterId);
  if (character) removeResearchRole(character);
  return { ok: true, message: "Left research work." };
}

/**
 * Drop seats/apps for dead characters, wrong location, or missing workshop/mine.
 * Called each hire tick so named labor cannot stick after travel/death.
 */
export function purgeInvalidResearchHireState(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters ?? [];
  const byId = new Map(characters.map(c => [c.i, c]));
  const activeWorkshopBurgIds = new Set(
    getExperimentalWorkshops()
      .filter(workshop => workshop.active)
      .map(workshop => workshop.burgId)
  );
  const activeMineBurgIds = new Set(
    getMineOperations()
      .filter(operation => operation.active)
      .map(operation => operation.burgId)
  );

  const validSeats: ResearchNamedSeat[] = [];
  for (const seat of getResearchNamedSeats()) {
    const character = byId.get(seat.characterId);
    if (!character || character.dead || character.location !== seat.burgId) {
      if (character) removeResearchRole(character);
      continue;
    }
    if (seat.role === "workshopResearcher" && !activeWorkshopBurgIds.has(seat.burgId)) {
      removeResearchRole(character);
      continue;
    }
    if (seat.role === "mineLaborer" && !activeMineBurgIds.has(seat.burgId)) {
      removeResearchRole(character);
      continue;
    }
    validSeats.push(seat);
  }
  setResearchNamedSeats(validSeats);

  const validApps = getResearchHireApplications().filter(app => {
    const character = byId.get(app.characterId);
    if (!character || character.dead || character.location !== app.burgId) return false;
    if (app.role === "workshopResearcher" && !activeWorkshopBurgIds.has(app.burgId)) return false;
    if (app.role === "mineLaborer" && !activeMineBurgIds.has(app.burgId)) return false;
    return true;
  });
  setResearchHireApplications(validApps);
}

function acceptApplication(app: ResearchHireApplication): void {
  const character = getWorldContext().pack.characters?.find(c => c.i === app.characterId);
  if (!character || character.dead || character.location !== app.burgId) return;
  if (!isPlayerHireRole(app.role)) return;
  if (characterHasResearchJob(character)) return;

  const seats = getResearchNamedSeats().filter(seat => seat.characterId !== app.characterId);
  const seat: ResearchNamedSeat = { burgId: app.burgId, role: app.role, characterId: app.characterId };
  if (app.role === "mineLaborer") {
    const mineOperationId = app.mineOperationId ?? firstActiveMineId(app.burgId);
    if (mineOperationId != null) seat.mineOperationId = mineOperationId;
  }
  seats.push(seat);
  setResearchNamedSeats(seats);
  addResearchRole(character, app.burgId, app.role);
}

/**
 * Advance hire lag and promote expired applications to named seats.
 * Call from economy.tick with effective calendar days.
 */
export function tickResearchHiring(deltaDays: number): void {
  if (!(deltaDays > 0)) return;

  purgeInvalidResearchHireState();

  const remaining: ResearchHireApplication[] = [];
  for (const app of getResearchHireApplications()) {
    const daysLeft = app.daysRemaining - deltaDays;
    if (daysLeft > 0) {
      remaining.push({ ...app, daysRemaining: daysLeft });
      continue;
    }
    if (app.role === "workshopResearcher" && !burgHasActiveExperimentalWorkshop(app.burgId)) continue;
    if (app.role === "mineLaborer" && !burgHasActiveMine(app.burgId)) continue;
    acceptApplication(app);
  }
  setResearchHireApplications(remaining);
}

export function getCharacterResearchEmployment(characterId: number): ResearchNamedSeat | null {
  return getResearchNamedSeats().find(seat => seat.characterId === characterId) ?? null;
}

export function getCharacterPendingResearchApplication(characterId: number): ResearchHireApplication | null {
  return getResearchHireApplications().find(app => app.characterId === characterId) ?? null;
}
