/**
 * Phase D — connect backstory/personality to live simulation decisions.
 * Spec: docs/plan/characters/backstory-profile.md §12 Phase D
 *
 * Pure helpers over Character data; call sites live in Nobility / Economy.
 */
import { adjustSolidarity, getFavor, getSolidarity, offerGift } from "./backstoryProfile";
import type { Character, CommitmentKind } from "./characterTypes";

// ---------------------------------------------------------------------------
// Derived patriotism (no stored field — orientation from Commitment + honor)
// ---------------------------------------------------------------------------

/**
 * 0–100 effective patriotism: how strongly the character subordinates self to
 * state / people / liege. Used as a soft AI bias, not a new personality roll.
 */
export function getEffectivePatriotism(character: Character): number {
  const p = character.personality;
  const primary = character.backstory?.commitment.primary.kind;
  const secondary = character.backstory?.commitment.secondary?.kind;
  let score = p.honor * 0.35 + (100 - p.greed) * 0.15 + (100 - p.guile) * 0.1;

  const boost = (kind: CommitmentKind | undefined, weight: number) => {
    if (kind === "state" || kind === "people" || kind === "liege" || kind === "nation_culture") {
      score += weight;
    } else if (kind === "self" || kind === "wealth" || kind === "hedonism") {
      score -= weight * 0.6;
    } else if (kind === "house" || kind === "domain") {
      score += weight * 0.35; // local patriotism
    }
  };
  boost(primary, 28);
  boost(secondary, 12);

  const intensity = character.backstory?.commitment.intensity ?? p.zeal;
  if (primary === "state" || primary === "people") {
    score += (intensity - 50) * 0.2;
  }

  return Math.max(1, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// War drive (strategic planner)
// ---------------------------------------------------------------------------

export interface WarDriveContext {
  isCornered: boolean;
  historicallyOwn: boolean;
  /** Target state's primary culture id when known. */
  targetCulture?: number;
}

export interface WarDriveModifiers {
  /** Multiplies required force (lower → more reckless). */
  forceRequirementMultiplier: number;
  /** Extra starting tension on new goals. */
  initialTensionBonus: number;
  /** Multiplies annual tension growth. */
  tensionSpeedMultiplier: number;
  justification: string;
}

export function getWarDriveModifiers(ruler: Character | undefined, context: WarDriveContext): WarDriveModifiers {
  if (context.isCornered) {
    return {
      forceRequirementMultiplier: 1,
      initialTensionBonus: 0,
      tensionSpeedMultiplier: 1,
      justification: "overwhelming_force_crush"
    };
  }

  if (!ruler) {
    return {
      forceRequirementMultiplier: 1,
      initialTensionBonus: 0,
      tensionSpeedMultiplier: 1,
      justification: context.historicallyOwn ? "reconquest" : "border_expansion"
    };
  }

  const p = ruler.personality;
  const primary = ruler.backstory?.commitment.primary.kind;
  const secondary = ruler.backstory?.commitment.secondary?.kind;
  const intensity = ruler.backstory?.commitment.intensity ?? p.zeal;
  const patriotism = getEffectivePatriotism(ruler);

  let forceMul = 1;
  let tensionBonus = 0;
  let tensionSpeed = 1;
  let justification = context.historicallyOwn ? "reconquest" : "border_expansion";

  // Expansionist commitments
  if (primary === "domain" || primary === "wealth" || primary === "house") {
    forceMul *= 0.92;
    tensionBonus += 5 + (p.greed / 100) * 12;
    tensionSpeed *= 1 + p.greed / 200;
    if (primary === "wealth") justification = "resource_grab";
    else if (primary === "house") justification = "dynastic_ambition";
    else justification = context.historicallyOwn ? "reconquest" : "territorial_claim";
  }

  if (primary === "rivalry" || secondary === "rivalry" || p.vengefulness >= 75) {
    forceMul *= 0.88;
    tensionBonus += 8 + p.vengefulness / 10;
    tensionSpeed *= 1.15 + p.vengefulness / 250;
    justification = "blood_feud";
  }

  // Holy war: faith + zeal, especially vs different culture
  const faithDriven = primary === "faith" || (secondary === "faith" && intensity >= 70);
  const cultureClash =
    context.targetCulture !== undefined &&
    context.targetCulture !== 0 &&
    ruler.culture !== 0 &&
    context.targetCulture !== ruler.culture;
  if (faithDriven && p.zeal >= 65 && (cultureClash || p.piety >= 70)) {
    forceMul *= 0.9;
    tensionBonus += 6 + p.zeal / 12;
    tensionSpeed *= 1.1 + p.zeal / 300;
    justification = "holy_war";
  }

  // People / state first: less casual expansion unless reclaiming
  if ((primary === "people" || primary === "state") && !context.historicallyOwn) {
    forceMul *= 1.08;
    tensionSpeed *= 0.92;
    if (patriotism >= 70) forceMul *= 1.05;
  }

  // Recklessness vs caution
  if (p.rationality <= 30 && p.boldness >= 60) {
    forceMul *= 0.85;
    tensionSpeed *= 1.12;
  } else if (p.rationality >= 75) {
    forceMul *= 1.1;
    tensionSpeed *= 0.95;
  }

  if (p.boldness >= 80) forceMul *= 0.9;
  if (p.greed >= 80 && (primary === "domain" || primary === "wealth" || !primary)) {
    tensionBonus += 4;
    if (justification === "border_expansion") justification = "greed_expansion";
  }

  return {
    forceRequirementMultiplier: Math.max(0.55, Math.min(1.35, forceMul)),
    initialTensionBonus: Math.max(0, Math.round(tensionBonus)),
    tensionSpeedMultiplier: Math.max(0.7, Math.min(1.6, tensionSpeed)),
    justification
  };
}

// ---------------------------------------------------------------------------
// Marriage willingness (dynastic AI)
// ---------------------------------------------------------------------------

export interface MarriageEvaluation {
  /** Whether the proposer would accept this match. */
  accept: boolean;
  /** Soft probability weight 0–1 when accept is true (caller may still roll). */
  weight: number;
  reason: string;
}

/**
 * Evaluate whether `ruler` would form a dynastic marriage with `otherRuler`'s state.
 * Uses commitment (house/faith), prestige gap, romantic favor, and personality.
 */
export function evaluateDynasticMarriage(
  ruler: Character,
  otherRuler: Character | undefined,
  options: { otherStatePrestige?: number } = {}
): MarriageEvaluation {
  const p = ruler.personality;
  const primary = ruler.backstory?.commitment.primary.kind;
  let weight = 0.5;
  let reason = "default";

  // Faith first: refuse different culture as proxy for creed mismatch
  if (primary === "faith" || (p.piety >= 80 && p.zeal >= 70)) {
    if (otherRuler && otherRuler.culture !== ruler.culture && otherRuler.culture !== 0 && ruler.culture !== 0) {
      return { accept: false, weight: 0, reason: "faith_culture_mismatch" };
    }
    weight += 0.1;
    reason = "faith_compatible";
  }

  // House first: refuse large prestige downgrade
  if (primary === "house") {
    const otherPrestige = otherRuler?.prestige ?? options.otherStatePrestige ?? 40;
    if (otherPrestige < ruler.prestige - 25) {
      return { accept: false, weight: 0, reason: "house_prestige_gap" };
    }
    if (otherPrestige >= ruler.prestige) {
      weight += 0.15;
      reason = "house_advantageous";
    }
  }

  // Self / hedonism: appearance-driven
  if (primary === "self" || primary === "hedonism") {
    const app = otherRuler?.appearance ?? 50;
    if (app < 35) return { accept: false, weight: 0, reason: "appearance_reject" };
    weight += (app - 50) / 100;
    reason = "personal_attraction";
  }

  // Romantic favor if known
  if (otherRuler) {
    const fav = getFavor(ruler, otherRuler.i);
    if (fav >= 40) {
      weight += 0.25;
      reason = "romantic_favor";
    } else if (fav <= -30) {
      return { accept: false, weight: 0, reason: "romantic_aversion" };
    }

    // Cross-court solidarity is rare; if present, mild boost
    const sol = getSolidarity(ruler, otherRuler.i);
    if (sol >= 30) weight += 0.1;
    if (sol <= -40) weight -= 0.2;
  }

  // High sociability / diplomacy skills want ties
  weight += (p.sociability - 50) / 200;
  if (ruler.skills.diplomacy >= 70) weight += 0.08;

  // Low honor may still marry for gain
  if (p.honor <= 35 && p.greed >= 60) {
    weight += 0.1;
    reason = "opportunistic_match";
  }

  weight = Math.max(0, Math.min(1, weight));
  if (weight < 0.15) return { accept: false, weight, reason: "weight_too_low" };
  return { accept: true, weight, reason };
}

// ---------------------------------------------------------------------------
// Corruption / embezzlement + optional bribes
// ---------------------------------------------------------------------------

export interface CorruptionEvent {
  characterId: number;
  stateId: number;
  amount: number;
  detected: boolean;
}

/**
 * Officers with high greed, low honor, and wealth/self/office commitment skim
 * from state.treasury into personal wealth. High guile reduces detection.
 * Detected skims sour solidarity with the ruler.
 */
export function applyCharacterCorruption(characters: Character[], deltaYears: number): CorruptionEvent[] {
  if (!(deltaYears > 0) || !characters.length) return [];

  const events: CorruptionEvent[] = [];
  // Group living titled state officers by state
  const byState = new Map<number, Character[]>();
  for (const c of characters) {
    if (c.dead) continue;
    const stateTitles = c.titles.filter(t => t.entityType === "state");
    if (!stateTitles.length) continue;
    const stateId = c.state;
    if (!stateId) continue;
    const list = byState.get(stateId) ?? [];
    list.push(c);
    byState.set(stateId, list);
  }

  // Pack is resolved by caller via mutating character wealth; treasury needs pack access.
  // This function only scores who steals how much; treasury mutation is in the nobility wrapper.
  for (const [, officers] of byState) {
    for (const c of officers) {
      const p = c.personality;
      const primary = c.backstory?.commitment.primary.kind;
      const likesCorruption = c.backstory?.tastes.some(
        t => t.id === "corruption" && t.polarity === "like" && t.intensity >= 50
      );
      const likesGold = c.backstory?.tastes.some(t => t.id === "gold" && t.polarity === "like");
      const dislikesCorruption = c.backstory?.tastes.some(
        t => t.id === "corruption" && t.polarity === "dislike" && t.intensity >= 60
      );

      if (dislikesCorruption) continue;
      if (p.honor >= 70 && p.greed <= 45) continue;

      const motive =
        p.greed >= 65 &&
        p.honor <= 50 &&
        (primary === "wealth" ||
          primary === "self" ||
          primary === "office" ||
          primary === "house" ||
          likesCorruption ||
          likesGold ||
          p.greed >= 80);

      if (!motive) continue;

      // Chance per year scaled by greed and guile (hiding opportunity)
      const chance = ((p.greed - 50) / 100) * 0.35 * deltaYears * (likesCorruption ? 1.4 : 1);
      if (Math.random() > Math.min(0.55, Math.max(0.02, chance))) continue;

      const base = 5 + (p.greed / 100) * 25;
      const amount = Math.round((base + Math.random() * 15) * Math.min(2, deltaYears) * 100) / 100;
      if (!(amount > 0)) continue;

      // Detection: low guile or high zeal for justice
      const detectChance = Math.max(0.05, 0.55 - p.guile / 150 - (p.rationality > 70 ? 0.05 : 0));
      const detected = Math.random() < detectChance;

      events.push({ characterId: c.i, stateId: c.state, amount, detected });
    }
  }

  return events;
}

/**
 * Apply corruption events to wealth/treasury and solidarity.
 * `getStateTreasury` / `setStateTreasury` inject pack.states access without importing world context here.
 */
export function resolveCorruptionEvents(
  characters: Character[],
  events: CorruptionEvent[],
  treasury: {
    get: (stateId: number) => number;
    set: (stateId: number, value: number) => void;
  }
): void {
  const byId = new Map(characters.map(c => [c.i, c]));

  for (const event of events) {
    const thief = byId.get(event.characterId);
    if (!thief || thief.dead) continue;

    const available = treasury.get(event.stateId);
    const taken = Math.min(event.amount, Math.max(0, available));
    if (!(taken > 0)) continue;

    treasury.set(event.stateId, Math.round((available - taken) * 100) / 100);
    thief.wealth = Math.round(((thief.wealth || 0) + taken) * 100) / 100;

    if (event.detected) {
      // Find ruler of same state
      const ruler = characters.find(
        c => !c.dead && c.state === event.stateId && c.titles.some(t => t.entityType === "state" && t.landed)
      );
      if (ruler) {
        // Ruler's solidarity toward thief drops; thief may lose some solidarity toward ruler
        adjustSolidarity(ruler, thief.i, -randInt(15, 40));
        adjustSolidarity(thief, ruler.i, -randInt(5, 15));
      }
      // Partial clawback
      const claw = Math.round(taken * 0.4 * 100) / 100;
      thief.wealth = Math.max(0, Math.round(((thief.wealth || 0) - claw) * 100) / 100);
      treasury.set(event.stateId, Math.round((treasury.get(event.stateId) + claw) * 100) / 100);
    }
  }
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Optional court bribe attempt: a greedy officer with high guile may gift gold to the ruler
 * (or vice versa). Uses offerGift so integrity rules apply (清廉な君主は嫌悪).
 */
export function tryCourtBribe(characters: Character[], stateId: number): boolean {
  const living = characters.filter(c => !c.dead && c.state === stateId);
  const ruler = living.find(c => c.titles.some(t => t.entityType === "state" && t.landed));
  if (!ruler) return false;

  const briber = living.find(c => {
    if (c.i === ruler.i) return false;
    if (!c.titles.some(t => t.entityType === "state" && !t.landed)) return false;
    const p = c.personality;
    const likes = c.backstory?.tastes.some(t => (t.id === "corruption" || t.id === "gold") && t.polarity === "like");
    return p.greed >= 70 && p.guile >= 60 && p.honor <= 45 && (likes || p.greed >= 85) && (c.wealth || 0) >= 20;
  });
  if (!briber) return false;
  if (Math.random() > 0.08) return false;

  const cost = Math.min(briber.wealth || 0, 15 + Math.random() * 25);
  briber.wealth = Math.round(((briber.wealth || 0) - cost) * 100) / 100;
  ruler.wealth = Math.round(((ruler.wealth || 0) + cost) * 100) / 100;

  offerGift(briber, ruler, {
    goodName: "Coins",
    valueHint: Math.min(100, cost * 2),
    intent: "bribe"
  });
  return true;
}
