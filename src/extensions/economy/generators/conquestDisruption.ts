import { minmax, rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext, isEconomyContextReady } from "../economyContext";
import { applyConquestDisruptionToAcademies } from "./academyKnowledge";
import { applyGreatLibraryConquestDisruption } from "./greatLibrary";
import { applyConquestDisruptionToGuilds } from "./guildKnowledge";

/** Share of treasury and market stock taken at discipline 1 (no commander bonus). */
export const CONQUEST_BASE_LOOT_SHARE = 0.35;
export const CONQUEST_MIN_LOOT_SHARE = 0.1;
export const CONQUEST_MAX_LOOT_SHARE = 0.5;
/** Of the taken share, this fraction is confiscated to the conqueror; the rest is destroyed. */
export const CONQUEST_CONFISCATE_FRACTION = 0.6;

export interface ConquestDisruptionOptions {
  /**
   * Occupying-army discipline (`commanderPowerMultiplier` from Nobility). 1 = no commander.
   * Higher values shrink the loot share (a well-led army sacks less wantonly).
   */
  disciplineMultiplier?: number;
}

export function getConquestLootShare(disciplineMultiplier: number | undefined): number {
  const discipline =
    typeof disciplineMultiplier === "number" && Number.isFinite(disciplineMultiplier) && disciplineMultiplier > 0
      ? disciplineMultiplier
      : 1;
  return rn(minmax(CONQUEST_BASE_LOOT_SHARE / discipline, CONQUEST_MIN_LOOT_SHARE, CONQUEST_MAX_LOOT_SHARE), 4);
}

/**
 * Single entry point for Nobility's captureBurg() (docs/plan/knowledge-guild-system.md §4 point 4,
 * §8.1 decision 3, §9 Phase 7) to disrupt a conquered Burg's Burg-scoped technique stocks. Both
 * GuildKnowledgeStock and AcademyKnowledgeStock are keyed purely by burgId, so without this a
 * conqueror would inherit a captured city's full accumulated technique for free the instant it
 * falls — this penalty plus the existing annual EWMA settling under the new owner is what actually
 * realizes "gradual integration over years, with room for loss in the chaos" instead of instant
 * full absorption. StateSecretStock/MartialDisciplineStock are State-scoped, not Burg-scoped, so
 * losing one city doesn't touch them — nothing to disrupt there.
 *
 * Cross-extension caller (Nobility) may run before, or entirely without, this extension's own
 * init having run — degrades to a no-op instead of throwing when economy's context isn't ready,
 * same guard as getMartialDisciplineMultiplier (§9 Phase 5).
 */
export function applyConquestDisruption(burgId: number, options?: ConquestDisruptionOptions): void {
  if (!isEconomyContextReady()) return;

  applyConquestDisruptionToGuilds(burgId);
  applyConquestDisruptionToAcademies(burgId);
  // docs/plan/great-library.md §征服・占領 — one-shot progress/endowment penalty plus a chance of
  // outright ruin. Burg-scoped like the two calls above; the project's stateId (patron) does not
  // change, so it registers as "occupied" in GreatLibrary.settleAnnual() going forward.
  applyGreatLibraryConquestDisruption(burgId);
  // Physical sack: treasury + market stock. captureBurg() has already assigned burg.state to the
  // winner, so confiscated coin lands in the conqueror's purse.
  // docs/plan/economy-coupling-audit.md L9-c. economy-war.md has no loot rules to reconcile.
  applyConquestPhysicalLoot(burgId, options?.disciplineMultiplier ?? 1);
}

export function applyConquestPhysicalLoot(burgId: number, disciplineMultiplier = 1): void {
  const { pack } = getWorldContext();
  const burg = pack.burgs?.[burgId];
  if (!burg || burg.removed) return;

  const share = getConquestLootShare(disciplineMultiplier);
  const confiscateRate = share * CONQUEST_CONFISCATE_FRACTION;
  const destroyRate = share * (1 - CONQUEST_CONFISCATE_FRACTION);
  const conqueror = typeof burg.state === "number" ? pack.states?.[burg.state] : undefined;

  const treasury = burg.treasury || 0;
  if (treasury > 0) {
    const confiscated = rn(treasury * confiscateRate, 2);
    const destroyed = rn(treasury * destroyRate, 2);
    burg.treasury = rn(Math.max(0, treasury - confiscated - destroyed), 2);
    if (confiscated > 0 && conqueror?.i) {
      conqueror.treasury = rn((conqueror.treasury || 0) + confiscated, 2);
    }
  }

  const market = getMarkets().find(entry => entry.centerBurgId === burgId);
  if (!market) return;

  const goodsById = new Map(getGoods().map(good => [good.i, good]));
  let confiscatedValue = 0;
  for (const [id, row] of Object.entries(market.goods)) {
    if (!row || !(row.stock > 0)) continue;
    const taken = row.stock * share;
    const unitValue = row.price > 0 ? row.price : (goodsById.get(+id)?.value ?? 0);
    confiscatedValue += taken * CONQUEST_CONFISCATE_FRACTION * unitValue;
    row.stock = rn(Math.max(0, row.stock - taken), 2);
  }
  if (confiscatedValue > 0 && conqueror?.i) {
    conqueror.treasury = rn((conqueror.treasury || 0) + rn(confiscatedValue, 2), 2);
  }
}
