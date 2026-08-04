/**
 * Threat cull / pest hire lag, accept, purge, resign, combat resolve (PR-3a/3b).
 * Spec: docs/plan/player-threat-cull-jobs.md.
 */

import { HUNT_RESERVE, resolvePlayerCullEffect } from "../../../generators/threatCullEffects";
import type { DataTopic } from "../../../runtime/worldRuntime";
import type { RNGService } from "../../../utils/probabilityUtils";
import type { Character } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import {
  getCullActiveContracts,
  getCullCooldowns,
  getCullHireApplications,
  getCullJobPostings,
  getSimulationContext,
  getSimulationYear,
  getWorldContext,
  setCullActiveContracts,
  setCullCooldowns,
  setCullHireApplications,
  setCullJobPostings
} from "../economyContext";
import { cancelConstructionApplication, resignConstructionJob } from "./constructionHire";
import { characterHasEmploymentCommitment } from "./employmentCommitment";
import {
  ANON_COMBAT_SCORE,
  ANON_ECOLOGY_SCALE,
  namedHunterCombatScore,
  resolveCullCombat,
  targetDifficulty
} from "./threatCullCombat";
import type { CullActiveContract, CullContractRole, CullHireApplication, CullJobPosting } from "./threatCullHireTypes";
import { CULL_HUNTER_ROLE_KIND, CULL_PEST_ROLE_KIND, CULL_ROLE_SOURCE } from "./threatCullHireTypes";
import {
  CULL_ANON_HIRE_LAG_DAYS,
  CULL_ANON_ROUND_DAYS,
  CULL_INJURY_COOLDOWN_DAYS,
  CULL_INJURY_WEALTH_LOSS,
  CULL_PLAYER_HIRE_LAG_DAYS,
  getCullJobPostingById,
  getLiveOpenSeats,
  getSimulationOrdinalDay
} from "./threatCullJobPostings";

/** PR-3b: mission timer reaching 0 runs combat + pay + ecology. */
export const CULL_RESOLVE_ENABLED = true;

/** Session accumulator for anonymous hire rounds (not persisted). */
let daysSinceAnonRound = 0;

export function clearCullHiringSession(): void {
  daysSinceAnonRound = 0;
}

function nextApplicationId(apps: readonly CullHireApplication[]): number {
  let max = 0;
  for (const app of apps) max = Math.max(max, app.i);
  return max + 1;
}

function nextContractId(contracts: readonly CullActiveContract[]): number {
  let max = 0;
  for (const c of contracts) max = Math.max(max, c.i);
  return max + 1;
}

function roleForTarget(targetKind: string): CullContractRole {
  return targetKind === "pest" || targetKind === "biomePredator" ? "pestController" : "hunter";
}

function removeCullRole(character: Character): void {
  if (!character.roles?.length) return;
  character.roles = character.roles.filter(
    role =>
      !(role.source === CULL_ROLE_SOURCE && (role.kind === CULL_HUNTER_ROLE_KIND || role.kind === CULL_PEST_ROLE_KIND))
  );
}

function addCullRole(character: Character, contract: CullActiveContract): void {
  if (!character.roles) character.roles = [];
  removeCullRole(character);
  const isPest = contract.role === "pestController";
  character.roles.push({
    source: CULL_ROLE_SOURCE,
    kind: isPest ? CULL_PEST_ROLE_KIND : CULL_HUNTER_ROLE_KIND,
    entityType: "burg",
    entityId: contract.burgId,
    label: isPest ? "Pest controller" : "Hunter",
    domain: contract.target.label
  });
}

function isOnInjuryCooldown(characterId: number): boolean {
  const until = getCullCooldowns()[String(characterId)];
  if (until == null) return false;
  return getSimulationOrdinalDay() < until;
}

