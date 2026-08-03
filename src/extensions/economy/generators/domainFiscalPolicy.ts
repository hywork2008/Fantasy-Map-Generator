import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";

/**
 * Multi-ledger PR-7/PR-8/PR-12 — thin domain fiscal policy for province seats (L3b).
 * Stored on `burg.domainFiscalPolicy`; applied once per tax cycle after lord stipends.
 * PR-12: domain levy scales state poll-tax collection; construction queue picks works target.
 */

export type DomainFiscalPolicy = "balanced" | "extract" | "fortify";

/** PR-12 fortify completion target (construction queue item). */
export type DomainWorksTarget = "walls" | "citadel" | "plaza";

export const DOMAIN_POLICY_CYCLE: readonly DomainFiscalPolicy[] = ["balanced", "extract", "fortify"] as const;
export const DOMAIN_WORKS_TARGETS: readonly DomainWorksTarget[] = ["walls", "citadel", "plaza"] as const;

/** Extract: share of post-stipend domain treasury auto-remitted to state L2. */
export const DOMAIN_EXTRACT_REMIT_RATE = 0.1;
/** Extract: share skimmed to the living province lord's personal L0. */
export const DOMAIN_EXTRACT_PERSONAL_RATE = 0.02;
/** Fortify: share of domain treasury consumed on local works. */
export const DOMAIN_FORTIFY_SPEND_RATE = 0.08;
/** Fortify: security points gained per cycle (capped at 100). */
export const DOMAIN_FORTIFY_SECURITY_GAIN = 1;
/** Fortify: works progress points per cycle toward walls/citadel completion. */
export const DOMAIN_FORTIFY_WORKS_PROGRESS = 12;
/** Default domain levy multiplier (PR-8). */
export const DOMAIN_LEVY_RATE_DEFAULT = 1;
export const DOMAIN_LEVY_RATE_MIN = 0.5;
export const DOMAIN_LEVY_RATE_MAX = 1.5;
export const DOMAIN_LEVY_RATE_STEP = 0.25;
/** PR-12: poll-tax multiplier range mapped from average domain levy (0.5→0.9, 1.0→1.0, 1.5→1.1). */
export const DOMAIN_POLL_MULT_MIN = 0.9;
export const DOMAIN_POLL_MULT_MAX = 1.1;

export interface DomainPolicyApplication {
  burgId: number;
  policy: DomainFiscalPolicy;
  remittedToState: number;
  toLordPersonal: number;
  fortifySpent: number;
  securityGain: number;
  worksProgressGain: number;
  worksCompleted: boolean;
}

export function clampDomainLevyRate(value: number | undefined): number {
  if (!(typeof value === "number") || !Number.isFinite(value)) return DOMAIN_LEVY_RATE_DEFAULT;
  return rn(Math.max(DOMAIN_LEVY_RATE_MIN, Math.min(DOMAIN_LEVY_RATE_MAX, value)), 2);
}

export function cycleDomainLevyRate(current: number | undefined, direction: 1 | -1): number {
  const cur = clampDomainLevyRate(current);
  return clampDomainLevyRate(cur + direction * DOMAIN_LEVY_RATE_STEP);
}

export function normalizeDomainFiscalPolicy(value: string | undefined): DomainFiscalPolicy {
  if (value === "extract" || value === "fortify" || value === "balanced") return value;
  return "balanced";
}

export function cycleDomainFiscalPolicy(current: string | undefined): DomainFiscalPolicy {
  const cur = normalizeDomainFiscalPolicy(current);
  const idx = DOMAIN_POLICY_CYCLE.indexOf(cur);
  return DOMAIN_POLICY_CYCLE[(idx + 1) % DOMAIN_POLICY_CYCLE.length]!;
}

export function normalizeDomainWorksTarget(value: string | undefined): DomainWorksTarget {
  if (value === "walls" || value === "citadel" || value === "plaza") return value;
  return "walls";
}

export function cycleDomainWorksTarget(current: string | undefined): DomainWorksTarget {
  const cur = normalizeDomainWorksTarget(current);
  const idx = DOMAIN_WORKS_TARGETS.indexOf(cur);
  return DOMAIN_WORKS_TARGETS[(idx + 1) % DOMAIN_WORKS_TARGETS.length]!;
}

/**
 * PR-12: map average domain levy (0.5–1.5) to a poll-tax collection multiplier (0.9–1.1).
 * Extract-policy seats weigh slightly heavier (harsher local extraction feeds the state levy).
 */
export function domainLevyToPollMultiplier(averageLevy: number, extractShare = 0): number {
  const levy = clampDomainLevyRate(averageLevy);
  const t = (levy - DOMAIN_LEVY_RATE_MIN) / (DOMAIN_LEVY_RATE_MAX - DOMAIN_LEVY_RATE_MIN);
  let mult = DOMAIN_POLL_MULT_MIN + t * (DOMAIN_POLL_MULT_MAX - DOMAIN_POLL_MULT_MIN);
  // Extract seats push collection slightly harder (up to +3%).
  mult += Math.max(0, Math.min(1, extractShare)) * 0.03;
  return rn(Math.max(DOMAIN_POLL_MULT_MIN, Math.min(DOMAIN_POLL_MULT_MAX + 0.03, mult)), 3);
}

