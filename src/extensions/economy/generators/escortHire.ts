/**
 * Escort (護衛) hire lag, accept, purge, resign, combat resolve.
 * Mirrors threat-cull board lifecycle with destination arrival on success.
 */
import type { RNGService } from "../../../utils/probabilityUtils";
import type { Character } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import {
  getBanditCohorts,
  getEscortActiveContracts,
  getEscortCooldowns,
  getEscortHireApplications,
  getEscortJobPostings,
  getSimulationYear,
  getWorldContext,
  setBanditCohorts,
  setEscortActiveContracts,
  setEscortCooldowns,
  setEscortHireApplications
} from "../economyContext";
import { cancelConstructionApplication, resignConstructionJob } from "./constructionHire";
import { applyCullPracticeCredit } from "./cullPractice";
import { characterHasEmploymentCommitment } from "./employmentCommitment";
import type {
  EscortActiveContract,
  EscortEcologyOutcome,
  EscortHireApplication,
  EscortJobPosting
} from "./escortHireTypes";
import { ESCORT_ROLE_KIND, ESCORT_ROLE_SOURCE } from "./escortHireTypes";
import {
  ESCORT_ANON_HIRE_LAG_DAYS,
  ESCORT_ANON_ROUND_DAYS,
  ESCORT_INJURY_COOLDOWN_DAYS,
  ESCORT_INJURY_WEALTH_LOSS,
  ESCORT_PLAYER_HIRE_LAG_DAYS,
  ESCORT_TREASURY_RESERVE,
  getEscortJobPostingById,
  getLiveEscortOpenSeats,
  getSimulationOrdinalDay
} from "./escortJobPostings";
import { escortCombatDifficulty } from "./escortRouteThreat";
import { ANON_COMBAT_SCORE, namedHunterCombatScore, resolveCullCombat } from "./threatCullCombat";

export const ESCORT_RESOLVE_ENABLED = true;

let daysSinceAnonRound = 0;

export function clearEscortHiringSession(): void {
  daysSinceAnonRound = 0;
}

function nextApplicationId(apps: readonly EscortHireApplication[]): number {
  let max = 0;
  for (const app of apps) max = Math.max(max, app.i);
  return max + 1;
}

function nextContractId(contracts: readonly EscortActiveContract[]): number {
  let max = 0;
  for (const c of contracts) max = Math.max(max, c.i);
  return max + 1;
}

function removeEscortRole(character: Character): void {
  if (!character.roles?.length) return;
  character.roles = character.roles.filter(
    role => !(role.source === ESCORT_ROLE_SOURCE && role.kind === ESCORT_ROLE_KIND)
  );
}

function addEscortRole(character: Character, contract: EscortActiveContract): void {
  if (!character.roles) character.roles = [];
  removeEscortRole(character);
  character.roles.push({
    source: ESCORT_ROLE_SOURCE,
    kind: ESCORT_ROLE_KIND,
    entityType: "burg",
    entityId: contract.burgId,
    label: "Escort",
    domain: contract.label
  });
}

function isOnInjuryCooldown(characterId: number): boolean {
  const until = getEscortCooldowns()[String(characterId)];
  if (until == null) return false;
  return getSimulationOrdinalDay() < until;
}

function isPostingValid(posting: EscortJobPosting): boolean {
  const { pack } = getWorldContext();
  const origin = pack.burgs?.[posting.burgId];
  const dest = pack.burgs?.[posting.destinationBurgId];
  return Boolean(origin?.i && !origin.removed && dest?.i && !dest.removed);
}

/**
 * Player applies for an escort posting. Seat reserved for ESCORT_PLAYER_HIRE_LAG_DAYS.
 */