function isTargetStillValid(posting: CullJobPosting): boolean {
  const { pack } = getWorldContext();
  const target = posting.target;
  if (target.kind === "monster") {
    if (target.monsterId === null) return false;
    const monster = (pack.monsters ?? []).find(m => m?.i === target.monsterId);
    return Boolean(monster && monster.power > 0);
  }
  const cells = pack.cells;
  if (!cells || target.cellId < 0 || target.cellId >= cells.i.length) return false;
  return (cells.h[target.cellId] ?? 0) >= 20;
}

/**
 * Player applies for a cull/pest posting. Seat reserved for CULL_PLAYER_HIRE_LAG_DAYS.
 * Payload requires characterId + postingId (construction parity).
 */
export function applyCharacterToCullJob(args: { characterId: number; postingId: number }): {
  ok: boolean;
  message: string;
  daysRemaining?: number;
} {
  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === args.characterId);
  if (!character || character.dead) {
    return { ok: false, message: "Character not found or dead." };
  }
  if (isOnInjuryCooldown(args.characterId)) {
    return { ok: false, message: "Still recovering from a previous hunt injury." };
  }
  if (characterHasEmploymentCommitment(args.characterId)) {
    return { ok: false, message: "Already committed to employment (construction or hunt)." };
  }

  const posting = getCullJobPostingById(args.postingId);
  if (!posting || posting.expiresInDays <= 0) {
    return { ok: false, message: "Cull posting not found or expired." };
  }
  if (character.location !== posting.burgId) {
    return { ok: false, message: "Character must be in this burg to apply." };
  }
  if (getLiveOpenSeats(posting.i) <= 0) {
    return { ok: false, message: "No open seats on this cull posting." };
  }
  if (!isTargetStillValid(posting)) {
    return { ok: false, message: "Target is no longer available." };
  }

  const state = pack.states?.[posting.stateId];
  if (!state?.i || state.removed) {
    return { ok: false, message: "Posting state is invalid." };
  }
  const minEscrow = posting.bountyPartial * 0.5;
  if ((state.treasury ?? 0) < minEscrow + HUNT_RESERVE) {
    return { ok: false, message: "State treasury cannot fund this bounty escrow." };
  }

  const apps = [...getCullHireApplications()];
  apps.push({
    i: nextApplicationId(apps),
    postingId: posting.i,
    burgId: posting.burgId,
    characterId: args.characterId,
    daysRemaining: CULL_PLAYER_HIRE_LAG_DAYS
  });
  setCullHireApplications(apps);
  return {
    ok: true,
    message: `Applied for ${posting.target.label}. Decision in ${CULL_PLAYER_HIRE_LAG_DAYS} days.`,
    daysRemaining: CULL_PLAYER_HIRE_LAG_DAYS
  };
}

/** Withdraw a pending cull application (frees the reserved board seat). */
export function cancelCullApplication(characterId: number): { ok: boolean; message: string } {
  const apps = getCullHireApplications();
  const next = apps.filter(app => app.characterId !== characterId);
  if (next.length === apps.length) {
    return { ok: false, message: "No pending cull application." };
  }
  setCullHireApplications(next);
  return { ok: true, message: "Cull application withdrawn." };
}

/**
 * Resign an active named cull mission. Escrow already deducted → forfeit 100% (no refund).
 */
export function resignCullJob(characterId: number): { ok: boolean; message: string } {
  const contracts = getCullActiveContracts();
  const mine = contracts.find(c => c.characterId === characterId);
  if (!mine) {
    return { ok: false, message: "Not on an active hunt or pest contract." };
  }
  // Escrow already in treasury path (deducted on accept) — forfeit, no refund.
  setCullActiveContracts(contracts.filter(c => c.characterId !== characterId));
  setCullHireApplications(getCullHireApplications().filter(app => app.characterId !== characterId));
  const character = getWorldContext().pack.characters?.find(c => c.i === characterId);
  if (character) removeCullRole(character);
  return { ok: true, message: "Left hunt work. Escrow forfeited." };
}

