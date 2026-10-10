import type { CityDocument, HistoricalPeriod } from "../types";
import type { BurgSiteEconomy, GuildDomain, SiteGuild } from "./site/burgSiteEconomy";

/**
 * Guild halls and yards from a BurgSiteEconomy profile.
 * A formal chapter with zero craftsmen still gets its hall and yards.
 * The craftsman street (workshopWeight) is the only thing that scales with headcount.
 * docs/plan/fmg-economy-to-city-editor.md §7, decision 2026-10-10.
 */

const PERIOD_ORDER: HistoricalPeriod[] = [
  "classicalAntiquity",
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
];

/** Cloth-hall belfry: upper quartile of world prestige. */
export const GUILD_BELFRY_PRESTIGE = 0.75;

export type GuildAncillaryKind =
  | "bleachingField"
  | "tannery"
  | "timberYard"
  | "stoneYard"
  | "limeKiln"
  | "smithyYard"
  | "sandYard";

export interface PlannedGuildFacility {
  domain: GuildDomain;
  status: SiteGuild["status"];
  practitioners: number;
  /** Formal hall. False before high medieval, and for printing before the age of exploration. */
  hall: boolean;
  belfry: boolean;
  /** Zero when the guild has no craftsmen. Not a reason to skip the hall or yards. */
  workshopWeight: number;
  ancillary: GuildAncillaryKind[];
}

const ANCILLARY: Record<GuildDomain, readonly GuildAncillaryKind[]> = {
  textiles: ["bleachingField"],
  leather: ["tannery"],
  woodworking: ["timberYard"],
  masonry: ["stoneYard", "limeKiln"],
  metallurgy: ["smithyYard"],
  glassware: ["sandYard"],
  printing: [],
  instruments: []
};

function periodAtLeast(period: HistoricalPeriod, minimum: HistoricalPeriod): boolean {
  return PERIOD_ORDER.indexOf(period) >= PERIOD_ORDER.indexOf(minimum);
}

export function planGuildFacilities(
  economy: BurgSiteEconomy | undefined,
  period: HistoricalPeriod
): PlannedGuildFacility[] {
  if (!economy) return [];
  return economy.guilds.map(guild => {
    const hallEra =
      periodAtLeast(period, "highMedieval") &&
      (guild.domain !== "printing" || periodAtLeast(period, "ageOfExploration"));
    const hall = guild.status === "chapter" && hallEra;
    return {
      domain: guild.domain,
      status: guild.status,
      practitioners: guild.practitioners,
      hall,
      belfry: hall && guild.domain === "textiles" && guild.prestige >= GUILD_BELFRY_PRESTIGE,
      workshopWeight: guild.practitioners > 0 ? guild.practitioners : 0,
      ancillary: [...ANCILLARY[guild.domain]]
    };
  });
}

/** Without a profile, riverside towns keep the period tannery. With a profile, only a leather guild. */
export function wantsTannery(economy: BurgSiteEconomy | undefined, plan: readonly PlannedGuildFacility[]): boolean {
  if (!economy) return true;
  return plan.some(facility => facility.ancillary.includes("tannery"));
}

export function economyOnDocument(document: CityDocument): BurgSiteEconomy | undefined {
  return document.siteEconomy ?? document.fabric?.generation?.settings.descriptor?.economy;
}

export function siteEconomyKey(economy: BurgSiteEconomy | undefined): string {
  if (!economy) return "";
  const guilds = economy.guilds
    .map(guild => `${guild.domain}:${guild.status}:${guild.practitioners}:${guild.prestige.toFixed(3)}`)
    .join(",");
  const storage = economy.storage
    .map(
      yard =>
        `${yard.form}:${Math.round(yard.areaM2)}:${yard.waterborne ? "w" : "l"}:${yard.inflowAzimuthDeg ?? "-"}:${yard.supplyAzimuthDeg ?? "-"}:${yard.origin ?? "-"}`
    )
    .join(",");
  const lodging = economy.facilities.map(item => `${item.kind}:${item.count}:${item.stableSpaces}`).join(",");
  const mills = economy.mills ? `|${economy.mills.wind}:${economy.mills.water}` : "";
  return `${economy.year}|${guilds}|${storage}|${lodging}${mills}`;
}