export function applyCharacterToEscortJob(args: { characterId: number; postingId: number }): {
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
    return { ok: false, message: "Still recovering from a previous escort injury." };
  }
  if (characterHasEmploymentCommitment(args.characterId)) {
    return { ok: false, message: "Already committed to employment (construction, hunt, or escort)." };
  }

  const posting = getEscortJobPostingById(args.postingId);
  if (!posting || posting.expiresInDays <= 0) {
    return { ok: false, message: "Escort posting not found or expired." };
  }
  if (character.location !== posting.burgId) {
    return { ok: false, message: "Character must be in this burg to apply." };
  }
  if (getLiveEscortOpenSeats(posting.i) <= 0) {
    return { ok: false, message: "No open seats on this escort posting." };
  }
  if (!isPostingValid(posting)) {
    return { ok: false, message: "Route burgs are no longer available." };
  }

  const state = pack.states?.[posting.stateId];
  if (!state?.i || state.removed) {
    return { ok: false, message: "Posting state is invalid." };
  }
  const minEscrow = posting.feePartial * 0.5;
  if ((state.treasury ?? 0) < minEscrow + ESCORT_TREASURY_RESERVE) {
    return { ok: false, message: "State treasury cannot fund this escort escrow." };
  }

  const apps = [...getEscortHireApplications()];
  apps.push({
    i: nextApplicationId(apps),
    postingId: posting.i,
    burgId: posting.burgId,
    characterId: args.characterId,
    daysRemaining: ESCORT_PLAYER_HIRE_LAG_DAYS
  });
  setEscortHireApplications(apps);
  return {
    ok: true,
    message: `Applied for ${posting.label}. Decision in ${ESCORT_PLAYER_HIRE_LAG_DAYS} days.`,
    daysRemaining: ESCORT_PLAYER_HIRE_LAG_DAYS
  };
}

export function cancelEscortApplication(characterId: number): { ok: boolean; message: string } {
  const apps = getEscortHireApplications();
  const next = apps.filter(app => app.characterId !== characterId);
  if (next.length === apps.length) {
    return { ok: false, message: "No pending escort application." };
  }
  setEscortHireApplications(next);
  return { ok: true, message: "Escort application withdrawn." };
}

/**
 * Resign active named escort. Escrow forfeited (already deducted on accept).
 */
export function resignEscortJob(characterId: number): { ok: boolean; message: string } {
  const contracts = getEscortActiveContracts();
  const mine = contracts.find(c => c.characterId === characterId);
  if (!mine) {
    return { ok: false, message: "Not on an active escort contract." };
  }
  setEscortActiveContracts(contracts.filter(c => c.characterId !== characterId));
  setEscortHireApplications(getEscortHireApplications().filter(app => app.characterId !== characterId));
  const character = getWorldContext().pack.characters?.find(c => c.i === characterId);
  if (character) removeEscortRole(character);
  return { ok: true, message: "Left escort work. Escrow forfeited." };
}

export function purgeInvalidEscortHireState(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters ?? [];
  const byId = new Map(characters.map(c => [c.i, c]));
  const postsById = new Map(getEscortJobPostings().map(p => [p.i, p]));

  const validApps = getEscortHireApplications().filter(app => {
    if (!postsById.has(app.postingId)) return false;
    if (app.characterId == null) return true;
    const character = byId.get(app.characterId);
    if (!character || character.dead || character.location !== app.burgId) return false;
    return true;
  });
  if (validApps.length !== getEscortHireApplications().length) {
    setEscortHireApplications(validApps);
  }

  const kept: EscortActiveContract[] = [];
  for (const contract of getEscortActiveContracts()) {
    const posting = postsById.get(contract.postingId);
    if (!posting || !isPostingValid(posting)) {
      disposeContract(contract, "refund_half", byId);
      continue;
    }
    if (contract.characterId == null) {
      kept.push(contract);
      continue;
    }
    const character = byId.get(contract.characterId);
    if (!character || character.dead) {
      disposeContract(contract, "forfeit", byId);
      continue;
    }
    // Escort is en-route: character may leave origin after accept — location check only on apply/accept.
    // Mid-mission location is not re-validated against origin (they travel).
    kept.push(contract);
  }
  setEscortActiveContracts(kept);
}