/**
 * Drop apps/contracts for dead characters, wrong location (named only), missing posts,
 * or invalid targets. Named leave-burg / death forfeits escrow. Target-gone refunds 50%.
 */
export function purgeInvalidCullHireState(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters ?? [];
  const byId = new Map(characters.map(c => [c.i, c]));
  const postsById = new Map(getCullJobPostings().map(p => [p.i, p]));

  // Applications
  const validApps = getCullHireApplications().filter(app => {
    if (!postsById.has(app.postingId)) return false;
    if (app.characterId == null) return true;
    const character = byId.get(app.characterId);
    if (!character || character.dead || character.location !== app.burgId) return false;
    return true;
  });
  if (validApps.length !== getCullHireApplications().length) {
    setCullHireApplications(validApps);
  }

  // Contracts
  const kept: CullActiveContract[] = [];
  for (const contract of getCullActiveContracts()) {
    const posting = postsById.get(contract.postingId);
    // Target / posting validity
    if (!posting || !isTargetStillValid(posting)) {
      disposeContract(contract, "refund_half", byId);
      continue;
    }
    if (contract.characterId == null) {
      // Anon: skip location checks
      kept.push(contract);
      continue;
    }
    const character = byId.get(contract.characterId);
    if (!character || character.dead) {
      disposeContract(contract, "forfeit", byId);
      continue;
    }
    if (character.location !== contract.burgId) {
      disposeContract(contract, "forfeit", byId);
      continue;
    }
    kept.push(contract);
  }
  setCullActiveContracts(kept);
}

function disposeContract(
  contract: CullActiveContract,
  disposition: "forfeit" | "refund_half",
  byId: Map<number, Character>
): void {
  if (contract.characterId != null && contract.escrow > 0 && disposition === "refund_half") {
    const state = getWorldContext().pack.states?.[contract.stateId];
    if (state?.i) {
      state.treasury = rn((state.treasury ?? 0) + contract.escrow * 0.5, 2);
    }
  }
  // forfeit: escrow already removed from treasury on accept — nothing to do
  if (contract.characterId != null) {
    const character = byId.get(contract.characterId);
    if (character) removeCullRole(character);
  }
}

function acceptApplication(app: CullHireApplication): void {
  const posting = getCullJobPostingById(app.postingId);
  if (!posting || posting.expiresInDays <= 0 || !isTargetStillValid(posting)) return;

  // Seat may have been double-claimed if lag races — re-check free seats ignoring this app.
  const otherPending = getCullHireApplications().filter(a => a.postingId === app.postingId && a.i !== app.i).length;
  const activeOnPost = getCullActiveContracts().filter(c => c.postingId === app.postingId).length;
  if (posting.openSeats - otherPending - activeOnPost <= 0) return;

  const role = roleForTarget(posting.target.kind);

  if (app.characterId == null) {
    const contracts = [...getCullActiveContracts()];
    contracts.push({
      i: nextContractId(contracts),
      postingId: posting.i,
      burgId: posting.burgId,
      stateId: posting.stateId,
      characterId: null,
      target: posting.target,
      macroCellId: posting.macroCellId,
      bounty: posting.bounty,
      bountyPartial: posting.bountyPartial,
      missionDaysRemaining: posting.missionDays,
      escrow: 0,
      role
    });
    setCullActiveContracts(contracts);
    return;
  }

  const character = getWorldContext().pack.characters?.find(c => c.i === app.characterId);
  if (!character || character.dead || character.location !== app.burgId) return;
  if (characterHasEmploymentCommitment(app.characterId)) return;

  const state = getWorldContext().pack.states?.[posting.stateId];
  if (!state?.i || state.removed) return;

  const escrowAmount = Math.min(posting.bountyPartial, Math.max(0, (state.treasury ?? 0) - HUNT_RESERVE));
  if (escrowAmount < posting.bountyPartial * 0.5) {
    // Insolvency at accept — drop without contract.
    return;
  }
  state.treasury = rn((state.treasury ?? 0) - escrowAmount, 2);

  const contracts = getCullActiveContracts().filter(c => c.characterId !== app.characterId);
  const contract: CullActiveContract = {
    i: nextContractId(contracts),
    postingId: posting.i,
    burgId: posting.burgId,
    stateId: posting.stateId,
    characterId: app.characterId,
    target: posting.target,
    macroCellId: posting.macroCellId,
    bounty: posting.bounty,
    bountyPartial: posting.bountyPartial,
    missionDaysRemaining: posting.missionDays,
    escrow: escrowAmount,
    role
  };
  contracts.push(contract);
  setCullActiveContracts(contracts);
  addCullRole(character, contract);
}