/**
 * Average domain levy across province seats of this state → poll-tax multiplier.
 * Neutral / no seats → 1.0.
 */
export function getStateDomainPollTaxMultiplier(state: Pick<State, "i">): number {
  if (!state.i) return 1;
  try {
    const { pack } = getWorldContext();
    let levySum = 0;
    let seatCount = 0;
    let extractCount = 0;
    for (const province of pack.provinces || []) {
      if (!province?.i || province.removed || province.state !== state.i || !province.burg) continue;
      const burg = pack.burgs?.[province.burg];
      if (!burg || burg.removed) continue;
      levySum += clampDomainLevyRate(burg.domainLevyRate);
      seatCount += 1;
      if (normalizeDomainFiscalPolicy(burg.domainFiscalPolicy) === "extract") extractCount += 1;
    }
    if (!(seatCount > 0)) return 1;
    const avg = levySum / seatCount;
    return domainLevyToPollMultiplier(avg, extractCount / seatCount);
  } catch {
    return 1;
  }
}

function completeDomainWorksTarget(burg: Burg): DomainWorksTarget {
  const target = normalizeDomainWorksTarget(burg.domainWorksTarget);
  if (target === "walls") burg.walls = 1;
  else if (target === "citadel") burg.citadel = 1;
  else if (target === "plaza") burg.plaza = 1;
  // Advance queue to the next target that is still missing (thin circular queue).
  let next = cycleDomainWorksTarget(target);
  for (let i = 0; i < DOMAIN_WORKS_TARGETS.length; i++) {
    if (next === "walls" && !burg.walls) break;
    if (next === "citadel" && !burg.citadel) break;
    if (next === "plaza" && !burg.plaza) break;
    next = cycleDomainWorksTarget(next);
  }
  burg.domainWorksTarget = next;
  return target;
}

/**
 * Apply one seat's domain policy. Mutates burg (+ state / lord when extract).
 */
export function applyDomainPolicyToBurg(
  burg: Burg,
  state: State | undefined,
  lordWealthTarget: { wealth?: number } | undefined
): DomainPolicyApplication {
  const policy = normalizeDomainFiscalPolicy(burg.domainFiscalPolicy);
  const levy = clampDomainLevyRate(burg.domainLevyRate);
  const result: DomainPolicyApplication = {
    burgId: burg.i || 0,
    policy,
    remittedToState: 0,
    toLordPersonal: 0,
    fortifySpent: 0,
    securityGain: 0,
    worksProgressGain: 0,
    worksCompleted: false
  };

  if (policy === "balanced") return result;
  const treasury = burg.treasury || 0;
  if (!(treasury > 0) && policy === "extract") return result;

  if (policy === "extract") {
    const remit = rn(treasury * DOMAIN_EXTRACT_REMIT_RATE * levy, 2);
    const personal = rn(treasury * DOMAIN_EXTRACT_PERSONAL_RATE * levy, 2);
    const total = rn(remit + personal, 2);
    if (!(total > 0)) return result;

    // Prefer full extract split when cash allows; otherwise pro-rata.
    const scale = treasury >= total ? 1 : treasury / total;
    const paidRemit = rn(remit * scale, 2);
    const paidPersonal = rn(personal * scale, 2);
    burg.treasury = rn(treasury - paidRemit - paidPersonal, 2);

    if (paidRemit > 0 && state?.i) {
      state.treasury = rn((state.treasury || 0) + paidRemit, 2);
      result.remittedToState = paidRemit;
    }
    if (paidPersonal > 0 && lordWealthTarget) {
      lordWealthTarget.wealth = rn((lordWealthTarget.wealth || 0) + paidPersonal, 2);
      result.toLordPersonal = paidPersonal;
    }
    return result;
  }

  // fortify — spend cash when available, always advance works progress a little when funded.
  if (treasury > 0) {
    const spent = rn(treasury * DOMAIN_FORTIFY_SPEND_RATE * levy, 2);
    if (spent > 0) {
      burg.treasury = rn(treasury - spent, 2);
      result.fortifySpent = spent;
    }
  }
  const security = burg.security ?? 50;
  if (security < 100 && result.fortifySpent > 0) {
    const gain = Math.min(DOMAIN_FORTIFY_SECURITY_GAIN, 100 - security);
    burg.security = rn(security + gain, 2);
    result.securityGain = gain;
  }
  if (result.fortifySpent > 0) {
    const prev = burg.domainWorksProgress || 0;
    const next = Math.min(100, prev + DOMAIN_FORTIFY_WORKS_PROGRESS);
    result.worksProgressGain = next - prev;
    burg.domainWorksProgress = next;
    if (prev < 100 && next >= 100) {
      result.worksCompleted = true;
      // PR-12: complete the queued construction target (walls / citadel / plaza).
      completeDomainWorksTarget(burg);
      burg.domainWorksProgress = 0; // allow another works cycle later
    }
  }
  return result;
}

/**
 * Apply domain fiscal policy for every province seat of every non-neutral state.
 */
