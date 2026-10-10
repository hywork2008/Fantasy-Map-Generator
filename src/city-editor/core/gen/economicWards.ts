import type { BurgSiteEconomy, GuildDomain, SiteGuild } from "./site/burgSiteEconomy";
import type { WardKind } from "./types";

/**
 * Inner-ward weights when a burg carries an economy profile.
 * Absent profile keeps the fixed 35-slot mix in wards.ts.
 * Craftsman streets follow practitioners. A guild with nobody working keeps its hall
 * and does not take a street. Merchant streets are 1–4 from commerce.rank.
 * A market center adds one market slot to the usual two.
 */

const CRAFT_SLOTS = 21;

export interface WardMixSlot {
  kind: WardKind;
  craftDomain?: GuildDomain;
}

export function merchantSlotCount(rank: number): number {
  if (!Number.isFinite(rank) || rank <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil(rank * 4)));
}

export function marketSlotCount(marketCenter: boolean): number {
  return marketCenter ? 3 : 2;
}

/** 21 craftsman slots. Null means an undifferentiated craftsman street. */
export function craftDomainsFor(guilds: readonly SiteGuild[]): Array<GuildDomain | null> {
  const totals = new Map<GuildDomain, number>();
  const order: GuildDomain[] = [];
  for (const guild of guilds) {
    if (!(guild.practitioners > 0)) continue;
    if (!totals.has(guild.domain)) order.push(guild.domain);
    totals.set(guild.domain, (totals.get(guild.domain) ?? 0) + guild.practitioners);
  }
  if (!order.length) return Array.from({ length: CRAFT_SLOTS }, () => null);
  const total = order.reduce((sum, domain) => sum + (totals.get(domain) ?? 0), 0);
  const exact = order.map(domain => ((totals.get(domain) ?? 0) / total) * CRAFT_SLOTS);
  const counts = exact.map(value => Math.floor(value));
  let left = CRAFT_SLOTS - counts.reduce((sum, count) => sum + count, 0);
  const rank = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const row of rank) {
    if (left <= 0) break;
    counts[row.index] += 1;
    left -= 1;
  }
  const slots: Array<GuildDomain | null> = [];
  for (let index = 0; index < order.length; index++) {
    for (let n = 0; n < counts[index]; n++) slots.push(order[index]);
  }
  return slots;
}

export function economyWardMix(economy: BurgSiteEconomy): WardMixSlot[] {
  const slots: WardMixSlot[] = [];
  for (const domain of craftDomainsFor(economy.guilds)) {
    slots.push(domain ? { kind: "craftsmen", craftDomain: domain } : { kind: "craftsmen" });
  }
  for (let n = 0; n < 5; n++) slots.push({ kind: "slum" });
  for (let n = 0; n < merchantSlotCount(economy.commerce.rank); n++) slots.push({ kind: "merchant" });
  slots.push({ kind: "patriciate" }, { kind: "patriciate" });
  for (let n = 0; n < marketSlotCount(economy.commerce.marketCenter); n++) slots.push({ kind: "market" });
  slots.push({ kind: "administration" }, { kind: "military" }, { kind: "park" });
  return slots;
}