/**
 * Advance hire lag, accept applications, decrement mission timers, resolve due contracts.
 * Returns DataTopics that must be marked by economy.tick (ecology side effects).
 */
export function tickCullHiring(deltaDays: number, rng?: RNGService): { topics: DataTopic[] } {
  const topics = new Set<DataTopic>();
  if (!(deltaDays > 0)) return { topics: [] };

  purgeInvalidCullHireState();

  // Resolve pending applications → contracts.
  // Drop lag-expired apps from the slice *before* accept so employment-commitment
  // checks do not see the applicant as still "pending".
  const remaining: CullHireApplication[] = [];
  const toAccept: CullHireApplication[] = [];
  for (const app of getCullHireApplications()) {
    const daysLeft = app.daysRemaining - deltaDays;
    if (daysLeft > 0) {
      remaining.push({ ...app, daysRemaining: daysLeft });
    } else {
      toAccept.push(app);
    }
  }
  setCullHireApplications(remaining);
  for (const app of toAccept) {
    acceptApplication(app);
  }

  // Mission countdown.
  const contracts = getCullActiveContracts().map(contract => ({
    ...contract,
    missionDaysRemaining: Math.max(0, contract.missionDaysRemaining - deltaDays)
  }));
  setCullActiveContracts(contracts);

  if (CULL_RESOLVE_ENABLED && rng) {
    const stillActive: CullActiveContract[] = [];
    for (const contract of getCullActiveContracts()) {
      if (contract.missionDaysRemaining > 0) {
        stillActive.push(contract);
        continue;
      }
      const resultTopics = resolveCullContract(contract, rng);
      for (const t of resultTopics) topics.add(t);
    }
    setCullActiveContracts(stillActive);
  }

  // Anonymous applications (heroes get first crack — slower anon lag/round).
  daysSinceAnonRound += deltaDays;
  while (daysSinceAnonRound >= CULL_ANON_ROUND_DAYS) {
    daysSinceAnonRound -= CULL_ANON_ROUND_DAYS;
    runAnonymousCullRound();
  }

  if (topics.size) {
    topics.add("extension.economy");
    topics.add("simulation.states");
  }
  return { topics: [...topics] };
}

/**
 * One-shot resolve for a due contract. Caller removes the contract from the active list.
 * Returns ecology topics touched (may be empty on fail with no power cut).
 */
