import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getBurgTreasuryLastSettledYear,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getWorldContext,
  setBurgTreasuryLastSettledYear,
  setGuildKnowledgeStocks
} from "../economyContext";
import { STARTING_BURG_TREASURY_PER_POPULATION } from "./foodProduction";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import { Markets } from "./markets-generator";

/**
 * Share of a craft-domain manufactured Good's after-tax sale revenue routed to that domain guild's
 * own treasury instead of burg.treasury (docs/plan/burg-treasury-equilibrium.md §3.1) — the
 * private-industry/public-city accounting split. Placeholder — not yet balance-tuned.
 */
export const GUILD_PROFIT_SHARE = 0.35;
/**
 * Share of a domain guild's own treasury trickled back to its Burg per production cycle while the
 * Burg is below its comfortable level (§3.2). Placeholder — not yet balance-tuned.
 */
export const GUILD_PAYOUT_RATE = 0.15;
/**
 * How many cycles' worth of a Burg's current net product (burg.product, i.e. the per-capita
 * "Wealth" figure denormalized back to an absolute amount) count as its comfortable working-capital
 * buffer. Resolves the design doc's open "快適水準" question by using product — a recent-earnings
 * figure — as the basis rather than population alone. Placeholder — not yet balance-tuned.
 */
export const COMFORTABLE_TREASURY_MULTIPLIER = 4;
/**
 * Share of a Burg's annual treasury surplus above its comfortable level routed to its Market's
 * shared treasury; the remainder goes to its State's treasury (§3.3). Placeholder — not yet
 * balance-tuned.
 */
export const MARKET_SHARE = 0.5;

/**
 * A Burg's comfortable working-capital level: COMFORTABLE_TREASURY_MULTIPLIER cycles of its current
 * product, floored by a population-scaled minimum (STARTING_BURG_TREASURY_PER_POPULATION, the same
 * constant used to seed a fresh Burg's starting treasury) so a Burg with zero recent product isn't
 * treated as permanently "in surplus" the instant it holds any treasury at all — it still gets a
 * population-sized cushion to try to restart production with (docs/plan/
 * burg-treasury-equilibrium.md §3.3).
 */
export function getComfortableTreasuryLevel(burg: Burg): number {
  const populationFloor = (burg.population ?? 0) * STARTING_BURG_TREASURY_PER_POPULATION;
  const productBased = (burg.product ?? 0) * COMFORTABLE_TREASURY_MULTIPLIER;
  return Math.max(populationFloor, productBased);
}

export class GuildTreasuryModule {
  /**
   * Credits a domain guild's private treasury at one Burg, creating its GuildKnowledgeStock entry
   * (stock=0) if this domain has never accumulated technique there yet — capital and technique
   * accumulate independently (§3.1).
   */
  creditGuildTreasury(burgId: number, domain: CraftKnowledgeDomain, amount: number): void {
    if (!burgId || !(amount > 0)) return;

    const stocks = getGuildKnowledgeStocks();
    const entry = stocks.find(candidate => candidate.burgId === burgId && candidate.domain === domain);
    if (entry) {
      entry.treasury = rn((entry.treasury || 0) + amount, 2);
      setGuildKnowledgeStocks(stocks);
      return;
    }

    setGuildKnowledgeStocks([...stocks, { burgId, domain, stock: 0, treasury: rn(amount, 2) }]);
  }

  /**
   * Trickles money from a struggling Burg's own domain guilds back into burg.treasury, up to each
   * guild's own balance and the Burg's shortfall below its comfortable level — a recovery chance
   * for treasury=0 Burgs that isn't unlimited free money (§3.2). No-op once the Burg reaches its
   * comfortable level, or if none of its guilds have anything to give.
   */
  payoutStrugglingBurg(burg: Burg): void {
    if (!burg.i) return;

    let shortfall = getComfortableTreasuryLevel(burg) - (burg.treasury || 0);
    if (shortfall <= 0.01) return;

    const stocks = getGuildKnowledgeStocks();
    let changed = false;
    for (const entry of stocks) {
      if (shortfall <= 0.01) break;
      if (entry.burgId !== burg.i || !(entry.treasury > 0)) continue;

      const payout = rn(Math.min(entry.treasury * GUILD_PAYOUT_RATE, shortfall), 2);
      if (payout <= 0) continue;

      entry.treasury = rn(entry.treasury - payout, 2);
      burg.treasury = rn((burg.treasury || 0) + payout, 2);
      shortfall -= payout;
      changed = true;
    }

    if (changed) setGuildKnowledgeStocks(stocks);
  }

  /**
   * Annual: sweeps every Burg's treasury surplus above its comfortable level into its Market's
   * shared treasury and its State's treasury, so the surplus is consumed by existing systemic sinks
   * (ag/industrial tech investment, military upkeep, trade security, frontier expansion) instead of
   * accumulating without bound or requiring a new isolated sink (§3.3). Self-gates to once per
   * simulation year, same pattern as GuildKnowledge.settleAnnual().
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getBurgTreasuryLastSettledYear() === year) return false;
    setBurgTreasuryLastSettledYear(year);

    const { burgs, states } = getWorldContext().pack;
    for (const burg of burgs) {
      if (!burg.i || burg.removed) continue;

      const comfortable = getComfortableTreasuryLevel(burg);
      const surplus = (burg.treasury || 0) - comfortable;
      if (surplus <= 0.01) continue;

      burg.treasury = rn(comfortable, 2);
      const marketShare = rn(surplus * MARKET_SHARE, 2);
      const stateShare = rn(surplus - marketShare, 2);

      const market = Markets.get(burg.market);
      if (market) {
        const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
        treasury.balance = rn(treasury.balance + marketShare, 2);
        market.marketTreasury = treasury;
      } else {
        // No Market to receive it — keep it with the Burg rather than discard it.
        burg.treasury = rn(burg.treasury + marketShare, 2);
      }

      const state = burg.state ? states[burg.state] : undefined;
      if (state?.i) {
        state.treasury = rn((state.treasury || 0) + stateShare, 2);
      } else {
        // Neutral/unowned Burg has no State treasury to receive it — keep it with the Burg.
        burg.treasury = rn(burg.treasury + stateShare, 2);
      }
    }

    return true;
  }
}

export const GuildTreasury = new GuildTreasuryModule();