function disposeContract(
  contract: EscortActiveContract,
  disposition: "forfeit" | "refund_half",
  byId: Map<number, Character>
): void {
  if (contract.characterId != null && contract.escrow > 0 && disposition === "refund_half") {
    const state = getWorldContext().pack.states?.[contract.stateId];
    if (state?.i) {
      state.treasury = rn((state.treasury ?? 0) + contract.escrow * 0.5, 2);
    }
  }
  if (contract.characterId != null) {
    const character = byId.get(contract.characterId);
    if (character) removeEscortRole(character);
  }
}

/**
 * @param overshootDays — calendar days past hire lag in this same tick (continuous-time batch).
 *   Mission starts already progressed by that amount so a multi-day advance does not
 *   also subtract the full lag window from mission length a second time.
 */
function acceptApplication(app: EscortHireApplication, overshootDays = 0): void {
  const posting = getEscortJobPostingById(app.postingId);
  if (!posting || posting.expiresInDays <= 0 || !isPostingValid(posting)) return;

  const otherPending = getEscortHireApplications().filter(a => a.postingId === app.postingId && a.i !== app.i).length;
  const activeOnPost = getEscortActiveContracts().filter(c => c.postingId === app.postingId).length;
  if (posting.openSeats - otherPending - activeOnPost <= 0) return;

  const missionDaysRemaining = Math.max(0, posting.missionDays - Math.max(0, overshootDays));

  if (app.characterId == null) {
    const contracts = [...getEscortActiveContracts()];
    contracts.push({
      i: nextContractId(contracts),
      postingId: posting.i,
      burgId: posting.burgId,
      stateId: posting.stateId,
      destinationBurgId: posting.destinationBurgId,
      characterId: null,
      kind: posting.kind,
      transport: posting.transport,
      fee: posting.fee,
      feePartial: posting.feePartial,
      threatScore: posting.threat.threatScore,
      missionDaysRemaining,
      escrow: 0,
      label: posting.label
    });
    setEscortActiveContracts(contracts);
    return;
  }

  const character = getWorldContext().pack.characters?.find(c => c.i === app.characterId);
  if (!character || character.dead || character.location !== app.burgId) return;
  if (characterHasEmploymentCommitment(app.characterId)) return;

  const state = getWorldContext().pack.states?.[posting.stateId];
  if (!state?.i || state.removed) return;

  const escrowAmount = Math.min(posting.feePartial, Math.max(0, (state.treasury ?? 0) - ESCORT_TREASURY_RESERVE));
  if (escrowAmount < posting.feePartial * 0.5) return;
  state.treasury = rn((state.treasury ?? 0) - escrowAmount, 2);

  const contracts = getEscortActiveContracts().filter(c => c.characterId !== app.characterId);
  const contract: EscortActiveContract = {
    i: nextContractId(contracts),
    postingId: posting.i,
    burgId: posting.burgId,
    stateId: posting.stateId,
    destinationBurgId: posting.destinationBurgId,
    characterId: app.characterId,
    kind: posting.kind,
    transport: posting.transport,
    fee: posting.fee,
    feePartial: posting.feePartial,
    threatScore: posting.threat.threatScore,
    missionDaysRemaining,
    escrow: escrowAmount,
    label: posting.label
  };
  contracts.push(contract);
  setEscortActiveContracts(contracts);
  addEscortRole(character, contract);
}

