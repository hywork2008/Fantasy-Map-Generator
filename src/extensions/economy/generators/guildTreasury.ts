import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getBurgTreasuryLastSettledYear,
  getGoods,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getWorldContext,
  setBurgTreasuryLastSettledYear,
  setGuildKnowledgeStocks
} from "../economyContext";
import { backPayCycles, GUILD_MASTER_STIPEND } from "./characterStipends";
import { getEconomyStartProfile } from "./economyStartMode";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import { Markets } from "./markets-generator";

/**
 * Domain's most representative raw/base craft good, seeded into a brand-new guild's home Burg
 * market alongside the working-capital seed below (seedNewGuildWorkingCapital()) — so day-one
 * production isn't blocked on the ore/smelter chain warming up before this domain's finished goods
 * (and thus its guild's own margin income, GUILD_PROFIT_SHARE below) can flow at all. Scoped only to
 * domains guildSuccession.ts's SUCCESSION_DOMAINS actually creates masters for today — no
 * speculative data for domains that don't have guild characters yet.
 */
const NEW_GUILD_STARTER_MATERIAL: Readonly<Partial<Record<CraftKnowledgeDomain, string>>> = {
  metallurgy: "Bronze"
};

/** Units of starter material seeded per back-pay cycle — a kickstart, not a standing subsidy. */
const NEW_GUILD_MATERIAL_UNITS_PER_CYCLE = 1;

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

/**
 * A Burg's comfortable working-capital level: profile-defined cycles of its current product,
 * floored by the profile's population-scaled initial working capital. A Burg with zero recent
 * product is therefore not treated as permanently "in surplus" the instant it holds any treasury —
 * it still gets a population-sized cushion to try to restart production with (docs/plan/
 * burg-treasury-equilibrium.md §3.3).
 */
export function getComfortableTreasuryLevel(burg: Burg): number {
  const profile = getEconomyStartProfile(getWorldContext().options);
  const populationFloor = (burg.population ?? 0) * profile.burgTreasuryPerPopulation;
  const productBased = (burg.product ?? 0) * profile.comfortableTreasuryMultiplier;
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
   * One-time seed fired when guildSuccession.ts's createMaster() establishes a domain guild's
   * first Guild Master: credits a back-pay-equivalent working capital to the guild's own treasury
   * and, for domains with a known starter material, tops up the home Burg's market stock of it.
   *
   * Without this, a brand-new guild's only funding path is GUILD_PROFIT_SHARE off its own finished
   * goods actually clearing the market at a margin — which can stay permanently at 0 when the ore/
   * smelter (or equivalent) chain feeding those goods hasn't warmed up yet, leaving the master (and
   * any apprentice) unpaid indefinitely with no fallback, unlike a Province Lord who always draws
   * from their seated Burg. Fires once per master, not a recurring subsidy.
   */
  seedNewGuildWorkingCapital(burgId: number, domain: CraftKnowledgeDomain): void {
    const profile = getEconomyStartProfile(getWorldContext().options);
    const cycles = rn(backPayCycles() * profile.guildBootstrapMultiplier, 2);
    if (cycles <= 0) return;
    this.creditGuildTreasury(burgId, domain, GUILD_MASTER_STIPEND * cycles);

    const materialName = NEW_GUILD_STARTER_MATERIAL[domain];
    if (!materialName) return;

    const burg = getWorldContext().pack.burgs[burgId] as Burg | undefined;
    if (!burg?.market) return;

    const market = Markets.get(burg.market);
    const good = getGoods().find(candidate => candidate.name === materialName);
    if (!market || !good) return;

    // Only raises stock, never lowers it — safe to call again if this Burg's guild ever loses its
    // master and later gets a new one, without clobbering any real stock accrued in between.
    const targetStock = rn(NEW_GUILD_MATERIAL_UNITS_PER_CYCLE * cycles, 2);
    const existing = market.goods[good.i];
    if (!existing || existing.stock < targetStock) {
      market.goods[good.i] = { stock: targetStock, price: existing?.price ?? good.value };
    }
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
      const profile = getEconomyStartProfile(getWorldContext().options);
      const marketShare = rn(surplus * (1 - profile.stateRemittanceShare), 2);
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