export function applyAllDomainFiscalPolicies(): DomainPolicyApplication[] {
  const { pack } = getWorldContext();
  const results: DomainPolicyApplication[] = [];
  const characters = hasCharactersContext() ? getCharacters() : [];

  for (const state of pack.states || []) {
    if (!state?.i || state.removed) continue;
    for (const province of pack.provinces || []) {
      if (!province?.i || province.removed || province.state !== state.i || !province.burg) continue;
      const burg = pack.burgs?.[province.burg];
      if (!burg || burg.removed) continue;
      if (normalizeDomainFiscalPolicy(burg.domainFiscalPolicy) === "balanced") continue;

      const lord = characters.find(
        character =>
          !character.dead &&
          character.titles.some(holding => holding.entityType === "province" && holding.entityId === province.i)
      );
      results.push(applyDomainPolicyToBurg(burg, state, lord));
    }
  }
  return results;
}

/** Resolve the domain seat burg for a province-titled character. */
export function resolveDomainBurgForCharacter(characterId: number): Burg | null {
  if (!hasCharactersContext()) return null;
  const character = getCharacters().find(c => c.i === characterId && !c.dead);
  if (!character) return null;
  const holding = character.titles?.find(t => t.endYear === undefined && t.entityType === "province");
  if (!holding) return null;
  const { pack } = getWorldContext();
  const province = pack.provinces?.[holding.entityId];
  const burgId = province?.burg;
  if (!burgId) return null;
  const burg = pack.burgs?.[burgId];
  if (!burg || burg.removed) return null;
  return burg;
}

export function setDomainFiscalPolicyForCharacter(
  characterId: number,
  policy: DomainFiscalPolicy
): { ok: boolean; policy?: DomainFiscalPolicy; error?: string } {
  const burg = resolveDomainBurgForCharacter(characterId);
  if (!burg) return { ok: false, error: "Character has no provincial domain seat" };
  burg.domainFiscalPolicy = policy;
  return { ok: true, policy };
}

export function cycleDomainFiscalPolicyForCharacter(characterId: number): {
  ok: boolean;
  policy?: DomainFiscalPolicy;
  error?: string;
} {
  const burg = resolveDomainBurgForCharacter(characterId);
  if (!burg) return { ok: false, error: "Character has no provincial domain seat" };
  const next = cycleDomainFiscalPolicy(burg.domainFiscalPolicy);
  burg.domainFiscalPolicy = next;
  return { ok: true, policy: next };
}

export function adjustDomainLevyForCharacter(
  characterId: number,
  direction: 1 | -1
): { ok: boolean; levyRate?: number; error?: string } {
  const burg = resolveDomainBurgForCharacter(characterId);
  if (!burg) return { ok: false, error: "Character has no provincial domain seat" };
  const next = cycleDomainLevyRate(burg.domainLevyRate, direction);
  burg.domainLevyRate = next;
  return { ok: true, levyRate: next };
}

/** Province lord cycles the next fortify construction target (PR-12 queue). */
export function cycleDomainWorksTargetForCharacter(characterId: number): {
  ok: boolean;
  target?: DomainWorksTarget;
  error?: string;
} {
  const burg = resolveDomainBurgForCharacter(characterId);
  if (!burg) return { ok: false, error: "Character has no provincial domain seat" };
  const next = cycleDomainWorksTarget(burg.domainWorksTarget);
  burg.domainWorksTarget = next;
  return { ok: true, target: next };
}

/**
 * Province lord funds works immediately from domain treasury (manual construction queue push).
 * Consumes cash and advances progress without waiting for the tax-cycle fortify policy.
 */
export function fundDomainWorksForCharacter(
  characterId: number,
  amount = 5
): { ok: boolean; spent?: number; progress?: number; completed?: boolean; target?: DomainWorksTarget; error?: string } {
  const burg = resolveDomainBurgForCharacter(characterId);
  if (!burg) return { ok: false, error: "Character has no provincial domain seat" };
  const want = Math.max(0, amount);
  const cash = burg.treasury || 0;
  const spent = rn(Math.min(want, cash), 2);
  if (!(spent > 0)) return { ok: false, error: "Domain treasury is empty" };

  burg.treasury = rn(cash - spent, 2);
  // Progress scales with spend (5 SP ≈ one fortify-cycle worth of progress).
  const progressGain = rn(Math.min(100, (spent / 5) * DOMAIN_FORTIFY_WORKS_PROGRESS), 1);
  const prev = burg.domainWorksProgress || 0;
  const next = Math.min(100, prev + progressGain);
  burg.domainWorksProgress = next;

  let completed = false;
  let target: DomainWorksTarget | undefined;
  if (prev < 100 && next >= 100) {
    completed = true;
    target = completeDomainWorksTarget(burg);
    burg.domainWorksProgress = 0;
  }

  // Nudge policy toward fortify so the seat is marked as building.
  if (normalizeDomainFiscalPolicy(burg.domainFiscalPolicy) === "balanced") {
    burg.domainFiscalPolicy = "fortify";
  }

  return {
    ok: true,
    spent,
    progress: burg.domainWorksProgress,
    completed,
    target
  };
}