export function tickEscortHiring(deltaDays: number, rng?: RNGService): { topics: string[] } {
  const topics = new Set<string>();
  if (!(deltaDays > 0)) return { topics: [] };

  purgeInvalidEscortHireState();

  // 1) Age existing missions first (do not include contracts accepted later this tick).
  const preAcceptIds = new Set(getEscortActiveContracts().map(c => c.i));
  const aged = getEscortActiveContracts().map(contract =>
    preAcceptIds.has(contract.i)
      ? { ...contract, missionDaysRemaining: Math.max(0, contract.missionDaysRemaining - deltaDays) }
      : contract
  );
  setEscortActiveContracts(aged);

  if (ESCORT_RESOLVE_ENABLED && rng) {
    const stillActive: EscortActiveContract[] = [];
    for (const contract of getEscortActiveContracts()) {
      if (contract.missionDaysRemaining > 0) {
        stillActive.push(contract);
        continue;
      }
      const resultTopics = resolveEscortContract(contract, rng);
      for (const t of resultTopics) topics.add(t);
    }
    setEscortActiveContracts(stillActive);
  }

  // 2) Advance hire lag; overshoot past lag becomes mission progress in the same batch.
  const remaining: EscortHireApplication[] = [];
  const toAccept: { app: EscortHireApplication; overshoot: number }[] = [];
  for (const app of getEscortHireApplications()) {
    const daysLeft = app.daysRemaining - deltaDays;
    if (daysLeft > 0) {
      remaining.push({ ...app, daysRemaining: daysLeft });
    } else {
      toAccept.push({ app, overshoot: -daysLeft });
    }
  }
  setEscortHireApplications(remaining);
  for (const { app, overshoot } of toAccept) {
    acceptApplication(app, overshoot);
  }

  // 3) Resolve contracts that finished entirely within this multi-day batch (lag overshoot ≥ mission).
  if (ESCORT_RESOLVE_ENABLED && rng) {
    const stillActive: EscortActiveContract[] = [];
    for (const contract of getEscortActiveContracts()) {
      if (contract.missionDaysRemaining > 0) {
        stillActive.push(contract);
        continue;
      }
      const resultTopics = resolveEscortContract(contract, rng);
      for (const t of resultTopics) topics.add(t);
    }
    setEscortActiveContracts(stillActive);
  }

  daysSinceAnonRound += deltaDays;
  while (daysSinceAnonRound >= ESCORT_ANON_ROUND_DAYS) {
    daysSinceAnonRound -= ESCORT_ANON_ROUND_DAYS;
    runAnonymousEscortRound();
  }

  if (topics.size) {
    topics.add("extension.economy");
    topics.add("simulation.states");
  }
  return { topics: [...topics] };
}

function resolveEscortContract(contract: EscortActiveContract, rng: RNGService): string[] {
  const world = getWorldContext();
  const named = contract.characterId != null;
  const character = named ? world.pack.characters?.find(c => c.i === contract.characterId) : undefined;

  if (named && (!character || character.dead)) {
    disposeContract(contract, "forfeit", new Map(world.pack.characters?.map(c => [c.i, c]) ?? []));
    return [];
  }

  const score = named && character ? namedHunterCombatScore(character) : ANON_COMBAT_SCORE;
  const difficulty = escortCombatDifficulty(contract.threatScore, contract.kind, contract.transport);
  // Map threat into a pseudo-rarity for death checks (1–5).
  const rarity = Math.max(1, Math.min(5, Math.round(1 + contract.threatScore * 3)));

  const combat = resolveCullCombat({
    combatScore: score,
    difficulty,
    rarity,
    rng
  });
  contract.lastOutcome = combat.outcome as EscortEcologyOutcome;

  if (named && character && combat.outcome === "dead") {
    character.dead = true;
    character.deathYear = getSimulationYear();
    removeEscortRole(character);
    cancelConstructionApplication(character.i);
    resignConstructionJob(character.i);
    // Mutual exclusion prevents simultaneous cull; dead flag purges other boards on next tick.
    return [];
  }

  const topics: string[] = [];

  // Soft ecology: successful escorts thin bandit pressure on the origin state.
  if (combat.intensity > 0 && combat.outcome !== "fail") {
    if (applyEscortBanditSuppression(contract.stateId, combat.intensity * (named ? 1 : 0.5))) {
      topics.push("extension.economy");
    }
  }

  if (named && character && (combat.outcome === "success" || combat.outcome === "partial")) {
    payEscortFee(contract, character, combat.outcome);
    // Arrive at destination after a successful / partial escort.
    character.location = contract.destinationBurgId;
  }

  if (named && character && combat.injured) {
    applyInjury(character);
  }

  // Reuse cull martial practice credit (same sword/bow growth path).
  if (named && character && !character.dead) {
    const practice = applyCullPracticeCredit(character, combat.outcome, combat.injured);
    if (practice) topics.push("extension.economy");
  }

  if (named && character) removeEscortRole(character);
  return topics;
}

