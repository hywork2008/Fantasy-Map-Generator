import type { Gender } from "../../characters/characterTypes";
import type { NobleHolding } from "./types";

/**
 * Display titles for a Gaelic holding. Mormaer and thane have no historical
 * feminine form, so both genders use the same word. Earl/Countess is the
 * high- and late-medieval rendering of dignity `count`.
 */
export function gaelicTitle(holding: Pick<NobleHolding, "office" | "dignity">, gender: Gender): string | null {
  if (holding.office === "sheriff") return "Sheriff";
  if (holding.office === "mormaer") return "Mormaer";
  if (holding.office === "thane") return "Thane";
  if (holding.dignity === "baron") return gender === "female" ? "Baroness" : "Baron";
  if (holding.dignity === "count") return gender === "female" ? "Countess" : "Earl";
  return null;
}

export function gaelicTitles(
  holding: Pick<NobleHolding, "office" | "dignity">
): { male: string; female: string } | null {
  const male = gaelicTitle(holding, "male");
  const female = gaelicTitle(holding, "female");
  if (!male || !female) return null;
  return { male, female };
}