function resolveCullContract(contract: CullActiveContract, rng: RNGService): DataTopic[] {
  const world = getWorldContext();
  const named = contract.characterId != null;
  const character = named ? world.pack.characters?.find(c => c.i === contract.characterId) : undefined;

  // Named character must still be alive in burg; else forfeit (purge should have caught this).
  if (named && (!character || character.dead || character.location !== contract.burgId)) {
    disposeContract(contract, "forfeit", new Map(world.pack.characters?.map(c => [c.i, c]) ?? []));
    return [];
  }

  // EQ-3: named hunters get domain practice + equipment; anon stays fixed synthetic score.
  const score = named && character ? namedHunterCombatScore(character) : ANON_COMBAT_SCORE;
  const combat = resolveCullCombat({
    combatScore: score,
    difficulty: targetDifficulty(contract.target),
    rarity: contract.target.rarity,
    rng
  });
  contract.lastOutcome = combat.outcome;

  // Death path (named only).
  if (named && character && combat.outcome === "dead") {
    character.dead = true;
    character.deathYear = getSimulationYear();
    removeCullRole(character);
    cancelConstructionApplication(character.i);
    resignConstructionJob(character.i);
    // Escrow forfeited (already deducted).
    return [];
  }

  const topics: DataTopic[] = [];

  // Ecology on success/partial intensity.
  if (combat.intensity > 0) {
    const simulation = getSimulationContext();
    if (simulation) {
      const scale = named ? 1 : ANON_ECOLOGY_SCALE;
      const effect = resolvePlayerCullEffect({
        world,
        simulation,
        target: contract.target,
        intensity: combat.intensity * scale,
        rng,
        macroCellId: contract.macroCellId
      });
      for (const t of effect.topics) topics.push(t);
      if (effect.cleared) {
        // Drop the posting so the board does not re-offer a dead target.
        setCullJobPostings(getCullJobPostings().filter(p => p.i !== contract.postingId));
      }
    }
  }

  // Pay named hunters only; follow ecology outcome (not injury).
  if (named && character && (combat.outcome === "success" || combat.outcome === "partial")) {
    payCullBounty(contract, character, combat.outcome);
  }

  // Injury orthogonal — after pay.
  if (named && character && combat.injured) {
    applyInjury(character);
  }

  if (named && character) removeCullRole(character);
  return topics;
}

function payCullBounty(contract: CullActiveContract, character: Character, outcome: "success" | "partial"): void {
  const state = getWorldContext().pack.states?.[contract.stateId];
  if (!state?.i) return;

  const targetPay = outcome === "success" ? contract.bounty : contract.bountyPartial;
  const alreadyEscrowed = contract.escrow;
  const extraWanted = Math.max(0, targetPay - alreadyEscrowed);
  const available = Math.max(0, (state.treasury ?? 0) - HUNT_RESERVE);
  const extraPaid = Math.min(extraWanted, available);
  if (extraPaid > 0) {
    state.treasury = rn((state.treasury ?? 0) - extraPaid, 2);
  }
  const paid = rn(Math.min(targetPay, alreadyEscrowed + extraPaid), 2);
  if (paid > 0) {
    character.wealth = rn((character.wealth || 0) + paid, 2);
  }
}

function applyInjury(character: Character): void {
  const cooldowns = { ...getCullCooldowns() };
  cooldowns[String(character.i)] = getSimulationOrdinalDay() + CULL_INJURY_COOLDOWN_DAYS;
  setCullCooldowns(cooldowns);
  character.wealth = rn(Math.max(0, (character.wealth || 0) - CULL_INJURY_WEALTH_LOSS), 2);
}

function runAnonymousCullRound(): void {
  const apps = [...getCullHireApplications()];
  let nextId = nextApplicationId(apps);
  const postsWithPendingAnon = new Set(apps.filter(a => a.characterId === null).map(a => a.postingId));

  for (const post of getCullJobPostings()) {
    if (post.expiresInDays <= 0) continue;
    if (postsWithPendingAnon.has(post.i)) continue;
    if (getLiveOpenSeats(post.i) <= 0) continue;
    if (!isTargetStillValid(post)) continue;
    apps.push({
      i: nextId++,
      postingId: post.i,
      burgId: post.burgId,
      characterId: null,
      daysRemaining: CULL_ANON_HIRE_LAG_DAYS
    });
    postsWithPendingAnon.add(post.i);
  }
  setCullHireApplications(apps);
}

export function getCharacterCullContract(characterId: number): CullActiveContract | null {
  return getCullActiveContracts().find(c => c.characterId === characterId) ?? null;
}

export function getCharacterPendingCullApplication(characterId: number): CullHireApplication | null {
  return getCullHireApplications().find(app => app.characterId === characterId) ?? null;
}