/**
 * Shrink bandit cohorts targeting this state slightly on successful escorts.
 * Models guards reducing outlaw strength along commercial roads.
 */
function applyEscortBanditSuppression(stateId: number, intensity: number): boolean {
  if (!(intensity > 0) || !(stateId > 0)) return false;
  const cohorts = getBanditCohorts();
  if (!cohorts.length) return false;

  let changed = false;
  const next = cohorts
    .map(cohort => {
      if (cohort.targetState !== stateId) return cohort;
      const adults = (cohort.maleAdults ?? 0) + (cohort.femaleAdults ?? 0);
      if (adults <= 0) return cohort;
      const cut = Math.max(1, Math.floor(adults * 0.05 * intensity));
      const maleCut = Math.min(cohort.maleAdults ?? 0, Math.ceil(cut / 2));
      const femaleCut = Math.min(cohort.femaleAdults ?? 0, cut - maleCut);
      if (maleCut + femaleCut <= 0) return cohort;
      changed = true;
      return {
        ...cohort,
        maleAdults: Math.max(0, (cohort.maleAdults ?? 0) - maleCut),
        femaleAdults: Math.max(0, (cohort.femaleAdults ?? 0) - femaleCut)
      };
    })
    .filter(c => (c.maleAdults ?? 0) + (c.femaleAdults ?? 0) > 0);

  if (changed) setBanditCohorts(next);
  return changed;
}

function payEscortFee(contract: EscortActiveContract, character: Character, outcome: "success" | "partial"): void {
  const state = getWorldContext().pack.states?.[contract.stateId];
  if (!state?.i) return;

  const targetPay = outcome === "success" ? contract.fee : contract.feePartial;
  const alreadyEscrowed = contract.escrow;
  const extraWanted = Math.max(0, targetPay - alreadyEscrowed);
  const available = Math.max(0, (state.treasury ?? 0) - ESCORT_TREASURY_RESERVE);
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
  const cooldowns = { ...getEscortCooldowns() };
  cooldowns[String(character.i)] = getSimulationOrdinalDay() + ESCORT_INJURY_COOLDOWN_DAYS;
  setEscortCooldowns(cooldowns);
  character.wealth = rn(Math.max(0, (character.wealth || 0) - ESCORT_INJURY_WEALTH_LOSS), 2);
}

function runAnonymousEscortRound(): void {
  const apps = [...getEscortHireApplications()];
  let nextId = nextApplicationId(apps);
  const postsWithPendingAnon = new Set(apps.filter(a => a.characterId === null).map(a => a.postingId));

  for (const post of getEscortJobPostings()) {
    if (post.expiresInDays <= 0) continue;
    if (postsWithPendingAnon.has(post.i)) continue;
    if (getLiveEscortOpenSeats(post.i) <= 0) continue;
    if (!isPostingValid(post)) continue;
    apps.push({
      i: nextId++,
      postingId: post.i,
      burgId: post.burgId,
      characterId: null,
      daysRemaining: ESCORT_ANON_HIRE_LAG_DAYS
    });
    postsWithPendingAnon.add(post.i);
  }
  setEscortHireApplications(apps);
}

export function getCharacterEscortContract(characterId: number): EscortActiveContract | null {
  return getEscortActiveContracts().find(c => c.characterId === characterId) ?? null;
}

export function getCharacterPendingEscortApplication(characterId: number): EscortHireApplication | null {
  return getEscortHireApplications().find(app => app.characterId === characterId) ?? null;
}
