import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";

/**
 * Multi-ledger PR-7 — thin domain fiscal policy for province seats (L3b).
 * Stored on `burg.domainFiscalPolicy`; applied once per tax cycle after lord stipends.
 */

export type DomainFiscalPolicy = "balanced" | "extract" | "fortify";

export const DOMAIN_POLICY_CYCLE: readonly DomainFiscalPolicy[] = ["balanced", "extract", "fortify"] as const;

/** Extract: share of post-stipend domain treasury auto-remitted to state L2. */
export const DOMAIN_EXTRACT_REMIT_RATE = 0.1;
/** Extract: share skimmed to the living province lord's personal L0. */
export const DOMAIN_EXTRACT_PERSONAL_RATE = 0.02;
/** Fortify: share of domain treasury consumed on local works. */
export const DOMAIN_FORTIFY_SPEND_RATE = 0.08;
/** Fortify: security points gained per cycle (capped at 100). */
export const DOMAIN_FORTIFY_SECURITY_GAIN = 1;

export interface DomainPolicyApplication {
  burgId: number;
  policy: DomainFiscalPolicy;
  remittedToState: number;
  toLordPersonal: number;
  fortifySpent: number;
  securityGain: number;
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

/**
 * Apply one seat's domain policy. Mutates burg (+ state / lord when extract).
 */
export function applyDomainPolicyToBurg(
  burg: Burg,
  state: State | undefined,
  lordWealthTarget: { wealth?: number } | undefined
): DomainPolicyApplication {
  const policy = normalizeDomainFiscalPolicy(burg.domainFiscalPolicy);
  const result: DomainPolicyApplication = {
    burgId: burg.i || 0,
    policy,
    remittedToState: 0,
    toLordPersonal: 0,
    fortifySpent: 0,
    securityGain: 0
  };

  if (policy === "balanced") return result;
  const treasury = burg.treasury || 0;
  if (!(treasury > 0)) return result;

  if (policy === "extract") {
    const remit = rn(treasury * DOMAIN_EXTRACT_REMIT_RATE, 2);
    const personal = rn(treasury * DOMAIN_EXTRACT_PERSONAL_RATE, 2);
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

  // fortify
  const spent = rn(treasury * DOMAIN_FORTIFY_SPEND_RATE, 2);
  if (spent > 0) {
    burg.treasury = rn(treasury - spent, 2);
    result.fortifySpent = spent;
  }
  const security = burg.security ?? 50;
  if (security < 100) {
    const gain = Math.min(DOMAIN_FORTIFY_SECURITY_GAIN, 100 - security);
    burg.security = rn(security + gain, 2);
    result.securityGain = gain;
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
